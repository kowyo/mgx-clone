from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ProjectMessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class ProjectMessageStatus(str, Enum):
    PENDING = "pending"
    COMPLETE = "complete"
    ERROR = "error"


class ProjectMessage(BaseModel):
    id: str
    project_id: str
    role: ProjectMessageRole
    status: ProjectMessageStatus
    content: str = Field(default="")
    parent_id: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
