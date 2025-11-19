from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.api import ProjectFileEntry
from app.models.project import (
    Project,
    ProjectEvent,
    ProjectEventType,
    ProjectStatus,
)
from app.models.project_message import (
    ProjectMessage,
    ProjectMessageRole,
    ProjectMessageStatus,
)
from app.repositories.project_repository import ProjectNotFoundError, ProjectRepository
from app.services.build_service import BuildService
from app.services.claude_service import ClaudeService, ClaudeServiceUnavailable
from app.services.fallback_generator import FallbackGenerator
from app.services.notification_service import NotificationService
from app.services.preview_service import PreviewService
from app.services.task_service import TaskService
from app.tools.file_adapter import FileAdapter


class ProjectService:
    """Coordinator for project operations, delegating to specialized services."""

    def __init__(
        self,
        repository: ProjectRepository,
        notification_service: NotificationService,
        task_service: TaskService,
        build_service: BuildService,
        preview_service: PreviewService,
        claude_service: ClaudeService,
        fallback_generator: FallbackGenerator,
        session_factory: async_sessionmaker[AsyncSession],
        base_dir: Path,
    ):
        self.repository = repository
        self.notification_service = notification_service
        self.task_service = task_service
        self.build_service = build_service
        self.preview_service = preview_service
        self.claude_service = claude_service
        self.fallback_generator = fallback_generator
        self.session_factory = session_factory
        self.base_dir = base_dir

    async def create_project(
        self,
        user_id: str,
        prompt: str,
        template: str | None,
    ) -> Project:
        project_id = uuid4().hex
        project_dir = self.base_dir / user_id / project_id

        def _prepare_directories() -> None:
            (project_dir / "generated-app").mkdir(parents=True, exist_ok=True)

        await asyncio.to_thread(_prepare_directories)

        project = await self.repository.create_project(
            user_id=user_id,
            prompt=prompt,
            template=template,
            project_dir=str(project_dir),
            project_id=project_id,
        )

        await self.notification_service.publish_event(
            ProjectEvent(
                project_id=project_id,
                type=ProjectEventType.PROJECT_CREATED,
                message="Project created",
                payload={
                    "status": project.status,
                    "template": template,
                },
            )
        )

        return project

    async def get_project(self, project_id: str, user_id: str | None = None) -> Project:
        return await self.repository.get_project(project_id, user_id)

    async def list_user_projects(
        self, user_id: str, limit: int = 50, offset: int = 0
    ) -> list[Project]:
        return await self.repository.list_user_projects(user_id, limit, offset)

    async def list_files(self, project_id: str) -> list[ProjectFileEntry]:
        project = await self.get_project(project_id)
        root = project.project_dir / "generated-app"
        if not await asyncio.to_thread(root.exists):
            return []
        adapter = FileAdapter(root)
        return await adapter.to_project_entries()

    async def list_messages(self, project_id: str) -> list[ProjectMessage]:
        return await self.repository.list_messages(project_id)

    async def record_user_message(
        self,
        project_id: str,
        content: str,
    ) -> ProjectMessage:
        return await self.repository.create_message(
            project_id=project_id,
            role=ProjectMessageRole.USER,
            status=ProjectMessageStatus.COMPLETE,
            content=content,
        )

    async def update_status(self, project_id: str, status: ProjectStatus) -> Project:
        project = await self.repository.update_project_status(project_id, status)
        await self.notification_service.publish_event(
            ProjectEvent(
                project_id=project_id,
                type=ProjectEventType.STATUS_UPDATED,
                message=f"Status changed to {status.value}",
                payload={"status": status.value},
            )
        )
        return project

    async def run_generation(
        self,
        project_id: str,
        *,
        prompt_override: str | None = None,
        user_message_id: str | None = None,
        assistant_intro: str = "",
    ) -> asyncio.Task[None]:
        # We need to capture the necessary context for the background task
        # The background task will create its own session and repository

        async def worker() -> None:
            async with self.session_factory() as session:
                repo = ProjectRepository(session)

                assistant_message_id: str | None = None
                assistant_content: str = ""
                result_metadata: dict[str, Any] | None = None
                message_completed = False
                message_failed = False

                def merge_content(existing: str, addition: str, *, separator: str = "\n") -> str:
                    text = (addition or "").strip()
                    if not text:
                        return existing
                    if not existing:
                        return text
                    return f"{existing}{separator}{text}".strip()

                async def persist_content() -> None:
                    if assistant_message_id:
                        await repo.update_message_content(assistant_message_id, assistant_content)

                async def persist_status(
                    status: ProjectMessageStatus,
                    metadata: dict[str, Any] | None = None,
                ) -> None:
                    nonlocal result_metadata, message_completed, message_failed
                    if status == ProjectMessageStatus.COMPLETE:
                        message_completed = True
                        if metadata is not None:
                            result_metadata = metadata
                    elif status == ProjectMessageStatus.ERROR:
                        message_failed = True

                    payload = metadata if metadata is not None else result_metadata
                    if assistant_message_id:
                        await repo.update_message_status(
                            assistant_message_id,
                            status,
                            metadata=payload,
                        )

                async def emit_log(message: str) -> None:
                    await self.notification_service.publish_event(
                        ProjectEvent(
                            project_id=project_id,
                            type=ProjectEventType.LOG_APPENDED,
                            message=message,
                        )
                    )

                async def emit_claude_message(event_data: dict[str, Any]) -> None:
                    nonlocal assistant_content, result_metadata
                    event_type = event_data.get("type")
                    payload = event_data.get("payload", {})

                    if event_type == "assistant_message":
                        text = payload.get("text")
                        if isinstance(text, str) and text.strip():
                            assistant_content = merge_content(
                                assistant_content, text, separator="\n"
                            )
                            await persist_content()
                    elif event_type == "tool_use":
                        tool_name = payload.get("name") or "tool"
                        tool_input = payload.get("input")
                        details = ""
                        if tool_input is not None:
                            try:
                                serialized = json.dumps(tool_input, indent=2)
                            except TypeError:
                                serialized = str(tool_input)
                            details = f":\n```json\n{serialized}\n```"
                        tool_message = f"Tool use {tool_name}{details}"
                        assistant_content = merge_content(
                            assistant_content, tool_message, separator="\n\n"
                        )
                        await persist_content()
                    elif event_type == "result_message":
                        cost = payload.get("total_cost_usd")
                        usage = payload.get("usage") or {}
                        summary_parts: list[str] = []
                        if isinstance(cost, (int, float)):
                            summary_parts.append(f"cost ${cost:.4f}")
                        input_tokens = usage.get("input_tokens")
                        output_tokens = usage.get("output_tokens")
                        if isinstance(input_tokens, int) and isinstance(output_tokens, int):
                            summary_parts.append(
                                f"{input_tokens} input + {output_tokens} output tokens"
                            )
                        elif isinstance(input_tokens, int):
                            summary_parts.append(f"{input_tokens} input tokens")
                        elif isinstance(output_tokens, int):
                            summary_parts.append(f"{output_tokens} output tokens")
                        summary = "Complete"
                        if summary_parts:
                            summary = f"Complete ({', '.join(summary_parts)})"
                        assistant_content = merge_content(
                            assistant_content, summary, separator="\n\n"
                        )
                        await persist_content()
                        await persist_status(ProjectMessageStatus.COMPLETE, payload)

                    if event_type == "assistant_message":
                        await self.notification_service.publish_event(
                            ProjectEvent(
                                project_id=project_id,
                                type=ProjectEventType.ASSISTANT_MESSAGE,
                                message=None,
                                payload=payload,
                            )
                        )
                    elif event_type == "tool_use":
                        await self.notification_service.publish_event(
                            ProjectEvent(
                                project_id=project_id,
                                type=ProjectEventType.TOOL_USE,
                                message=None,
                                payload=payload,
                            )
                        )
                    elif event_type == "result_message":
                        await self.notification_service.publish_event(
                            ProjectEvent(
                                project_id=project_id,
                                type=ProjectEventType.RESULT_MESSAGE,
                                message=None,
                                payload=payload,
                            )
                        )

                try:
                    project = await repo.get_project(project_id)
                except ProjectNotFoundError:
                    await emit_log("Project not found; aborting generation.")
                    # Can't persist status if project not found,
                    # but maybe we can if we have message ID?
                    # But we don't have message ID yet.
                    return

                intro_text = (assistant_intro or "").strip()

                placeholder = await repo.create_message(
                    project_id=project_id,
                    role=ProjectMessageRole.ASSISTANT,
                    status=ProjectMessageStatus.PENDING,
                    content=intro_text,
                    parent_id=user_message_id,
                )
                assistant_message_id = placeholder.id
                assistant_content = placeholder.content

                effective_prompt = prompt_override or project.prompt
                if prompt_override:
                    project = await repo.update_project_prompt(project_id, prompt_override)
                else:
                    project = project.model_copy(update={"prompt": effective_prompt})

                await repo.update_project_status(project_id, ProjectStatus.RUNNING)
                await self.notification_service.publish_event(
                    ProjectEvent(
                        project_id=project_id,
                        type=ProjectEventType.STATUS_UPDATED,
                        message=f"Status changed to {ProjectStatus.RUNNING.value}",
                        payload={"status": ProjectStatus.RUNNING.value},
                    )
                )

                await emit_log("Starting project generation...")

                generation_root = project.project_dir / "generated-app"
                preview_path: str | None = None

                async def run_fallback(reason: str) -> str | None:
                    nonlocal assistant_content
                    reason_text = reason.strip()
                    if reason_text:
                        assistant_content = merge_content(
                            assistant_content,
                            reason_text,
                            separator="\n\n",
                        )
                        await persist_content()
                    await emit_log(reason)
                    await emit_log("Falling back to local scaffold generator...")
                    assistant_content = merge_content(
                        assistant_content,
                        "Using local scaffold generator",
                        separator="\n\n",
                    )
                    await persist_content()
                    try:
                        outcome = await self.fallback_generator.generate(
                            generation_root,
                            effective_prompt,
                        )
                    except Exception as fallback_exc:
                        error_detail = str(fallback_exc)
                        assistant_content = merge_content(
                            assistant_content,
                            f"Fallback generation failed: {error_detail}",
                            separator="\n\n",
                        )
                        await persist_content()
                        await persist_status(ProjectMessageStatus.ERROR, {"error": error_detail})
                        await self.notification_service.publish_event(
                            ProjectEvent(
                                project_id=project_id,
                                type=ProjectEventType.ERROR,
                                message="Fallback generation failed",
                                payload={"detail": error_detail},
                            )
                        )
                        await emit_log(f"Fallback generator failed: {error_detail}")
                        await repo.update_project_status(project_id, ProjectStatus.FAILED)
                        await self.notification_service.publish_event(
                            ProjectEvent(
                                project_id=project_id,
                                type=ProjectEventType.STATUS_UPDATED,
                                message=f"Status changed to {ProjectStatus.FAILED.value}",
                                payload={"status": ProjectStatus.FAILED.value},
                            )
                        )
                        return None

                    assistant_content = merge_content(
                        assistant_content,
                        "Fallback generation completed.",
                        separator="\n\n",
                    )
                    await persist_content()
                    return outcome.preview_path

                try:
                    if self.claude_service and self.claude_service.is_available:
                        await emit_log("Invoking Claude service...")
                        outcome = await self.claude_service.generate(
                            prompt=effective_prompt,
                            project_root=generation_root,
                            template=project.template,
                            emit=emit_claude_message,
                        )
                        preview_path = outcome.preview_path
                        await emit_log("Claude generation finished.")
                    else:
                        preview_path = await run_fallback(
                            "Claude service unavailable or not configured."
                        )
                except ClaudeServiceUnavailable as exc:
                    preview_path = await run_fallback(f"Claude service unavailable: {exc}")
                except Exception as exc:
                    preview_path = await run_fallback(f"Claude generation error: {exc}")

                if preview_path is None:
                    if not message_failed:
                        assistant_content = merge_content(
                            assistant_content,
                            "Generation failed.",
                            separator="\n\n",
                        )
                        await persist_content()
                        await persist_status(
                            ProjectMessageStatus.ERROR, {"error": "generation_failed"}
                        )
                        await repo.update_project_status(project_id, ProjectStatus.FAILED)
                        await self.notification_service.publish_event(
                            ProjectEvent(
                                project_id=project_id,
                                type=ProjectEventType.STATUS_UPDATED,
                                message=f"Status changed to {ProjectStatus.FAILED.value}",
                                payload={"status": ProjectStatus.FAILED.value},
                            )
                        )
                    return

                try:
                    override_preview = await self.build_service.run_post_generation_steps(
                        generation_root,
                        emit_log,
                    )
                except Exception as exc:
                    assistant_content = merge_content(
                        assistant_content,
                        f"Post-generation step failed: {exc}",
                        separator="\n\n",
                    )
                    await persist_content()
                    await persist_status(ProjectMessageStatus.ERROR, {"error": str(exc)})
                    await emit_log(f"Post-generation step failed: {exc}")
                    await repo.update_project_status(project_id, ProjectStatus.FAILED)
                    await self.notification_service.publish_event(
                        ProjectEvent(
                            project_id=project_id,
                            type=ProjectEventType.STATUS_UPDATED,
                            message=f"Status changed to {ProjectStatus.FAILED.value}",
                            payload={"status": ProjectStatus.FAILED.value},
                        )
                    )
                    return

                if override_preview:
                    preview_path = override_preview

                preview_url = self.preview_service.build_preview_url(project_id, preview_path)
                if preview_url:
                    await repo.update_project_preview_url(project_id, preview_url)
                    await self.notification_service.publish_event(
                        ProjectEvent(
                            project_id=project_id,
                            type=ProjectEventType.PREVIEW_READY,
                            message="Preview ready",
                            payload={"preview_url": preview_url},
                        )
                    )

                await repo.update_project_status(project_id, ProjectStatus.READY)
                await self.notification_service.publish_event(
                    ProjectEvent(
                        project_id=project_id,
                        type=ProjectEventType.STATUS_UPDATED,
                        message=f"Status changed to {ProjectStatus.READY.value}",
                        payload={"status": ProjectStatus.READY.value},
                    )
                )

                if not message_completed and not message_failed:
                    assistant_content = merge_content(
                        assistant_content,
                        "Generation complete.",
                        separator="\n\n",
                    )
                    await persist_content()
                    await persist_status(ProjectMessageStatus.COMPLETE)

                await emit_log("Project ready.")

        task: asyncio.Task[None] = asyncio.create_task(
            worker(), name=f"project-generation:{project_id}"
        )
        await self.task_service.track_task(task)
        return task
