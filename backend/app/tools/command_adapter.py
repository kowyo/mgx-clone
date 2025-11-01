from __future__ import annotations

import asyncio
import os
from asyncio.subprocess import PIPE
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from .exceptions import CommandTimeoutError, CommandValidationError
from .path_utils import resolve_project_path


@dataclass(slots=True)
class CommandResult:
    command: str
    args: tuple[str, ...]
    exit_code: int
    stdout: str
    stderr: str


class CommandAdapter:
    """Async helper that runs sandboxed commands with a whitelist."""

    def __init__(
        self,
        base_dir: Path,
        allowed_commands: Sequence[str],
    ) -> None:
        self._base_dir = base_dir.resolve()
        self._allowed = {command for command in allowed_commands}

    def _validate_command(self, command: str) -> None:
        if command not in self._allowed:
            raise CommandValidationError(f"Command '{command}' is not allowed")

    def _resolve_cwd(self, relative_path: str | None) -> Path:
        if relative_path is None:
            return self._base_dir
        return resolve_project_path(self._base_dir, relative_path)

    async def run(
        self,
        command: str,
        *,
        args: Sequence[str] | None = None,
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = 120.0,
    ) -> CommandResult:
        self._validate_command(command)
        working_dir = self._resolve_cwd(cwd)
        process_env = os.environ.copy()
        if env:
            process_env.update(env)
        process = await asyncio.create_subprocess_exec(
            command,
            *(args or []),
            stdout=PIPE,
            stderr=PIPE,
            cwd=str(working_dir),
            env=process_env,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout)
        except TimeoutError as exc:
            process.kill()
            raise CommandTimeoutError(
                f"Command '{command}' timed out after {timeout} seconds"
            ) from exc
        exit_code = process.returncode if process.returncode is not None else -1
        return CommandResult(
            command=command,
            args=tuple(args or []),
            exit_code=exit_code,
            stdout=stdout_bytes.decode(),
            stderr=stderr_bytes.decode(),
        )
