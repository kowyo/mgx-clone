from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .project import ProjectEvent, ProjectStatus


class ProjectGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4096)
    template: Literal["next", "vite", "react"] | None = Field(
        default=None,
        description="Preferred frontend template generator",
    )


class ProjectGenerateResponse(BaseModel):
    project_id: str
    status: ProjectStatus


class ProjectStatusResponse(BaseModel):
    project_id: str
    status: ProjectStatus
    preview_url: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectFileEntry(BaseModel):
    path: str
    is_dir: bool
    size: int | None = None
    updated_at: datetime | None = None


class ProjectFilesResponse(BaseModel):
    project_id: str
    files: list[ProjectFileEntry] = Field(default_factory=list)


class ProjectPreviewResponse(BaseModel):
    project_id: str
    preview_url: str | None = None


class ProjectEventMessage(ProjectEvent):
    """Alias wrapper for WebSocket responses."""

    pass
