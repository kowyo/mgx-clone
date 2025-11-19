from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message_db import ProjectMessageDB
from app.models.project import (
    Project,
    ProjectStatus,
)
from app.models.project_db import ProjectDB
from app.models.project_message import (
    ProjectMessage,
    ProjectMessageRole,
    ProjectMessageStatus,
)


class ProjectNotFoundError(Exception):
    """Raised when a project identifier cannot be resolved."""

    def __init__(self, project_id: str):
        super().__init__(f"Project '{project_id}' was not found")
        self.project_id = project_id


class ProjectRepository:
    """Repository for Project and ProjectMessage database operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def _project_db_to_model(self, project_db: ProjectDB) -> Project:
        """Convert database model to domain model."""
        return Project(
            id=project_db.id,
            prompt=project_db.prompt,
            status=ProjectStatus(project_db.status),
            template=project_db.template,
            project_dir=project_db.project_dir,
            created_at=project_db.created_at,
            updated_at=project_db.updated_at,
            preview_url=project_db.preview_url,
            metadata=project_db.project_metadata or {},
        )

    def _message_db_to_model(self, message_db: ProjectMessageDB) -> ProjectMessage:
        return ProjectMessage(
            id=message_db.id,
            project_id=message_db.project_id,
            role=ProjectMessageRole(message_db.role),
            status=ProjectMessageStatus(message_db.status),
            content=message_db.content or "",
            parent_id=message_db.parent_id,
            metadata=message_db.message_metadata or {},
            created_at=message_db.created_at,
            updated_at=message_db.updated_at,
        )

    async def create_project(
        self,
        user_id: str,
        prompt: str,
        template: str | None,
        project_dir: str,
        project_id: str | None = None,
    ) -> Project:
        if project_id is None:
            project_id = uuid4().hex
        project_db = ProjectDB(
            id=project_id,
            user_id=user_id,
            prompt=prompt,
            template=template,
            project_dir=project_dir,
            status=ProjectStatus.PENDING.value,
            project_metadata={},
        )
        self.session.add(project_db)
        await self.session.commit()
        await self.session.refresh(project_db)
        return self._project_db_to_model(project_db)

    async def get_project(self, project_id: str, user_id: str | None = None) -> Project:
        query = select(ProjectDB).where(ProjectDB.id == project_id)
        if user_id:
            query = query.where(ProjectDB.user_id == user_id)

        result = await self.session.execute(query)
        project_db = result.scalar_one_or_none()

        if not project_db:
            raise ProjectNotFoundError(project_id)

        return self._project_db_to_model(project_db)

    async def list_user_projects(
        self, user_id: str, limit: int = 50, offset: int = 0
    ) -> list[Project]:
        result = await self.session.execute(
            select(ProjectDB)
            .where(ProjectDB.user_id == user_id)
            .order_by(ProjectDB.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        projects_db = result.scalars().all()
        return [self._project_db_to_model(p) for p in projects_db]

    async def update_project_status(self, project_id: str, status: ProjectStatus) -> Project:
        result = await self.session.execute(select(ProjectDB).where(ProjectDB.id == project_id))
        project_db = result.scalar_one_or_none()
        if not project_db:
            raise ProjectNotFoundError(project_id)

        project_db.status = status.value
        project_db.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(project_db)
        return self._project_db_to_model(project_db)

    async def update_project_preview_url(self, project_id: str, preview_url: str) -> Project:
        result = await self.session.execute(select(ProjectDB).where(ProjectDB.id == project_id))
        project_db = result.scalar_one_or_none()
        if not project_db:
            raise ProjectNotFoundError(project_id)

        project_db.preview_url = preview_url
        project_db.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(project_db)
        return self._project_db_to_model(project_db)

    async def update_project_prompt(self, project_id: str, prompt: str) -> Project:
        result = await self.session.execute(select(ProjectDB).where(ProjectDB.id == project_id))
        project_db = result.scalar_one_or_none()
        if not project_db:
            raise ProjectNotFoundError(project_id)

        project_db.prompt = prompt
        project_db.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(project_db)
        return self._project_db_to_model(project_db)

    async def _next_message_sequence(self, project_id: str) -> int:
        result = await self.session.execute(
            select(func.max(ProjectMessageDB.sequence)).where(
                ProjectMessageDB.project_id == project_id
            )
        )
        current = result.scalar()
        return (current or 0) + 1

    async def create_message(
        self,
        project_id: str,
        role: ProjectMessageRole,
        status: ProjectMessageStatus,
        content: str = "",
        parent_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ProjectMessage:
        sequence = await self._next_message_sequence(project_id)
        message_db = ProjectMessageDB(
            id=uuid4().hex,
            project_id=project_id,
            role=role.value,
            status=status.value,
            content=content,
            parent_id=parent_id,
            message_metadata=metadata or {},
            sequence=sequence,
        )
        self.session.add(message_db)
        await self.session.commit()
        await self.session.refresh(message_db)
        return self._message_db_to_model(message_db)

    async def list_messages(self, project_id: str) -> list[ProjectMessage]:
        result = await self.session.execute(
            select(ProjectMessageDB)
            .where(ProjectMessageDB.project_id == project_id)
            .order_by(ProjectMessageDB.sequence.asc())
        )
        return [self._message_db_to_model(m) for m in result.scalars().all()]

    async def update_message_content(self, message_id: str, content: str) -> ProjectMessage | None:
        result = await self.session.execute(
            select(ProjectMessageDB).where(ProjectMessageDB.id == message_id)
        )
        message_db = result.scalar_one_or_none()
        if message_db is None:
            return None
        message_db.content = content
        message_db.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(message_db)
        return self._message_db_to_model(message_db)

    async def update_message_status(
        self,
        message_id: str,
        status: ProjectMessageStatus,
        metadata: dict[str, Any] | None = None,
    ) -> ProjectMessage | None:
        result = await self.session.execute(
            select(ProjectMessageDB).where(ProjectMessageDB.id == message_id)
        )
        message_db = result.scalar_one_or_none()
        if message_db is None:
            return None
        message_db.status = status.value
        if metadata is not None:
            message_db.message_metadata = metadata
        message_db.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(message_db)
        return self._message_db_to_model(message_db)
