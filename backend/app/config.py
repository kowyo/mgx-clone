from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="CLAUDE_APP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_prefix: str = "/api"
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    )
    projects_root: Path = Path("/tmp/claude-projects")
    preview_scheme: str = "http"
    preview_host: str | None = None
    allowed_commands: list[str] = Field(
        default_factory=lambda: [
            "pnpm",
            "npm",
            "npx",
            "yarn",
            "node",
            "python",
            "python3",
        ]
    )
    better_auth_secret: str = Field(
        default="your-secret-key-change-in-production",
        description="Secret key for better-auth JWT verification",
    )
    better_auth_url: str = Field(
        default="http://localhost:3000",
        description="Better-auth base URL",
    )
    better_auth_internal_url: str | None = Field(
        default=None,
        description="Internal URL for contacting better-auth from backend (optional)",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
