from __future__ import annotations

import asyncio
from typing import Any


class TaskService:
    """Manages background tasks and ensures graceful shutdown."""

    def __init__(self):
        self._tasks: set[asyncio.Task[Any]] = set()
        self._lock = asyncio.Lock()

    async def track_task(self, task: asyncio.Task[Any]) -> None:
        async with self._lock:
            self._tasks.add(task)
            task.add_done_callback(lambda finished: self._tasks.discard(finished))

    async def shutdown(self) -> None:
        pending: list[asyncio.Task[Any]] = []
        async with self._lock:
            if self._tasks:
                pending = list(self._tasks)
                self._tasks.clear()

        for task in pending:
            task.cancel()

        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
