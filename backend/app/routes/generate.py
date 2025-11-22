from __future__ import annotations

from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectServiceDep
from app.models.api import ProjectGenerateRequest, ProjectGenerateResponse

router = APIRouter(prefix="/generate", tags=["generation"])


@router.post("", response_model=ProjectGenerateResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_generation(
    payload: ProjectGenerateRequest,
    service: ProjectServiceDep,
    current_user: CurrentUser,
) -> ProjectGenerateResponse:
    project = await service.create_project(
        user_id=current_user.id,
        prompt=payload.prompt,
        template=payload.template,
    )
    user_message = await service.record_user_message(
        project.id,
        payload.prompt,
    )
    await service.run_generation(
        project.id,
        user_message_id=user_message.id,
    )

    return ProjectGenerateResponse(project_id=project.id, status=project.status)
