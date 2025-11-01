from __future__ import annotations


class ToolError(RuntimeError):
    """Base error for tool operations."""


class PathValidationError(ToolError):
    """Raised when a requested path is outside the project sandbox."""


class CommandValidationError(ToolError):
    """Raised when attempting to execute a non-whitelisted command."""


class CommandTimeoutError(ToolError):
    """Raised when a command exceeds its configured timeout."""
