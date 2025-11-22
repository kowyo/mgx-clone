from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass

from app.models.project import ProjectEvent


@dataclass
class Subscription:
    queue: asyncio.Queue[ProjectEvent]
    history: list[ProjectEvent]


class NotificationService:
    """Manages WebSocket subscriptions and event history."""

    def __init__(self, history_limit: int = 500):
        self._history_limit = history_limit
        self._subscribers: dict[str, list[asyncio.Queue[ProjectEvent]]] = {}
        self._history: dict[str, deque[ProjectEvent]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, project_id: str) -> Subscription:
        queue: asyncio.Queue[ProjectEvent] = asyncio.Queue()
        async with self._lock:
            subscribers = self._subscribers.setdefault(project_id, [])
            subscribers.append(queue)
            history = list(self._history.get(project_id, []))
        return Subscription(queue=queue, history=history)

    async def unsubscribe(self, project_id: str, queue: asyncio.Queue[ProjectEvent]) -> None:
        async with self._lock:
            subscribers = self._subscribers.get(project_id)
            if not subscribers:
                return
            try:
                subscribers.remove(queue)
            except ValueError:  # queue already removed
                return
            if not subscribers:
                self._subscribers.pop(project_id, None)

    async def publish_event(self, event: ProjectEvent) -> None:
        async with self._lock:
            history = self._history.get(event.project_id)
            if history is None:
                history = deque(maxlen=self._history_limit)
                self._history[event.project_id] = history
            history.append(event)
            subscribers = list(self._subscribers.get(event.project_id, []))

        for queue in subscribers:
            await queue.put(event)

    async def shutdown(self) -> None:
        async with self._lock:
            self._subscribers.clear()
            self._history.clear()
