from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.dependencies import AsyncDBSession, CurrentUser, get_project_manager
from app.models.api import ProjectGenerateRequest, ProjectGenerateResponse
from app.services.project_service import ProjectManager

router = APIRouter(prefix="/generate", tags=["generation"])


@router.post("", response_model=ProjectGenerateResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_generation(
    payload: ProjectGenerateRequest,
    manager: Annotated[ProjectManager, Depends(get_project_manager)],
    current_user: CurrentUser,
    db: AsyncDBSession,
) -> ProjectGenerateResponse:
    project = await manager.create_project(
        user_id=current_user.id,
        prompt=payload.prompt,
        template=payload.template,
        db=db,
    )
    user_message = await manager.record_user_message(
        project.id,
        payload.prompt,
        db,
    )
    await manager.run_generation(
        project.id,
        user_message_id=user_message.id,
        db=db,
    )

    return ProjectGenerateResponse(project_id=project.id, status=project.status)
