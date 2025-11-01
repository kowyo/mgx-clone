from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status

from app.dependencies import get_project_manager
from app.services.project_service import ProjectManager, ProjectNotFoundError

router = APIRouter()

ProjectManagerDep = Annotated[ProjectManager, Depends(get_project_manager)]


@router.websocket("/ws/{project_id}")
async def project_updates(
    websocket: WebSocket,
    project_id: str,
    manager: ProjectManagerDep,
) -> None:
    try:
        project = await manager.get_project(project_id)
    except ProjectNotFoundError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    try:
        subscription = await manager.subscribe(project_id)
    except ProjectNotFoundError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    snapshot = {
        "project_id": project.id,
        "type": "status_snapshot",
        "payload": {
            "status": project.status.value,
            "preview_url": project.preview_url,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
        },
    }
    await websocket.send_json(snapshot)

    for event in subscription.history:
        await websocket.send_json(event.model_dump(mode="json"))

    try:
        while True:
            event = await subscription.queue.get()
            await websocket.send_json(event.model_dump(mode="json"))
    except WebSocketDisconnect:
        return
    finally:
        await manager.unsubscribe(project_id, subscription.queue)
