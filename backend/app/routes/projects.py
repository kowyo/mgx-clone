from __future__ import annotations

import asyncio
import mimetypes
import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse, Response

from app.dependencies import AsyncDBSession, CurrentUser, get_project_manager
from app.models.api import (
    ProjectFilesResponse,
    ProjectListItem,
    ProjectListResponse,
    ProjectPreviewResponse,
    ProjectStatusResponse,
)
from app.services.project_service import ProjectManager, ProjectNotFoundError
from app.tools.exceptions import PathValidationError
from app.tools.path_utils import resolve_project_path

ProjectManagerDep = Annotated[ProjectManager, Depends(get_project_manager)]

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
async def list_user_projects(
    manager: ProjectManagerDep,
    current_user: CurrentUser,
    db: AsyncDBSession,
    limit: int = 50,
    offset: int = 0,
) -> ProjectListResponse:
    """List all projects for the current user."""
    projects = await manager.list_user_projects(
        user_id=current_user.id,
        db=db,
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


ASSET_FALLBACK_SUFFIXES = {
    ".css",
    ".js",
    ".mjs",
    ".map",
    ".json",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".ico",
    ".webp",
    ".gif",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
}


def _asset_fallback_path(relative: Path) -> Path | None:
    """Return alternate asset location when builds keep hashed files in /assets."""

    if not relative.name:
        return None

    suffix = relative.suffix.lower()
    if suffix not in ASSET_FALLBACK_SUFFIXES:
        return None

    if "assets" in relative.parts:
        return None

    parent = relative.parent
    candidate = parent / "assets" / relative.name
    return candidate


_HTML_ABSOLUTE_REF_PATTERN = re.compile(
    r"(?P<prefix>(?:src|href|poster|data)=['\"])(?P<path>/[^'\"]*)",
    flags=re.IGNORECASE,
)


HTML_REWRITE_SUFFIXES = {
    ".css",
    ".js",
    ".mjs",
    ".cjs",
    ".map",
    ".json",
    ".ico",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".gif",
    ".webp",
    ".avif",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".wasm",
    ".xml",
    ".txt",
    ".webmanifest",
}


def _rewrite_preview_html(document: str, token: str | None = None) -> str:
    """Rewrite absolute asset references to relative ones for iframe previews.
    
    If a token is provided, it will be appended to rewritten asset URLs to enable
    authenticated access to assets loaded by the browser.
    """

    def _replace(match: re.Match[str]) -> str:
        path = match.group("path")
        if not path or path.startswith("//"):
            return match.group(0)
        stripped = path.lstrip("/")
        if not stripped:
            return match.group(0)
        core = stripped.split("?", 1)[0].split("#", 1)[0]
        suffix = Path(core).suffix.lower()
        if suffix not in HTML_REWRITE_SUFFIXES:
            return match.group(0)
        
        # Rewrite to relative path
        rewritten_path = f"./{stripped}"
        
        # Append token as query parameter if provided
        if token:
            separator = "&" if "?" in rewritten_path else "?"
            rewritten_path = f"{rewritten_path}{separator}token={token}"
        
        return f"{match.group('prefix')}{rewritten_path}"

    # Fast exit when no absolute references are present.
    if "\"/" not in document and "'/" not in document:
        return document

    return _HTML_ABSOLUTE_REF_PATTERN.sub(_replace, document)


@router.get("/{project_id}/status", response_model=ProjectStatusResponse)
async def get_project_status(
    project_id: str,
    manager: ProjectManagerDep,
    current_user: CurrentUser,
    db: AsyncDBSession,
) -> ProjectStatusResponse:
    try:
        project = await manager.get_project(project_id, user_id=current_user.id, db=db)
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
    current_user: CurrentUser,
    db: AsyncDBSession,
) -> ProjectFilesResponse:
    try:
        # Verify project ownership
        await manager.get_project(project_id, user_id=current_user.id, db=db)
        files = await manager.list_files(project_id)
    except ProjectNotFoundError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectFilesResponse(project_id=project_id, files=files)


@router.get("/{project_id}/files/{file_path:path}", response_class=PlainTextResponse)
async def get_project_file_content(
    project_id: str,
    file_path: str,
    manager: ProjectManagerDep,
    current_user: CurrentUser,
    db: AsyncDBSession,
) -> PlainTextResponse:
    try:
        project = await manager.get_project(project_id, user_id=current_user.id, db=db)
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
        ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif",
        # Fonts
        ".woff", ".woff2", ".ttf", ".otf", ".eot",
        # Archives
        ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
        # Executables
        ".exe", ".bin", ".dll", ".so", ".dylib",
        # Other binary formats
        ".pdf", ".mp4", ".mp3", ".avi", ".mov", ".wav",
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
            "[Binary file]\n"
            "This file cannot be displayed as text in the code viewer.",
            status_code=status.HTTP_200_OK,
        )


@router.get("/{project_id}/preview", response_model=ProjectPreviewResponse)
async def get_project_preview(
    project_id: str,
    manager: ProjectManagerDep,
    current_user: CurrentUser,
    db: AsyncDBSession,
) -> ProjectPreviewResponse:
    try:
        project = await manager.get_project(project_id, user_id=current_user.id, db=db)
    except ProjectNotFoundError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ProjectPreviewResponse(project_id=project.id, preview_url=project.preview_url)


@router.get("/{project_id}/preview/{asset_path:path}")
async def fetch_preview_asset(
    request: Request,
    project_id: str,
    asset_path: str,
    manager: ProjectManagerDep,
    current_user: CurrentUser,
    db: AsyncDBSession,
    token: str | None = None,
) -> Response:
    try:
        project = await manager.get_project(project_id, user_id=current_user.id, db=db)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    preview_root = (project.project_dir / "generated-app").resolve()

    try:
        requested_path = resolve_project_path(preview_root, asset_path or "index.html")
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        requested_relative = requested_path.relative_to(preview_root)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        ) from exc

    candidate_paths: list[tuple[Path, Path]] = [(requested_path, requested_relative)]

    fallback_relative = _asset_fallback_path(requested_relative)
    if fallback_relative is not None:
        try:
            fallback_path = resolve_project_path(preview_root, fallback_relative.as_posix())
        except PathValidationError:
            fallback_path = None
        else:
            try:
                fallback_relative = fallback_path.relative_to(preview_root)
            except ValueError:
                fallback_path = None
        if fallback_path is not None:
            candidate_paths.append((fallback_path, fallback_relative))

    selected_path: Path | None = None
    selected_relative: Path | None = None
    for candidate_full, candidate_relative in candidate_paths:
        if "node_modules" in candidate_relative.parts:
            continue
        exists = await asyncio.to_thread(candidate_full.exists)
        if not exists:
            continue
        selected_path = candidate_full
        selected_relative = candidate_relative
        break

    if selected_path is None or selected_relative is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    is_directory = await asyncio.to_thread(selected_path.is_dir)
    if is_directory:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot serve directory",
        )

    media_type = mimetypes.guess_type(selected_path.name)[0] or "application/octet-stream"

    if selected_path.suffix.lower() == ".html":
        text = await asyncio.to_thread(selected_path.read_text, encoding="utf-8")
        # Get token from request state (set by get_current_user dependency)
        auth_token = getattr(request.state, "auth_token", None)
        rewritten = _rewrite_preview_html(text, token=auth_token)
        return Response(rewritten.encode("utf-8"), media_type=media_type)

    content = await asyncio.to_thread(selected_path.read_bytes)
    return Response(content, media_type=media_type)
