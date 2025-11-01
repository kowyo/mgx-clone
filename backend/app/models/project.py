from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ProjectStatus(str, Enum):
    """Lifecycle states for a generated project."""

    PENDING = "pending"
    RUNNING = "running"
    READY = "ready"
    FAILED = "failed"
    CANCELED = "canceled"


class ProjectEventType(str, Enum):
    """Event types emitted during project generation."""

    PROJECT_CREATED = "project_created"
    STATUS_UPDATED = "status_updated"
    LOG_APPENDED = "log_appended"
    PREVIEW_READY = "preview_ready"
    ERROR = "error"


class Project(BaseModel):
    """Domain representation of a generated project."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: str
    prompt: str
    status: ProjectStatus = ProjectStatus.PENDING
    template: str | None = None
    project_dir: Path
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    preview_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProjectEvent(BaseModel):
    """Structured event published to WebSocket subscribers."""

    project_id: str
    type: ProjectEventType
    message: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=_utcnow)
