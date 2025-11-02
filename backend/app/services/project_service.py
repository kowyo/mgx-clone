from __future__ import annotations

import asyncio
import json
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.api import ProjectFileEntry
from app.models.project import (
    Project,
    ProjectEvent,
    ProjectEventType,
    ProjectStatus,
)
from app.models.project_db import ProjectDB
from app.services.claude_service import ClaudeService, ClaudeServiceUnavailable
from app.services.fallback_generator import FallbackGenerator
from app.tools.command_adapter import CommandAdapter
from app.tools.exceptions import CommandTimeoutError
from app.tools.file_adapter import FileAdapter


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

    def _project_db_to_model(self, project_db: ProjectDB) -> Project:
        """Convert database model to domain model."""
        return Project(
            id=project_db.id,
            prompt=project_db.prompt,
            status=ProjectStatus(project_db.status),
            template=project_db.template,
            project_dir=Path(project_db.project_dir),
            created_at=project_db.created_at,
            updated_at=project_db.updated_at,
            preview_url=project_db.preview_url,
            metadata=project_db.project_metadata or {},
        )

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

    async def create_project(
        self,
        user_id: str,
        prompt: str,
        template: str | None,
        db: AsyncSession,
    ) -> Project:
        project_id = uuid4().hex
        project_dir = self.base_dir / user_id / project_id

        def _prepare_directories() -> None:
            (project_dir / "generated-app").mkdir(parents=True, exist_ok=True)

        await asyncio.to_thread(_prepare_directories)

        # Create database record
        project_db = ProjectDB(
            id=project_id,
            user_id=user_id,
            prompt=prompt,
            template=template,
            project_dir=str(project_dir),
            status=ProjectStatus.PENDING.value,
            project_metadata={},
        )
        db.add(project_db)
        await db.commit()
        await db.refresh(project_db)

        project = self._project_db_to_model(project_db)

        # Cache in memory for quick access
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

    async def get_project(
        self, project_id: str, user_id: str | None = None, db: AsyncSession | None = None
    ) -> Project:
        # Try memory cache first
        async with self._lock:
            project = self._projects.get(project_id)
            if project:
                # Verify user ownership if user_id provided
                if user_id is None:
                    return project
                # We'll need to check in DB if user_id provided
                if db:
                    result = await db.execute(
                        select(ProjectDB).where(
                            ProjectDB.id == project_id, ProjectDB.user_id == user_id
                        )
                    )
                    project_db = result.scalar_one_or_none()
                    if project_db:
                        return project

        # Fallback to database
        if db:
            query = select(ProjectDB).where(ProjectDB.id == project_id)
            if user_id:
                query = query.where(ProjectDB.user_id == user_id)
            result = await db.execute(query)
            project_db = result.scalar_one_or_none()
            if project_db:
                project = self._project_db_to_model(project_db)
                async with self._lock:
                    self._projects[project_id] = project
                return project

        raise ProjectNotFoundError(project_id)

    async def update_status(
        self,
        project_id: str,
        status_: ProjectStatus,
        db: AsyncSession | None = None,
    ) -> Project:
        # Update in database if available
        if db:
            result = await db.execute(select(ProjectDB).where(ProjectDB.id == project_id))
            project_db = result.scalar_one_or_none()
            if project_db:
                project_db.status = status_.value
                project_db.updated_at = datetime.now(UTC)
                await db.commit()
                await db.refresh(project_db)
                project = self._project_db_to_model(project_db)
                async with self._lock:
                    self._projects[project_id] = project
        else:
            # Fallback to memory only
            async with self._lock:
                project = self._projects.get(project_id)
                if project is None:
                    raise ProjectNotFoundError(project_id)
                project = project.model_copy(
                    update={
                        "status": status_,
                        "updated_at": datetime.now(UTC),
                    }
                )
                self._projects[project_id] = project

        await self._publish_event(
            ProjectEvent(
                project_id=project_id,
                type=ProjectEventType.STATUS_UPDATED,
                message=f"Status changed to {status_.value}",
                payload={"status": status_.value},
            )
        )
        return project

    async def set_preview_url(
        self, project_id: str, preview_url: str, db: AsyncSession | None = None
    ) -> Project:
        # Update in database if available
        if db:
            result = await db.execute(select(ProjectDB).where(ProjectDB.id == project_id))
            project_db = result.scalar_one_or_none()
            if project_db:
                project_db.preview_url = preview_url
                project_db.updated_at = datetime.now(UTC)
                await db.commit()
                await db.refresh(project_db)
                project = self._project_db_to_model(project_db)
                async with self._lock:
                    self._projects[project_id] = project
        else:
            # Fallback to memory only
            async with self._lock:
                project = self._projects.get(project_id)
                if project is None:
                    raise ProjectNotFoundError(project_id)
                project = project.model_copy(
                    update={
                        "preview_url": preview_url,
                        "updated_at": datetime.now(UTC),
                    }
                )
                self._projects[project_id] = project

        await self._publish_event(
            ProjectEvent(
                project_id=project_id,
                type=ProjectEventType.PREVIEW_READY,
                message="Preview ready",
                payload={"preview_url": preview_url},
            )
        )
        return project

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
        adapter = FileAdapter(root)
        return await adapter.to_project_entries()

    async def list_user_projects(
        self, user_id: str, db: AsyncSession, limit: int = 50, offset: int = 0
    ) -> list[Project]:
        """List all projects for a user."""
        result = await db.execute(
            select(ProjectDB)
            .where(ProjectDB.user_id == user_id)
            .order_by(ProjectDB.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        projects_db = result.scalars().all()
        return [self._project_db_to_model(p) for p in projects_db]

    async def run_generation(
        self, project_id: str, db: AsyncSession | None = None
    ) -> asyncio.Task[None]:
        async def emit(message: str) -> None:
            await self.append_log(project_id, message)

        async def worker() -> None:
            try:
                project = await self.get_project(project_id)
            except ProjectNotFoundError:
                await emit("Project not found; aborting generation.")
                return

            await self.update_status(project_id, ProjectStatus.RUNNING, db)
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
                    await self.update_status(project_id, ProjectStatus.FAILED, db)
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

            try:
                override_preview = await self._run_post_generation_steps(
                    generation_root,
                    emit,
                )
            except Exception as exc:  # pragma: no cover - defensive guard
                await emit(f"Post-generation step failed: {exc}")
                await self.update_status(project_id, ProjectStatus.FAILED, db)
                return

            if override_preview:
                preview_path = override_preview

            preview_url = self._build_preview_url(project_id, preview_path)
            if preview_url:
                await self.set_preview_url(project_id, preview_url, db)

            await self.update_status(project_id, ProjectStatus.READY, db)
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

    async def _run_post_generation_steps(
        self,
        generation_root: Path,
        emit: Callable[[str], Awaitable[None]],
    ) -> str | None:
        package_root = await self._find_package_root(generation_root)
        if package_root is None:
            await emit(
                "No package.json found under generated-app; skipping dependency installation."
            )
            return None

        if package_root != generation_root:
            relative_root = package_root.relative_to(generation_root)
            await emit(
                "Detected package.json in subdirectory "
                f"'{relative_root.as_posix()}'. Using it as working directory."
            )

        package_json_path = package_root / "package.json"
        package_exists = await asyncio.to_thread(package_json_path.exists)
        if not package_exists:  # pragma: no cover - defensive guard
            await emit("Warning: located package root but package.json is missing.")
            return None

        package_data: dict[str, Any] | None = None
        try:
            package_text = await asyncio.to_thread(
                package_json_path.read_text,
                encoding="utf-8",
            )
            package_data = json.loads(package_text)
        except Exception as exc:  # pragma: no cover - defensive guard
            await emit(
                "Warning: unable to parse package.json "
                f"({exc}); proceeding with pnpm install only."
            )

        adapter = CommandAdapter(package_root, settings.allowed_commands)

        async def run_command(
            label: str,
            command: str,
            args: list[str],
            *,
            timeout: float = 900.0,
        ) -> None:
            await emit(f"{label}...")
            try:
                result = await adapter.run(command, args=args, timeout=timeout)
            except CommandTimeoutError as exc:
                await emit(f"{label} timed out after {int(timeout)} seconds.")
                raise exc

            stdout_message = self._format_command_output(f"{label} stdout", result.stdout)
            if stdout_message:
                await emit(stdout_message)

            stderr_message = self._format_command_output(f"{label} stderr", result.stderr)
            if stderr_message:
                await emit(stderr_message)

            if result.exit_code != 0:
                raise RuntimeError(f"{label} failed with exit code {result.exit_code}")

            await emit(f"{label} completed successfully.")

        await run_command("Running pnpm install", "pnpm", ["install"])

        scripts = package_data.get("scripts") if isinstance(package_data, dict) else None
        if isinstance(scripts, dict) and "build" in scripts:
            await run_command(
                "Running pnpm run build",
                "pnpm",
                ["run", "build"],
                timeout=900.0,
            )
        else:
            reason = "package.json is missing a build script"
            if package_data is None:
                reason = "package.json could not be parsed"
            await emit(f"Skipping pnpm run build because {reason}.")

        preview_candidates = [
            "dist/index.html",
            "build/index.html",
            "out/index.html",
            "index.html",
        ]

        prefix: Path | None = (
            None if package_root == generation_root else package_root.relative_to(generation_root)
        )

        for candidate in preview_candidates:
            candidate_path = package_root / candidate
            exists = await asyncio.to_thread(candidate_path.exists)
            if exists:
                relative_candidate = Path(candidate)
                if prefix is not None:
                    relative_candidate = prefix / candidate
                normalized = relative_candidate.as_posix()
                await emit(
                    "Detected build artifact at "
                    f"{normalized}; using as preview entry point."
                )
                return normalized

        return None

    async def _find_package_root(self, generation_root: Path) -> Path | None:
        skip_dirs = {"node_modules", ".pnpm", ".git"}

        def _search() -> Path | None:
            direct = generation_root / "package.json"
            if direct.exists():
                return generation_root

            candidates: list[tuple[int, str, Path]] = []
            for package_path in generation_root.glob("**/package.json"):
                try:
                    relative_parent = package_path.parent.relative_to(generation_root)
                except ValueError:
                    continue
                if not relative_parent.parts:
                    continue
                if any(part in skip_dirs for part in relative_parent.parts):
                    continue
                depth = len(relative_parent.parts)
                candidates.append((depth, relative_parent.as_posix(), package_path.parent))

            if not candidates:
                return None

            candidates.sort()
            return candidates[0][2]

        return await asyncio.to_thread(_search)

    @staticmethod
    def _format_command_output(
        label: str,
        output: str,
        *,
        limit: int = 4000,
    ) -> str | None:
        text = output.strip()
        if not text:
            return None
        if len(text) > limit:
            text = f"{text[:limit]}\n[output truncated]"
        return f"{label}:\n{text}"


project_manager = ProjectManager(settings.projects_root)
