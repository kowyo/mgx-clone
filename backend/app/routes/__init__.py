from __future__ import annotations

from fastapi import APIRouter

from . import auth, generate, health, projects, ws

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(generate.router)
api_router.include_router(projects.router)

ws_router = ws.router

__all__ = ["api_router", "ws_router"]
