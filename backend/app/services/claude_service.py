from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:  # pragma: no cover - import guarded for environments without SDK
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeSDKClient,
        ResultMessage,
        TextBlock,
        ToolUseBlock,
    )
except ImportError:  # pragma: no cover - SDK not installed
    ClaudeSDKClient = None  # type: ignore[assignment]
    AssistantMessage = None  # type: ignore[assignment,misc]
    ResultMessage = None  # type: ignore[assignment,misc]
    TextBlock = None  # type: ignore[assignment,misc]
    ToolUseBlock = None  # type: ignore[assignment,misc]

from app.tools.builders import build_claude_options


@dataclass(slots=True)
class ClaudeGenerationOutcome:
    """Result payload describing the outcome of a Claude generation run."""

    preview_path: str | None = None


class ClaudeServiceUnavailable(RuntimeError):
    """Raised when the Claude Agent SDK cannot be used (e.g., missing API key)."""


class ClaudeService:
    """Thin wrapper around the Claude Agent SDK that streams messages via a callback."""

    def __init__(self) -> None:
        pass

    @property
    def is_available(self) -> bool:
        return bool(os.getenv("ANTHROPIC_API_KEY"))

    async def generate(
        self,
        prompt: str,
        project_root: Path,
        template: str | None,
        emit: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> ClaudeGenerationOutcome:
        """Generate code using Claude Agent SDK and emit structured messages."""
        if not self.is_available:
            raise ClaudeServiceUnavailable("Claude API key is not configured")

        if ClaudeSDKClient is None:  # pragma: no cover - defensive guard
            raise ClaudeServiceUnavailable("Claude Agent SDK is not installed")

        options = build_claude_options(project_root)
        async with ClaudeSDKClient(options=options) as client:  # type: ignore[arg-type]
            await client.query(prompt=self._compose_prompt(prompt, template))

            async for message in client.receive_messages():
                if isinstance(message, AssistantMessage):
                    await self._emit_assistant_message(message, emit)
                elif isinstance(message, ResultMessage):
                    await self._emit_result_message(message, emit)
                    break

        return ClaudeGenerationOutcome(preview_path="index.html")

    async def _emit_assistant_message(
        self,
        message: Any,
        emit: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        """Emit an AssistantMessage event and individual ToolUseBlock events."""
        text_blocks = []

        for block in getattr(message, "content", []):
            if isinstance(block, TextBlock):
                text_blocks.append(block.text)
            elif isinstance(block, ToolUseBlock):
                # Emit individual tool use events
                await emit(
                    {
                        "type": "tool_use",
                        "payload": {
                            "id": getattr(block, "id", None),
                            "name": getattr(block, "name", None),
                            "input": getattr(block, "input", None),
                        },
                    }
                )

        # Emit assistant message if there's text content
        if text_blocks:
            payload = {
                "model": getattr(message, "model", None),
                "stop_reason": getattr(message, "stop_reason", None),
                "text": "\n".join(text_blocks),
            }

            await emit(
                {
                    "type": "assistant_message",
                    "payload": payload,
                }
            )

    async def _emit_result_message(
        self,
        message: Any,
        emit: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        """Emit a ResultMessage event."""
        usage = getattr(message, "usage", None)
        usage_dict = {}
        if usage:
            usage_dict = {
                "input_tokens": getattr(usage, "input_tokens", None),
                "output_tokens": getattr(usage, "output_tokens", None),
            }

        await emit(
            {
                "type": "result_message",
                "payload": {
                    "total_cost_usd": getattr(message, "total_cost_usd", None),
                    "stop_reason": getattr(message, "stop_reason", None),
                    "usage": usage_dict,
                },
            }
        )

    def _compose_prompt(self, prompt: str, template: str | None) -> str:
        base_intro = (
            "You are a software engineer. "
            "Always scaffold the template non-interactively with: "
            "'pnpm create vite <project-name> --template react --no-rolldown --no-interactive'. "
            "After scaffolding, run `pnpm i` to install the dependencies. "
            "Only modify the necessary code to fulfill the user's instructions. "
            "Run `pnpm run build` to build the project. Your task is complete if no error occurs. "
        )
        if template:
            return (
                f"{base_intro}\n"
                f"Modify the generated {template} application according to the user's "
                f"instructions, using Vite + React conventions.\n"
                f"User prompt: {prompt}"
            )
        return f"{base_intro}\nUser prompt: {prompt}"
