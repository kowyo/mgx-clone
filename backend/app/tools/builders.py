"""Claude Agent SDK configuration builder.

This module provides a simplified configuration builder that uses the built-in
Claude Agent SDK tools (Read, Write, Bash) instead of custom MCP tools.
"""

from __future__ import annotations

from pathlib import Path

from claude_agent_sdk import ClaudeAgentOptions


def build_claude_options(project_root: Path, allowed_commands: list[str]) -> ClaudeAgentOptions:
    """Build Claude Agent options with built-in tools.

    Note: The `allowed_commands` parameter is kept for backward compatibility
    but is no longer used since we rely on Claude's built-in Bash tool with
    permission_mode="acceptEdits".

    Args:
        project_root: The project directory where Claude will operate.
        allowed_commands: Unused (kept for compatibility).

    Returns:
        Configured ClaudeAgentOptions with built-in Read, Write, and Bash tools.
    """
    print(f"Project root for Claude Agent: {project_root}")
    return ClaudeAgentOptions(
        model="claude-haiku-4-5",
        allowed_tools=["Read", "Write", "Bash"],
        permission_mode="acceptEdits",
        cwd=str(project_root),
        env={
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5",
            "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-haiku-4-5",
            "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-haiku-4-5",
            "ANTHROPIC_MODEL": "claude-haiku-4-5",
            "CLAUDE_CODE_SUBAGENT_MODEL": "claude-haiku-4-5",
        },
    )
