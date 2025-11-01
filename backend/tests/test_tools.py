from __future__ import annotations

import sys

import pytest  # type: ignore[import]

from app.tools.command_adapter import CommandAdapter
from app.tools.exceptions import CommandValidationError, PathValidationError
from app.tools.file_adapter import FileAdapter


@pytest.mark.asyncio
async def test_file_adapter_read_write(tmp_path):
    adapter = FileAdapter(tmp_path)
    await adapter.write_text("src/app.txt", "hello world")
    content = await adapter.read_text("src/app.txt")
    assert content == "hello world"

    listings = await adapter.list_directory()
    paths = {entry.path for entry in listings}
    assert "src" in paths or "src/app.txt" in paths


@pytest.mark.asyncio
async def test_file_adapter_prevents_escape(tmp_path):
    adapter = FileAdapter(tmp_path)
    with pytest.raises(PathValidationError):
        await adapter.write_text("../escape.txt", "blocked")


@pytest.mark.asyncio
async def test_command_adapter_executes_allowed(tmp_path):
    adapter = CommandAdapter(tmp_path, allowed_commands=[sys.executable])
    result = await adapter.run(sys.executable, args=["-c", "print('ok')"], cwd=None)
    assert result.exit_code == 0
    assert "ok" in result.stdout
    assert result.stderr == ""


@pytest.mark.asyncio
async def test_command_adapter_blocks_disallowed(tmp_path):
    adapter = CommandAdapter(tmp_path, allowed_commands=[sys.executable])
    with pytest.raises(CommandValidationError):
        await adapter.run("echo")
