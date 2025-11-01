from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

from claude_agent_sdk import ClaudeAgentOptions, create_sdk_mcp_server, tool

from .command_adapter import CommandAdapter
from .file_adapter import FileAdapter


def _text_response(payload: str, *, metadata: dict[str, object] | None = None) -> dict[str, object]:
    response: dict[str, object] = {
        "content": [
            {
                "type": "text",
                "text": payload,
            }
        ]
    }
    if metadata:
        response["metadata"] = metadata
    return response


def build_file_tools(project_root: Path) -> list[object]:
    adapter = FileAdapter(project_root)

    @tool(
        "read_file",
        "Read a UTF-8 encoded file within the project sandbox.",
        {"path": str},
    )
    async def read_file(args: dict[str, str]):
        content = await adapter.read_text(args["path"])
        return _text_response(content)

    @tool(
        "write_file",
        "Create or overwrite a UTF-8 file within the project sandbox.",
        {"path": str, "content": str, "overwrite": bool},
    )
    async def write_file(args: dict[str, object]):
        path = str(args["path"])
        content = str(args["content"])
        overwrite = bool(args.get("overwrite", True))
        await adapter.write_text(path, content, overwrite=overwrite)
        return _text_response(f"Wrote file {path}")

    @tool(
        "create_directory",
        "Create a directory (and parents) within the project sandbox.",
        {"path": str},
    )
    async def create_directory(args: dict[str, str]):
        path = str(args["path"])
        await adapter.create_directory(path)
        return _text_response(f"Created directory {path}")

    @tool(
        "list_directory",
        "List files within the project sandbox.",
        {"path": str | None},
    )
    async def list_directory(args: dict[str, object]):
        raw_path = args.get("path")
        relative_path = None if raw_path is None else str(raw_path)
        entries = await adapter.list_directory(relative_path)
        payload = json.dumps([entry.__dict__ for entry in entries], default=str, indent=2)
        return _text_response(payload)

    return [read_file, write_file, create_directory, list_directory]


def build_command_tools(project_root: Path, allowed_commands: Sequence[str]) -> list[object]:
    adapter = CommandAdapter(project_root, allowed_commands)

    @tool(
        "run_command",
        "Execute a whitelisted shell command within the project sandbox.",
        {
            "command": str,
            "args": list[str] | None,
            "cwd": str | None,
            "timeout": float | None,
        },
    )
    async def run_command(args: dict[str, object]):
        command = str(args["command"])
        raw_args = args.get("args")
        command_args: Sequence[str] | None
        if raw_args is None:
            command_args = None
        elif isinstance(raw_args, (list, tuple)):
            command_args = [str(item) for item in raw_args]
        else:
            command_args = [str(raw_args)]
        cwd = args.get("cwd")
        relative_cwd = None if cwd is None else str(cwd)
        timeout_arg = args.get("timeout")
        timeout = float(timeout_arg) if timeout_arg is not None else None
        result = await adapter.run(
            command,
            args=command_args,
            cwd=relative_cwd,
            timeout=timeout,
        )
        payload = json.dumps(
            {
                "command": result.command,
                "args": list(result.args),
                "exit_code": result.exit_code,
                "stdout": result.stdout,
                "stderr": result.stderr,
            },
            indent=2,
        )
        return _text_response(payload, metadata={"exit_code": result.exit_code})

    return [run_command]


def build_tool_server(project_root: Path, allowed_commands: Sequence[str]):
    return create_sdk_mcp_server(
        name="claude-app-builder-tools",
        version="0.1.0",
        tools=[
            *build_file_tools(project_root),
            *build_command_tools(project_root, allowed_commands),
        ],
    )


def build_claude_options(project_root: Path, allowed_commands: Sequence[str]) -> ClaudeAgentOptions:
    server = build_tool_server(project_root, allowed_commands)
    return ClaudeAgentOptions(
        mcp_servers={"claude-app-builder": server},
        allowed_tools=[
            "mcp__claude-app-builder__read_file",
            "mcp__claude-app-builder__write_file",
            "mcp__claude-app-builder__create_directory",
            "mcp__claude-app-builder__list_directory",
            "mcp__claude-app-builder__run_command",
        ],
        permission_mode="acceptEdits",
        cwd=str(project_root),
    )
