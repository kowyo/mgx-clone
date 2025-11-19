from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from app.tools.command_adapter import CommandAdapter
from app.tools.exceptions import CommandTimeoutError


class BuildService:
    """Handles post-generation build steps like dependency installation."""

    def __init__(self, allowed_commands: list[str]):
        self.allowed_commands = allowed_commands

    async def run_post_generation_steps(
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
        if not package_exists:
            await emit("Warning: located package root but package.json is missing.")
            return None

        package_data: dict[str, Any] | None = None
        try:
            package_text = await asyncio.to_thread(
                package_json_path.read_text,
                encoding="utf-8",
            )
            package_data = json.loads(package_text)
        except Exception as exc:
            await emit(
                f"Warning: unable to parse package.json ({exc}); proceeding with pnpm install only."
            )

        adapter = CommandAdapter(package_root, self.allowed_commands)

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
                    f"Detected build artifact at {normalized}; using as preview entry point."
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
            text = f"{text[:limit]}\n[output]"
        return f"{label}:\n{text}"
