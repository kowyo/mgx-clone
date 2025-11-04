from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .project import ProjectEvent, ProjectStatus
from .project_message import ProjectMessage


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


class ProjectMessagesResponse(BaseModel):
    project_id: str
    messages: list[ProjectMessage] = Field(default_factory=list)


class ProjectMessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4096)
    assistant_intro: str | None = Field(default=None, max_length=512)


class ProjectMessageCreateResponse(BaseModel):
    project_id: str
    user_message: ProjectMessage
    status: ProjectStatus


class ProjectListItem(BaseModel):
    """Summary information for a project in a list."""

    id: str
    prompt: str
    status: ProjectStatus
    preview_url: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(BaseModel):
    """Response for listing user projects."""

    projects: list[ProjectListItem] = Field(default_factory=list)


class ProjectEventMessage(ProjectEvent):
    """Alias wrapper for WebSocket responses."""

    pass
