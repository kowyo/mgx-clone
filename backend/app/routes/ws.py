from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.dependencies import ProjectServiceDep
from app.repositories.project_repository import ProjectNotFoundError

router = APIRouter()


@router.websocket("/ws/{project_id}")
async def project_updates(
    websocket: WebSocket,
    project_id: str,
    service: ProjectServiceDep,
) -> None:
    try:
        project = await service.get_project(project_id)
    except ProjectNotFoundError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    subscription = await service.notification_service.subscribe(project_id)

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
        await service.notification_service.unsubscribe(project_id, subscription.queue)
