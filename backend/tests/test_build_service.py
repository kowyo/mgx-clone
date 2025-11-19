import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import app.services.build_service as build_service_module
from app.services.build_service import BuildService


@pytest.mark.asyncio
async def test_post_generation_runs_pnpm_install_and_build(monkeypatch, tmp_path):
    service = BuildService(allowed_commands=["pnpm"])

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

    monkeypatch.setattr(build_service_module, "CommandAdapter", StubAdapter)

    preview_path = await service.run_post_generation_steps(generation_root, emit)

    assert preview_path == "dist/index.html"
    assert calls == [
        ("pnpm", ("install",), 900.0),
        ("pnpm", ("run", "build"), 900.0),
    ]
    assert any("Running pnpm install" in message for message in emitted)


@pytest.mark.asyncio
async def test_post_generation_detects_nested_package_json(monkeypatch, tmp_path):
    service = BuildService(allowed_commands=["pnpm"])

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

    monkeypatch.setattr(build_service_module, "CommandAdapter", StubAdapter)

    preview_path = await service.run_post_generation_steps(generation_root, emit)

    assert adapter_roots == [package_root]
    assert preview_path == "todo-app/dist/index.html"
    assert calls == [
        ("pnpm", ("install",), 900.0),
        ("pnpm", ("run", "build"), 900.0),
    ]
    assert any("Detected package.json in subdirectory 'todo-app'" in msg for msg in emitted)
    assert any("todo-app/dist/index.html" in msg for msg in emitted)
