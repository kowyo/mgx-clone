from __future__ import annotations

import asyncio

import pytest

from app.models.project import ProjectStatus
from app.services.fallback_generator import FallbackGenerator
from app.services.project_service import ProjectManager


class FakeClaudeService:
    def __init__(self, available: bool = False) -> None:
        self._available = available
        self.calls: list[tuple[str, ...]] = []

    @property
    def is_available(self) -> bool:  # pragma: no cover - trivial accessor
        return self._available

    async def generate(self, *args, **kwargs):  # pragma: no cover - should not be called
        self.calls.append(tuple(map(str, args)))
        raise AssertionError("Claude service should not be invoked in this test")


@pytest.mark.asyncio
async def test_run_generation_uses_fallback_when_claude_unavailable(tmp_path):
    manager = ProjectManager(
        base_dir=tmp_path,
        claude_service=FakeClaudeService(available=False),
        fallback_generator=FallbackGenerator(),
    )
    await manager.startup()

    try:
        project = await manager.create_project("Build a landing page", template=None)
        task = await manager.run_generation(project.id)
        await asyncio.wait_for(task, timeout=5)

        updated = await manager.get_project(project.id)
        assert updated.status == ProjectStatus.READY
        assert updated.preview_url is not None

        preview_path = updated.project_dir / "generated-app" / "index.html"
        assert preview_path.exists()
    finally:
        await manager.shutdown()