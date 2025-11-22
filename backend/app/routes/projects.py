from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import PlainTextResponse, Response

from app.dependencies import CurrentUser, OptionalUser, ProjectServiceDep
from app.models.api import (
    ProjectFilesResponse,
    ProjectListItem,
    ProjectListResponse,
    ProjectMessageCreateRequest,
    ProjectMessageCreateResponse,
    ProjectMessagesResponse,
    ProjectPreviewResponse,
    ProjectStatusResponse,
)
from app.models.project import ProjectStatus
from app.repositories.project_repository import ProjectNotFoundError
from app.tools.exceptions import PathValidationError
from app.tools.path_utils import resolve_project_path

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
async def list_user_projects(
    service: ProjectServiceDep,
    current_user: CurrentUser,
    limit: int = 50,
    offset: int = 0,
) -> ProjectListResponse:
    """List all projects for the current user."""
    projects = await service.list_user_projects(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )

    project_items = [
        ProjectListItem(
            id=project.id,
            prompt=project.prompt,
            status=project.status,
            preview_url=project.preview_url,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )
        for project in projects
    ]

    return ProjectListResponse(projects=project_items)


@router.get("/{project_id}/status", response_model=ProjectStatusResponse)
async def get_project_status(
    project_id: str,
    service: ProjectServiceDep,
    current_user: CurrentUser,
) -> ProjectStatusResponse:
    try:
        project = await service.get_project(project_id, user_id=current_user.id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectStatusResponse(
        project_id=project.id,
        status=project.status,
        preview_url=project.preview_url,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("/{project_id}/messages", response_model=ProjectMessagesResponse)
async def get_project_messages(
    project_id: str,
    service: ProjectServiceDep,
    current_user: CurrentUser,
) -> ProjectMessagesResponse:
    try:
        await service.get_project(project_id, user_id=current_user.id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    messages = await service.list_messages(project_id)
    return ProjectMessagesResponse(project_id=project_id, messages=messages)


@router.post(
    "/{project_id}/messages",
    response_model=ProjectMessageCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_project_message(
    project_id: str,
    payload: ProjectMessageCreateRequest,
    service: ProjectServiceDep,
    current_user: CurrentUser,
) -> ProjectMessageCreateResponse:
    try:
        project = await service.get_project(project_id, user_id=current_user.id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if project.status == ProjectStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project generation already running",
        )

    content = payload.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty",
        )

    user_message = await service.record_user_message(project_id, content)

    await service.update_status(project_id, ProjectStatus.PENDING)

    intro = (payload.assistant_intro or "").strip()

    await service.run_generation(
        project_id,
        prompt_override=content,
        user_message_id=user_message.id,
        assistant_intro=intro,
    )

    return ProjectMessageCreateResponse(
        project_id=project_id,
        user_message=user_message,
        status=ProjectStatus.PENDING,
    )


@router.get("/{project_id}/files", response_model=ProjectFilesResponse)
async def list_project_files(
    project_id: str,
    service: ProjectServiceDep,
    current_user: CurrentUser,
) -> ProjectFilesResponse:
    try:
        # Verify project ownership
        await service.get_project(project_id, user_id=current_user.id)
        files = await service.list_files(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectFilesResponse(project_id=project_id, files=files)


@router.get("/{project_id}/files/{file_path:path}", response_class=PlainTextResponse)
async def get_project_file_content(
    project_id: str,
    file_path: str,
    service: ProjectServiceDep,
    current_user: CurrentUser,
) -> PlainTextResponse:
    try:
        project = await service.get_project(project_id, user_id=current_user.id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    preview_root = (project.project_dir / "generated-app").resolve()

    try:
        absolute = resolve_project_path(preview_root, file_path)
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        relative = absolute.relative_to(preview_root)
    except ValueError as exc:  # pragma: no cover - defensive guard for symlinked tmp dirs
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        ) from exc
    if "node_modules" in relative.parts:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if not await asyncio.to_thread(absolute.exists):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if absolute.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path points to a directory",
        )

    # Define binary file extensions that cannot be read as text
    binary_extensions = {
        # Images (SVG is text-based, so we try to read it and catch errors)
        ".ico",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".bmp",
        ".tiff",
        ".tif",
        # Fonts
        ".woff",
        ".woff2",
        ".ttf",
        ".otf",
        ".eot",
        # Archives
        ".zip",
        ".tar",
        ".gz",
        ".bz2",
        ".xz",
        ".7z",
        ".rar",
        # Executables
        ".exe",
        ".bin",
        ".dll",
        ".so",
        ".dylib",
        # Other binary formats
        ".pdf",
        ".mp4",
        ".mp3",
        ".avi",
        ".mov",
        ".wav",
    }

    # Check if file has a binary extension
    if absolute.suffix.lower() in binary_extensions:
        return PlainTextResponse(
            f"[Binary file: {absolute.suffix or 'no extension'}]\n"
            "This file cannot be displayed as text in the code viewer.",
            status_code=status.HTTP_200_OK,
        )

    # Try to read as UTF-8, but handle binary files gracefully
    try:
        content = await asyncio.to_thread(absolute.read_text, encoding="utf-8")
        return PlainTextResponse(content)
    except UnicodeDecodeError:
        # File appears to be binary despite not having a recognized extension
        return PlainTextResponse(
            "[Binary file]\nThis file cannot be displayed as text in the code viewer.",
            status_code=status.HTTP_200_OK,
        )


@router.get("/{project_id}/preview", response_model=ProjectPreviewResponse)
async def get_project_preview(
    project_id: str,
    service: ProjectServiceDep,
    current_user: CurrentUser,
) -> ProjectPreviewResponse:
    try:
        project = await service.get_project(project_id, user_id=current_user.id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectPreviewResponse(project_id=project.id, preview_url=project.preview_url)


@router.get("/{project_id}/preview/{asset_path:path}")
async def fetch_preview_asset(
    request: Request,
    project_id: str,
    asset_path: str,
    service: ProjectServiceDep,
    current_user: OptionalUser,
) -> Response:
    # If user is authenticated, validate ownership
    if current_user is not None:
        try:
            project = await service.get_project(project_id, user_id=current_user.id)
        except ProjectNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    else:
        # If no authentication, still allow access but don't validate ownership
        # This is needed for Docker/iframe scenarios where cookies might not be forwarded
        try:
            project = await service.get_project(project_id, user_id=None)
        except ProjectNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        selected_path, media_type = await service.preview_service.resolve_asset_path(
            project.project_dir, asset_path
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except IsADirectoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if selected_path.suffix.lower() == ".html":
        text = await asyncio.to_thread(selected_path.read_text, encoding="utf-8")
        # Get token from request state (set by get_current_user dependency)
        auth_token = getattr(request.state, "auth_token", None)
        rewritten = service.preview_service.rewrite_preview_html(text, token=auth_token)
        return Response(rewritten.encode("utf-8"), media_type=media_type)

    content = await asyncio.to_thread(selected_path.read_bytes)
    return Response(content, media_type=media_type)
