from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest  # type: ignore[reportMissingImports]

import app.services.project_service as project_service
from app.models.project import ProjectStatus
from app.routes.projects import get_project_file_content
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
        claude_service=FakeClaudeService(available=False),  # type: ignore[arg-type]
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


@pytest.mark.asyncio
async def test_post_generation_runs_pnpm_install_and_build(monkeypatch, tmp_path):
    manager = ProjectManager(base_dir=tmp_path)

    generation_root = tmp_path / "proj" / "generated-app"
    generation_root.mkdir(parents=True)

    package_json = {
        "name": "demo-app",
        "scripts": {
            "build": "vite build",
        },
    }
    (generation_root / "package.json").write_text(
        json.dumps(package_json),
        encoding="utf-8",
    )

    dist_dir = generation_root / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<html></html>", encoding="utf-8")

    emitted: list[str] = []

    async def emit(message: str) -> None:
        emitted.append(message)

    calls: list[tuple[str, tuple[str, ...], float | None]] = []

    class StubAdapter:
        def __init__(self, base_dir, allowed_commands):
            assert base_dir == generation_root
            self.allowed_commands = allowed_commands

        async def run(self, command, *, args=None, cwd=None, env=None, timeout=None):
            calls.append((command, tuple(args or ()), timeout))
            return SimpleNamespace(stdout="done", stderr="", exit_code=0)

    monkeypatch.setattr(project_service, "CommandAdapter", StubAdapter)

    preview_path = await manager._run_post_generation_steps(generation_root, emit)

    assert preview_path == "dist/index.html"
    assert calls == [
        ("pnpm", ("install",), 900.0),
        ("pnpm", ("run", "build"), 900.0),
    ]
    assert any("Running pnpm install" in message for message in emitted)


@pytest.mark.asyncio
async def test_post_generation_detects_nested_package_json(monkeypatch, tmp_path):
    manager = ProjectManager(base_dir=tmp_path)

    generation_root = tmp_path / "proj" / "generated-app"
    package_root = generation_root / "todo-app"
    package_root.mkdir(parents=True)

    package_json = {
        "name": "todo-app",
        "scripts": {
            "build": "next build",
        },
    }
    (package_root / "package.json").write_text(
        json.dumps(package_json),
        encoding="utf-8",
    )

    dist_dir = package_root / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<html></html>", encoding="utf-8")

    emitted: list[str] = []

    async def emit(message: str) -> None:
        emitted.append(message)

    calls: list[tuple[str, tuple[str, ...], float | None]] = []
    adapter_roots: list[Path] = []

    class StubAdapter:
        def __init__(self, base_dir, allowed_commands):
            adapter_roots.append(base_dir)
            self.allowed_commands = allowed_commands

        async def run(self, command, *, args=None, cwd=None, env=None, timeout=None):
            calls.append((command, tuple(args or ()), timeout))
            return SimpleNamespace(stdout="done", stderr="", exit_code=0)

    monkeypatch.setattr(project_service, "CommandAdapter", StubAdapter)

    preview_path = await manager._run_post_generation_steps(generation_root, emit)

    assert adapter_roots == [package_root]
    assert preview_path == "todo-app/dist/index.html"
    assert calls == [
        ("pnpm", ("install",), 900.0),
        ("pnpm", ("run", "build"), 900.0),
    ]
    assert any("Detected package.json in subdirectory 'todo-app'" in msg for msg in emitted)
    assert any("todo-app/dist/index.html" in msg for msg in emitted)


@pytest.mark.asyncio
async def test_list_files_skips_node_modules(tmp_path):
    manager = ProjectManager(base_dir=tmp_path)
    await manager.startup()

    try:
        project = await manager.create_project("Build something", template=None)
        root = project.project_dir / "generated-app"

        src_dir = root / "todo-app" / "src"
        node_modules_dir = root / "todo-app" / "node_modules" / "react"
        src_dir.mkdir(parents=True)
        node_modules_dir.mkdir(parents=True)

        (src_dir / "App.jsx").write_text("export default () => null", encoding="utf-8")
        (node_modules_dir / "index.js").write_text("module.exports = {}", encoding="utf-8")

        files = await manager.list_files(project.id)

        paths = {entry.path for entry in files}
        assert "todo-app/src/App.jsx" in paths
        assert all("node_modules" not in path for path in paths)
    finally:
        await manager.shutdown()


@pytest.mark.asyncio
async def test_get_project_file_content_handles_symlink(tmp_path):
    real_root = tmp_path / "real"
    real_root.mkdir()
    symlink_root = tmp_path / "link"
    symlink_root.symlink_to(real_root, target_is_directory=True)

    manager = ProjectManager(base_dir=symlink_root)
    await manager.startup()

    try:
        project = await manager.create_project("Test symlink project", template=None)
        file_path = project.project_dir / "generated-app" / "todo-app" / "src"
        file_path.mkdir(parents=True)
        (file_path / "App.jsx").write_text("export default () => null", encoding="utf-8")

        response = await get_project_file_content(
            project.id,
            "todo-app/src/App.jsx",
            manager,
        )

        assert response.status_code == 200
        assert "export default" in response.body.decode()
    finally:
        await manager.shutdown()