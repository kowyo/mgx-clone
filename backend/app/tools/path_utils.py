from __future__ import annotations

from pathlib import Path

from .exceptions import PathValidationError


def ensure_within(base_dir: Path, candidate: Path) -> Path:
    """Validate that *candidate* resides within *base_dir* and return it."""

    resolved_base = base_dir.resolve()
    resolved_candidate = candidate.resolve()
    if resolved_candidate == resolved_base:
        return resolved_candidate
    if resolved_candidate.is_relative_to(resolved_base):
        return resolved_candidate
    raise PathValidationError(f"Path '{candidate}' escapes sandbox '{base_dir}'")


def resolve_project_path(base_dir: Path, relative_path: str) -> Path:
    """Resolve *relative_path* against *base_dir* while enforcing sandbox rules."""

    candidate = base_dir.joinpath(relative_path)
    return ensure_within(base_dir, candidate)
