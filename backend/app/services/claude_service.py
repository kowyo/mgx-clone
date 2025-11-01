from __future__ import annotations

import os
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:  # pragma: no cover - import guarded for environments without SDK
    from claude_agent_sdk import ClaudeSDKClient
except ImportError:  # pragma: no cover - SDK not installed
    ClaudeSDKClient = None  # type: ignore[assignment]

from app.tools.builders import build_claude_options


@dataclass(slots=True)
class ClaudeGenerationOutcome:
    """Result payload describing the outcome of a Claude generation run."""

    preview_path: str | None = None


class ClaudeServiceUnavailable(RuntimeError):
    """Raised when the Claude Agent SDK cannot be used (e.g., missing API key)."""


class ClaudeService:
    """Thin wrapper around the Claude Agent SDK that streams logs via a callback."""

    def __init__(self, allowed_commands: Sequence[str]) -> None:
        self._allowed_commands = list(allowed_commands)

    @property
    def is_available(self) -> bool:
        return bool(os.getenv("ANTHROPIC_API_KEY"))

    async def generate(
        self,
        prompt: str,
        project_root: Path,
        template: str | None,
        emit: Callable[[str], Awaitable[None]],
    ) -> ClaudeGenerationOutcome:
        if not self.is_available:
            raise ClaudeServiceUnavailable("Claude API key is not configured")

        if ClaudeSDKClient is None:  # pragma: no cover - defensive guard
            raise ClaudeServiceUnavailable("Claude Agent SDK is not installed")

        options = build_claude_options(project_root, self._allowed_commands)
        async with ClaudeSDKClient(options=options) as client:  # type: ignore[arg-type]
            await client.query(self._compose_prompt(prompt, template))
            async for message in client.receive_response():
                text = self._format_message(message)
                if text:
                    await emit(text)
        return ClaudeGenerationOutcome(preview_path="index.html")

    def _compose_prompt(self, prompt: str, template: str | None) -> str:
        base_intro = (
            "You are Claude, an expert full-stack engineer. "
            "Follow best practices, structure the project cleanly, "
            "and ensure the app runs with pnpm. "
            "Always include a complete package.json with install and build scripts."
        )
        if template:
            return (
                f"{base_intro}\n"
                f"Build a complete {template} application based on the user's instructions.\n"
                f"User prompt: {prompt}"
            )
        return (
            f"{base_intro}\n"
            "Generate a fully working modern React, Vite, or Next.js application "
            "based on the user's instructions.\n"
            f"User prompt: {prompt}"
        )

    def _format_message(self, message: Any) -> str:
        message_type = type(message).__name__
        content = getattr(message, "content", None)
        if isinstance(content, list):
            texts = []
            for block in content:
                text = getattr(block, "text", None)
                if text:
                    texts.append(text)
            if texts:
                return "\n".join(texts)
        tool_name = getattr(message, "tool_name", None)
        if tool_name:
            args = getattr(message, "args", None)
            return f"[tool:{tool_name}] {args}"
        if hasattr(message, "event"):
            return f"[{message_type}] {message.event}"  # type: ignore[attr-defined]
        return f"[{message_type}]"
