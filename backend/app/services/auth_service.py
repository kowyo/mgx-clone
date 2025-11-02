from __future__ import annotations

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User


class AuthService:
    """Service for handling authentication and user management."""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    async def verify_token(self, token: str, db: AsyncSession) -> dict:
        """Verify JWT token from better-auth and return decoded payload."""
        try:
            # Better-auth uses JWT tokens
            # We'll verify the token signature
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=["HS256"],
                options={"verify_signature": True},
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

    async def get_user_from_token(self, token: str, db: AsyncSession) -> User:
        """Get user from token, creating user if not exists."""
        payload = await self.verify_token(token, db)

        user_id = payload.get("userId") or payload.get("user_id") or payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing user ID",
            )

        # Get or create user
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            # Create user from token claims
            email = payload.get("email")
            name = payload.get("name")
            image = payload.get("image")

            if not email:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing email",
                )

            user = User(
                id=user_id,
                email=email,
                name=name,
                image=image,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        return user

    async def get_user_by_id(self, user_id: str, db: AsyncSession) -> User | None:
        """Get user by ID."""
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


# Initialize auth service
# Note: In production, use a secure secret key from environment
auth_service = AuthService(secret_key=settings.better_auth_secret)

