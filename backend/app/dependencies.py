from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth_service import auth_service

AsyncDBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: AsyncDBSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Dependency to get current authenticated user from bearer token."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract token from "Bearer <token>"
    try:
        scheme, token = authorization.split(" ", 1)
        if scheme.lower() != "bearer":
            raise ValueError("Invalid scheme")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await auth_service.get_user_from_token(token, db)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# Keep the existing project_manager dependency
from app.services.project_service import ProjectManager, project_manager


def get_project_manager() -> ProjectManager:
    """FastAPI dependency that returns the shared project manager."""

    return project_manager
