from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.dependencies import CurrentUser

router = APIRouter(prefix="/auth", tags=["auth"])


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    image: str | None


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser) -> UserResponse:
    """Get current authenticated user information."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        image=current_user.image,
    )
