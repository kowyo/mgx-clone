from __future__ import annotations

from app.services.project_service import ProjectManager, project_manager


def get_project_manager() -> ProjectManager:
    """FastAPI dependency that returns the shared project manager."""

    return project_manager
