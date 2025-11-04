"""Tools and utilities for backend operations.

This package contains utilities for:
- Claude Agent SDK configuration (builders.py)
- Command execution for post-generation steps (command_adapter.py)
- File operations for UI listing and fallback generator (file_adapter.py)
- Path validation for serving assets (path_utils.py)
- Exception types for tool operations (exceptions.py)

Note: These modules are NOT used for Claude Agent SDK tools. We use built-in
Claude tools (Read, Write, Bash) instead of custom MCP tools.
"""

from .builders import build_claude_options
from .command_adapter import CommandAdapter, CommandResult
from .exceptions import (
    CommandTimeoutError,
    CommandValidationError,
    PathValidationError,
    ToolError,
)
from .file_adapter import DirectoryListingEntry, FileAdapter
from .path_utils import ensure_within, resolve_project_path

__all__ = [
    # Builders
    "build_claude_options",
    # Adapters
    "CommandAdapter",
    "CommandResult",
    "FileAdapter",
    "DirectoryListingEntry",
    # Exceptions
    "ToolError",
    "CommandTimeoutError",
    "CommandValidationError",
    "PathValidationError",
    # Utilities
    "resolve_project_path",
    "ensure_within",
]
