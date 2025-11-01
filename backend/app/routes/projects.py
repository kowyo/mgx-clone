from __future__ import annotations

import asyncio
import mimetypes
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse, Response

from app.dependencies import get_project_manager
from app.models.api import (
    ProjectFilesResponse,
    ProjectPreviewResponse,
    ProjectStatusResponse,
)
from app.services.project_service import ProjectManager, ProjectNotFoundError
from app.tools.exceptions import PathValidationError
from app.tools.path_utils import resolve_project_path

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


@router.get("/{project_id}/files/{file_path:path}", response_class=PlainTextResponse)
async def get_project_file_content(
    project_id: str,
    file_path: str,
    manager: ProjectManagerDep,
) -> PlainTextResponse:
    try:
        project = await manager.get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    preview_root = project.project_dir / "generated-app"

    try:
        absolute = resolve_project_path(preview_root, file_path)
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if not await asyncio.to_thread(absolute.exists):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if absolute.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path points to a directory",
        )

    content = await asyncio.to_thread(absolute.read_text, encoding="utf-8")
    return PlainTextResponse(content)


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


@router.get("/{project_id}/preview/{asset_path:path}")
async def fetch_preview_asset(
    project_id: str,
    asset_path: str,
    manager: ProjectManagerDep,
) -> Response:
    try:
        project = await manager.get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    preview_root = project.project_dir / "generated-app"

    try:
        full_path = resolve_project_path(preview_root, asset_path or "index.html")
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if not await asyncio.to_thread(full_path.exists):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    if full_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot serve directory",
        )

    content = await asyncio.to_thread(full_path.read_bytes)
    media_type = mimetypes.guess_type(full_path.name)[0] or "application/octet-stream"
    return Response(content, media_type=media_type)
