import asyncio
import json
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, AsyncGenerator
from dataclasses import dataclass, field

from server_python.config import MAX_BUFFER_LINES, CLEANUP_GRACE_PERIOD_SECONDS


class StreamEventType(str, Enum):
    STDOUT = "stdout"
    STDERR = "stderr"
    STATUS = "status"
    CONNECTED = "connected"
    HISTORY = "history"


@dataclass
class StreamLine:
    id: str
    type: StreamEventType
    data: str
    timestamp: str


@dataclass
class JobBuffer:
    lines: list[StreamLine] = field(default_factory=list)
    event_counter: int = 0
    is_complete: bool = False
    subscribers: set[asyncio.Queue] = field(default_factory=set)


class SSEManager:
    """Manages Server-Sent Events for job streaming."""

    def __init__(self):
        self._jobs: dict[str, JobBuffer] = {}
        self._cleanup_tasks: dict[str, asyncio.Task] = {}

    def _get_or_create_buffer(self, job_id: str) -> JobBuffer:
        """Get or create a buffer for a job."""
        if job_id not in self._jobs:
            self._jobs[job_id] = JobBuffer()
        return self._jobs[job_id]

    def broadcast(self, job_id: str, event_type: StreamEventType, data: str) -> None:
        """Broadcast data to all connected clients for a job."""
        buffer = self._get_or_create_buffer(job_id)

        buffer.event_counter += 1
        line = StreamLine(
            id=str(buffer.event_counter),
            type=event_type,
            data=data,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        # Add to buffer
        buffer.lines.append(line)

        # Trim buffer if it exceeds max size
        if len(buffer.lines) > MAX_BUFFER_LINES:
            buffer.lines = buffer.lines[-MAX_BUFFER_LINES:]

        # Notify all subscribers
        for queue in buffer.subscribers:
            try:
                queue.put_nowait(line)
            except asyncio.QueueFull:
                pass  # Skip if queue is full

    async def subscribe(
        self,
        job_id: str,
        last_event_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Subscribe to SSE events for a job.

        Yields SSE-formatted strings.
        """
        buffer = self._get_or_create_buffer(job_id)

        # Cancel any pending cleanup
        if job_id in self._cleanup_tasks:
            self._cleanup_tasks[job_id].cancel()
            del self._cleanup_tasks[job_id]

        # Create a queue for this subscriber
        queue: asyncio.Queue[StreamLine] = asyncio.Queue(maxsize=100)
        buffer.subscribers.add(queue)

        try:
            # Send connection confirmation
            buffer.event_counter += 1
            connected_line = StreamLine(
                id=str(buffer.event_counter),
                type=StreamEventType.CONNECTED,
                data=f"Connected to job {job_id}",
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
            yield self._format_sse(connected_line)

            # Send buffered history to late-joining clients
            if buffer.lines:
                history_start_id = int(last_event_id) if last_event_id else 0
                missed_lines = [
                    line for line in buffer.lines
                    if int(line.id) > history_start_id
                ]

                if missed_lines:
                    buffer.event_counter += 1
                    history_line = StreamLine(
                        id=str(buffer.event_counter),
                        type=StreamEventType.HISTORY,
                        data=json.dumps([{
                            "id": l.id,
                            "type": l.type.value,
                            "data": l.data,
                            "timestamp": l.timestamp
                        } for l in missed_lines]),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    )
                    yield self._format_sse(history_line)

            # Stream new events
            while True:
                try:
                    # Wait for new events with a timeout for keepalive
                    line = await asyncio.wait_for(queue.get(), timeout=30)
                    yield self._format_sse(line)

                    # Check if job is complete
                    if buffer.is_complete and queue.empty():
                        break
                except asyncio.TimeoutError:
                    # Send keepalive comment
                    yield ": keepalive\n\n"

                    # Check if job is complete
                    if buffer.is_complete and queue.empty():
                        break
        finally:
            buffer.subscribers.discard(queue)

    def _format_sse(self, line: StreamLine) -> str:
        """Format a StreamLine as an SSE message."""
        data = json.dumps({
            "id": line.id,
            "type": line.type.value,
            "data": line.data,
            "timestamp": line.timestamp,
        })
        return f"id: {line.id}\nevent: {line.type.value}\ndata: {data}\n\n"

    def complete_job(self, job_id: str) -> None:
        """Mark a job as complete and schedule cleanup."""
        buffer = self._jobs.get(job_id)
        if not buffer:
            return

        buffer.is_complete = True

        # Broadcast completion status
        self.broadcast(job_id, StreamEventType.STATUS, "completed")

        # Schedule cleanup after grace period
        async def cleanup_after_delay():
            await asyncio.sleep(CLEANUP_GRACE_PERIOD_SECONDS)
            self.cleanup(job_id)

        self._cleanup_tasks[job_id] = asyncio.create_task(cleanup_after_delay())

    def cleanup(self, job_id: str) -> None:
        """Clean up a job's SSE resources."""
        if job_id in self._cleanup_tasks:
            self._cleanup_tasks[job_id].cancel()
            del self._cleanup_tasks[job_id]

        if job_id in self._jobs:
            del self._jobs[job_id]

    def get_client_count(self, job_id: str) -> int:
        """Get the number of connected clients for a job."""
        buffer = self._jobs.get(job_id)
        return len(buffer.subscribers) if buffer else 0

    def has_buffer(self, job_id: str) -> bool:
        """Check if a job has any buffered output."""
        buffer = self._jobs.get(job_id)
        return len(buffer.lines) > 0 if buffer else False


# Singleton instance
sse_manager = SSEManager()
