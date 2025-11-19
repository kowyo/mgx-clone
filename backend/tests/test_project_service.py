from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.project import ProjectStatus
from app.models.project_db import Base
from app.repositories.project_repository import ProjectRepository
from app.services.build_service import BuildService
from app.services.claude_service import ClaudeService
from app.services.fallback_generator import FallbackGenerator
from app.services.notification_service import NotificationService
from app.services.preview_service import PreviewService
from app.services.project_service import ProjectService
from app.services.task_service import TaskService


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def session_factory(db_session):
    # Mock session factory to return the same session or a new one
    # For simplicity in tests, we can use a mock that returns an async context manager
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__.return_value = db_session
    mock_factory.return_value.__aexit__.return_value = None
    return mock_factory


@pytest.mark.asyncio
async def test_create_project(tmp_path, db_session, session_factory):
    repo = ProjectRepository(db_session)
    notification_service = NotificationService()
    task_service = TaskService()
    build_service = BuildService([])
    preview_service = PreviewService("/api")
    claude_service = MagicMock(spec=ClaudeService)
    fallback_generator = MagicMock(spec=FallbackGenerator)

    service = ProjectService(
        repository=repo,
        notification_service=notification_service,
        task_service=task_service,
        build_service=build_service,
        preview_service=preview_service,
        claude_service=claude_service,
        fallback_generator=fallback_generator,
        session_factory=session_factory,
        base_dir=tmp_path,
    )

    project = await service.create_project("user1", "Test prompt", None)

    assert project.prompt == "Test prompt"
    assert project.status == ProjectStatus.PENDING
    assert (tmp_path / "user1" / project.id / "generated-app").exists()

    # Verify it's in DB
    saved = await repo.get_project(project.id)
    assert saved.id == project.id


@pytest.mark.asyncio
async def test_run_generation(tmp_path, db_session, session_factory):
    repo = ProjectRepository(db_session)
    notification_service = NotificationService()
    task_service = TaskService()
    build_service = BuildService([])
    preview_service = PreviewService("/api")

    claude_service = MagicMock(spec=ClaudeService)
    claude_service.is_available = True
    claude_service.generate = AsyncMock()
    claude_service.generate.return_value.preview_path = "index.html"

    fallback_generator = MagicMock(spec=FallbackGenerator)

    service = ProjectService(
        repository=repo,
        notification_service=notification_service,
        task_service=task_service,
        build_service=build_service,
        preview_service=preview_service,
        claude_service=claude_service,
        fallback_generator=fallback_generator,
        session_factory=session_factory,
        base_dir=tmp_path,
    )

    project = await service.create_project("user1", "Test prompt", None)

    # Mock build service to return a preview path
    build_service.run_post_generation_steps = AsyncMock(return_value="index.html")

    # Mock preview service
    preview_service.build_preview_url = MagicMock(
        return_value="/api/projects/p1/preview/index.html"
    )

    task = await service.run_generation(project.id)
    await task

    updated = await repo.get_project(project.id)
    assert updated.status == ProjectStatus.READY
    assert updated.preview_url == "/api/projects/p1/preview/index.html"
