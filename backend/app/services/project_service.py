from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.config import settings
from app.models.api import ProjectFileEntry
from app.models.project import (
    Project,
    ProjectEvent,
    ProjectEventType,
    ProjectStatus,
)


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

    def __init__(self, base_dir: Path, history_limit: int = 500):
        self.base_dir = base_dir
        self._history_limit = history_limit
        self._projects: dict[str, Project] = {}
        self._subscribers: dict[str, list[asyncio.Queue[ProjectEvent]]] = {}
        self._history: dict[str, deque[ProjectEvent]] = {}
        self._lock = asyncio.Lock()

    async def startup(self) -> None:
        await asyncio.to_thread(self.base_dir.mkdir, parents=True, exist_ok=True)

    async def shutdown(self) -> None:
        async with self._lock:
            self._projects.clear()
            self._subscribers.clear()
            self._history.clear()

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
                relative = path.relative_to(project.project_dir)
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


project_manager = ProjectManager(settings.projects_root)
