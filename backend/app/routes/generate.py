from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.dependencies import get_project_manager
from app.models.api import ProjectGenerateRequest, ProjectGenerateResponse
from app.services.project_service import ProjectManager

router = APIRouter(prefix="/generate", tags=["generation"])


@router.post("", response_model=ProjectGenerateResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_generation(
    payload: ProjectGenerateRequest,
    manager: Annotated[ProjectManager, Depends(get_project_manager)],
) -> ProjectGenerateResponse:
    project = await manager.create_project(payload.prompt, payload.template)

    return ProjectGenerateResponse(project_id=project.id, status=project.status)
