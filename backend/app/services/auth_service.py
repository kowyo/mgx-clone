from __future__ import annotations

import asyncio

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User


class AuthService:
    """Service for handling authentication and user management."""

    def __init__(
        self,
        secret_key: str,
        better_auth_url: str,
        better_auth_internal_url: str | None = None,
    ):
        self.secret_key = secret_key
        self.better_auth_url = better_auth_url.rstrip("/")
        internal_base_url = (better_auth_internal_url or better_auth_url).rstrip("/")
        # Initialize PyJWKClient for fetching JWKS
        self.jwks_client = PyJWKClient(
            f"{internal_base_url}/api/auth/jwks",
            cache_keys=True,
            max_cached_keys=16,
            lifespan=300,  # Cache for 5 minutes
        )

    async def verify_token(self, token: str) -> dict:
        """Verify JWT token and return payload."""
        # Run the synchronous JWT verification in a thread pool to avoid blocking
        # the async event loop during the HTTP request to fetch JWKS
        loop = asyncio.get_event_loop()
        
        def _verify_sync():
            try:
                # Get the signing key from JWKS using PyJWKClient
                signing_key = self.jwks_client.get_signing_key_from_jwt(token)

                # Decode token without verification to fail fast on malformed tokens
                jwt.decode(token, options={"verify_signature": False})
                
                # Better-auth uses the baseURL as issuer and audience
                issuer = self.better_auth_url
                
                # Verify and decode the token
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["EdDSA"],  # Ed25519 uses EdDSA algorithm
                    audience=issuer,
                    issuer=issuer,
                    options={"verify_signature": True},
                )
                return payload
            except ExpiredSignatureError as e:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has expired",
                ) from e
            except InvalidTokenError as e:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid token: {str(e)}",
                ) from e
            except Exception as e:
                import traceback
                traceback.print_exc()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Token verification failed: {str(e)}",
                ) from e
        
        # Run the synchronous function in a thread pool
        return await loop.run_in_executor(None, _verify_sync)

    async def get_user_from_token(self, token: str, db: AsyncSession) -> User:
        """Get user from token, creating user if not exists."""
        payload = await self.verify_token(token)

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
auth_service = AuthService(
    secret_key=settings.better_auth_secret,
    better_auth_url=settings.better_auth_url,
    better_auth_internal_url=settings.better_auth_internal_url,
)

