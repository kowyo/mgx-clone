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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
