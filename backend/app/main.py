from __future__ import annotations

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routes import api_router, ws_router
from app.services.notification_service import NotificationService
from app.services.task_service import TaskService

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database
    await init_db()

    # Initialize services
    notification_service = NotificationService()
    task_service = TaskService()

    app.state.notification_service = notification_service
    app.state.task_service = task_service

    try:
        yield
    finally:
        await notification_service.shutdown()
        await task_service.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Claude App Builder Backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_prefix)
    app.include_router(ws_router)

    return app


app = create_app()
