from __future__ import annotations

import asyncio
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.models.api import ProjectFileEntry

from .exceptions import PathValidationError
from .path_utils import resolve_project_path


@dataclass(slots=True)
class DirectoryListingEntry:
    path: str
    is_dir: bool
    size: int | None
    updated_at: datetime | None


class FileAdapter:
    """Async helper for sandboxed filesystem interactions."""

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir.resolve()

    def _resolve(self, relative_path: str) -> Path:
        return resolve_project_path(self._base_dir, relative_path)

    async def read_text(self, relative_path: str, encoding: str = "utf-8") -> str:
        path = self._resolve(relative_path)
        if not path.exists():
            raise PathValidationError(f"File '{relative_path}' does not exist")
        return await asyncio.to_thread(path.read_text, encoding=encoding)

    async def write_text(
        self,
        relative_path: str,
        content: str,
        *,
        overwrite: bool = True,
        encoding: str = "utf-8",
    ) -> None:
        path = self._resolve(relative_path)
        if path.exists() and not overwrite:
            raise PathValidationError(f"Refusing to overwrite existing file '{relative_path}'")
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_text, content, encoding=encoding)

    async def create_directory(self, relative_path: str, *, exist_ok: bool = True) -> None:
        path = self._resolve(relative_path)
        await asyncio.to_thread(path.mkdir, parents=True, exist_ok=exist_ok)

    async def list_directory(self, relative_path: str | None = None) -> list[DirectoryListingEntry]:
        target = self._base_dir if not relative_path else self._resolve(relative_path)
        if not target.exists():
            raise PathValidationError(f"Directory '{relative_path or '.'}' does not exist")
        if not target.is_dir():
            raise PathValidationError(f"Path '{relative_path or '.'}' is not a directory")

        def _collect() -> list[DirectoryListingEntry]:
            entries: list[DirectoryListingEntry] = []
            for path in target.rglob("*"):
                relative = path.relative_to(self._base_dir)
                stat_result = path.stat()
                entries.append(
                    DirectoryListingEntry(
                        path=str(relative),
                        is_dir=path.is_dir(),
                        size=stat_result.st_size if path.is_file() else None,
                        updated_at=datetime.fromtimestamp(stat_result.st_mtime, UTC),
                    )
                )
            entries.sort(key=lambda entry: entry.path)
            return entries

        return await asyncio.to_thread(_collect)

    async def to_project_entries(
        self, relative_path: str | None = None
    ) -> list[ProjectFileEntry]:
        listings = await self.list_directory(relative_path)
        return [
            ProjectFileEntry(
                path=entry.path,
                is_dir=entry.is_dir,
                size=entry.size,
                updated_at=entry.updated_at,
            )
            for entry in listings
        ]

    async def write_many(
        self,
        files: Iterable[tuple[str, str]],
        *,
        overwrite: bool = True,
        encoding: str = "utf-8",
    ) -> None:
        for relative_path, content in files:
            await self.write_text(relative_path, content, overwrite=overwrite, encoding=encoding)
