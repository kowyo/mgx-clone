from __future__ import annotations

import asyncio
import mimetypes
import re
from pathlib import Path

from app.tools.exceptions import PathValidationError
from app.tools.path_utils import resolve_project_path

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


class PreviewService:
    """Handles preview URL generation and asset resolution."""

    def __init__(self, api_prefix: str):
        self.api_prefix = api_prefix

    def build_preview_url(self, project_id: str, preview_path: str | None) -> str | None:
        if not preview_path:
            return None
        normalized = preview_path.lstrip("/")
        return f"{self.api_prefix}/projects/{project_id}/preview/{normalized}"

    def _asset_fallback_path(self, relative: Path) -> Path | None:
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

    def rewrite_preview_html(self, document: str, token: str | None = None) -> str:
        """Rewrite absolute asset references to relative ones for iframe previews."""

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
        if '"/' not in document and "'/" not in document:
            return document

        return _HTML_ABSOLUTE_REF_PATTERN.sub(_replace, document)

    async def resolve_asset_path(
        self,
        project_dir: Path,
        asset_path: str,
    ) -> tuple[Path, str]:
        """Resolve an asset path within a project directory.

        Returns:
            Tuple of (absolute_path, media_type)
        """
        preview_root = (project_dir / "generated-app").resolve()

        try:
            requested_path = resolve_project_path(preview_root, asset_path or "index.html")
        except PathValidationError as exc:
            raise FileNotFoundError(str(exc)) from exc

        try:
            requested_relative = requested_path.relative_to(preview_root)
        except ValueError as exc:
            raise FileNotFoundError("Asset not found") from exc

        candidate_paths: list[tuple[Path, Path]] = [(requested_path, requested_relative)]

        fallback_relative = self._asset_fallback_path(requested_relative)
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
        for candidate_full, candidate_relative in candidate_paths:
            if "node_modules" in candidate_relative.parts:
                continue
            exists = await asyncio.to_thread(candidate_full.exists)
            if not exists:
                continue
            selected_path = candidate_full
            break

        if selected_path is None:
            raise FileNotFoundError("Asset not found")

        is_directory = await asyncio.to_thread(selected_path.is_dir)
        if is_directory:
            raise IsADirectoryError("Cannot serve directory")

        media_type = mimetypes.guess_type(selected_path.name)[0] or "application/octet-stream"
        return selected_path, media_type
