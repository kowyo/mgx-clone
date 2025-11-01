from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.config import settings
from app.models.api import ProjectFileEntry
from app.models.project import (
    Project,
    ProjectEvent,
    ProjectEventType,
    ProjectStatus,
)
from app.services.claude_service import ClaudeService, ClaudeServiceUnavailable
from app.services.fallback_generator import FallbackGenerator


class ProjectNotFoundError(Exception):
    """Raised when a project identifier cannot be resolved."""

    def __init__(self, project_id: str):
        super().__init__(f"Project '{project_id}' was not found")
        self.project_id = project_id


@dataclass
class Subscription:
    queue: asyncio.Queue[ProjectEvent]
    history: list[ProjectEvent]


class ProjectManager:
    """Central coordinator for project metadata, events, and filesystem state."""

    def __init__(
        self,
        base_dir: Path,
        history_limit: int = 500,
        *,
        claude_service: ClaudeService | None = None,
        fallback_generator: FallbackGenerator | None = None,
    ):
        self.base_dir = base_dir
        self._history_limit = history_limit
        self._projects: dict[str, Project] = {}
        self._subscribers: dict[str, list[asyncio.Queue[ProjectEvent]]] = {}
        self._history: dict[str, deque[ProjectEvent]] = {}
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[Any]] = set()
        self._claude_service = claude_service or ClaudeService(settings.allowed_commands)
        self._fallback_generator = fallback_generator or FallbackGenerator()

    async def startup(self) -> None:
        await asyncio.to_thread(self.base_dir.mkdir, parents=True, exist_ok=True)

    async def shutdown(self) -> None:
        pending: list[asyncio.Task[Any]] = []
        async with self._lock:
            if self._tasks:
                pending = list(self._tasks)
                self._tasks.clear()
            self._projects.clear()
            self._subscribers.clear()
            self._history.clear()
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    async def create_project(self, prompt: str, template: str | None) -> Project:
        project_id = uuid4().hex
        project_dir = self.base_dir / project_id

        def _prepare_directories() -> None:
            (project_dir / "generated-app").mkdir(parents=True, exist_ok=True)

        await asyncio.to_thread(_prepare_directories)

        project = Project(
            id=project_id,
            prompt=prompt,
            template=template,
            project_dir=project_dir,
        )

        async with self._lock:
            self._projects[project_id] = project

        await self._publish_event(
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

    async def get_project(self, project_id: str) -> Project:
        async with self._lock:
            project = self._projects.get(project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    async def update_status(self, project_id: str, status_: ProjectStatus) -> Project:
        async with self._lock:
            project = self._projects.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)
            updated = project.model_copy(
                update={
                    "status": status_,
                    "updated_at": datetime.now(UTC),
                }
            )
            self._projects[project_id] = updated

        await self._publish_event(
            ProjectEvent(
                project_id=project_id,
                type=ProjectEventType.STATUS_UPDATED,
                message=f"Status changed to {status_.value}",
                payload={"status": status_.value},
            )
        )
        return updated

    async def set_preview_url(self, project_id: str, preview_url: str) -> Project:
        async with self._lock:
            project = self._projects.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)
            updated = project.model_copy(
                update={
                    "preview_url": preview_url,
                    "updated_at": datetime.now(UTC),
                }
            )
            self._projects[project_id] = updated

        await self._publish_event(
            ProjectEvent(
                project_id=project_id,
                type=ProjectEventType.PREVIEW_READY,
                message="Preview ready",
                payload={"preview_url": preview_url},
            )
        )
        return updated

    async def append_log(self, project_id: str, message: str) -> None:
        event = ProjectEvent(
            project_id=project_id,
            type=ProjectEventType.LOG_APPENDED,
            message=message,
        )
        await self._publish_event(event)

    async def list_files(self, project_id: str) -> list[ProjectFileEntry]:
        project = await self.get_project(project_id)
        root = project.project_dir / "generated-app"
        if not await asyncio.to_thread(root.exists):
            return []

        def _collect() -> list[ProjectFileEntry]:
            entries: list[ProjectFileEntry] = []
            for path in root.rglob("*"):
                relative = path.relative_to(root)
                stat_result = path.stat()
                entries.append(
                    ProjectFileEntry(
                        path=str(relative),
                        is_dir=path.is_dir(),
                        size=stat_result.st_size if path.is_file() else None,
                        updated_at=datetime.fromtimestamp(stat_result.st_mtime, UTC),
                    )
                )
            entries.sort(key=lambda item: item.path)
            return entries

        return await asyncio.to_thread(_collect)

    async def run_generation(self, project_id: str) -> asyncio.Task[None]:
        async def emit(message: str) -> None:
            await self.append_log(project_id, message)

        async def worker() -> None:
            try:
                project = await self.get_project(project_id)
            except ProjectNotFoundError:
                await emit("Project not found; aborting generation.")
                return

            await self.update_status(project_id, ProjectStatus.RUNNING)
            await emit("Starting project generation...")

            generation_root = project.project_dir / "generated-app"
            preview_path: str | None = None

            async def run_fallback(reason: str) -> str | None:
                await emit(reason)
                await emit("Falling back to local scaffold generator...")
                try:
                    outcome = await self._fallback_generator.generate(
                        generation_root,
                        project.prompt,
                    )
                except Exception as fallback_exc:  # pragma: no cover - defensive fallback
                    await self._publish_event(
                        ProjectEvent(
                            project_id=project_id,
                            type=ProjectEventType.ERROR,
                            message="Fallback generation failed",
                            payload={"detail": str(fallback_exc)},
                        )
                    )
                    await emit(f"Fallback generator failed: {fallback_exc}")
                    await self.update_status(project_id, ProjectStatus.FAILED)
                    return None

                await emit("Fallback generation completed.")
                return outcome.preview_path

            try:
                if self._claude_service and self._claude_service.is_available:
                    await emit("Invoking Claude service...")
                    outcome = await self._claude_service.generate(
                        prompt=project.prompt,
                        project_root=generation_root,
                        template=project.template,
                        emit=emit,
                    )
                    preview_path = outcome.preview_path
                    await emit("Claude generation finished.")
                else:
                    preview_path = await run_fallback(
                        "Claude service unavailable or not configured."
                    )
            except ClaudeServiceUnavailable as exc:
                preview_path = await run_fallback(f"Claude service unavailable: {exc}")
            except Exception as exc:  # pragma: no cover - defensive guard
                preview_path = await run_fallback(f"Claude generation error: {exc}")

            if preview_path is None:
                return

            preview_url = self._build_preview_url(project_id, preview_path)
            if preview_url:
                await self.set_preview_url(project_id, preview_url)

            await self.update_status(project_id, ProjectStatus.READY)
            await emit("Project ready.")

        task: asyncio.Task[None] = asyncio.create_task(
            worker(), name=f"project-generation:{project_id}"
        )
        await self.track_task(task)
        return task

    def _build_preview_url(self, project_id: str, preview_path: str | None) -> str | None:
        if not preview_path:
            return None
        normalized = preview_path.lstrip("/")
        return f"{settings.api_prefix}/projects/{project_id}/preview/{normalized}"

    async def subscribe(self, project_id: str) -> Subscription:
        queue: asyncio.Queue[ProjectEvent] = asyncio.Queue()
        async with self._lock:
            if project_id not in self._projects:
                raise ProjectNotFoundError(project_id)
            subscribers = self._subscribers.setdefault(project_id, [])
            subscribers.append(queue)
            history = list(self._history.get(project_id, []))
        return Subscription(queue=queue, history=history)

    async def unsubscribe(self, project_id: str, queue: asyncio.Queue[ProjectEvent]) -> None:
        async with self._lock:
            subscribers = self._subscribers.get(project_id)
            if not subscribers:
                return
            try:
                subscribers.remove(queue)
            except ValueError:  # queue already removed
                return
            if not subscribers:
                self._subscribers.pop(project_id, None)

    async def _publish_event(self, event: ProjectEvent) -> None:
        async with self._lock:
            history = self._history.get(event.project_id)
            if history is None:
                history = deque(maxlen=self._history_limit)
                self._history[event.project_id] = history
            history.append(event)
            subscribers = list(self._subscribers.get(event.project_id, []))

        for queue in subscribers:
            await queue.put(event)

    async def track_task(self, task: asyncio.Task[Any]) -> None:
        async with self._lock:
            self._tasks.add(task)
            task.add_done_callback(lambda finished: self._tasks.discard(finished))


project_manager = ProjectManager(settings.projects_root)
