from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_project_manager
from app.models.api import (
    ProjectFilesResponse,
    ProjectPreviewResponse,
    ProjectStatusResponse,
)
from app.services.project_service import ProjectManager, ProjectNotFoundError

ProjectManagerDep = Annotated[ProjectManager, Depends(get_project_manager)]

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/{project_id}/status", response_model=ProjectStatusResponse)
async def get_project_status(
    project_id: str,
    manager: ProjectManagerDep,
) -> ProjectStatusResponse:
    try:
        project = await manager.get_project(project_id)
    except ProjectNotFoundError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectStatusResponse(
        project_id=project.id,
        status=project.status,
        preview_url=project.preview_url,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("/{project_id}/files", response_model=ProjectFilesResponse)
async def list_project_files(
    project_id: str,
    manager: ProjectManagerDep,
) -> ProjectFilesResponse:
    try:
        files = await manager.list_files(project_id)
    except ProjectNotFoundError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectFilesResponse(project_id=project_id, files=files)


@router.get("/{project_id}/preview", response_model=ProjectPreviewResponse)
async def get_project_preview(
    project_id: str,
    manager: ProjectManagerDep,
) -> ProjectPreviewResponse:
    try:
        project = await manager.get_project(project_id)
    except ProjectNotFoundError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectPreviewResponse(project_id=project.id, preview_url=project.preview_url)
