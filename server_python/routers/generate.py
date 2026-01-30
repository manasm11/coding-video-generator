import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from server_python.models.schemas import (
    GenerationJob,
    GenerateRequest,
    JobStatus,
    StyleLevel,
)
from server_python.services.progress import ProgressTracker
from server_python.services.sse_manager import sse_manager, StreamEventType
from server_python.services.claude import generate_tutorial_content
from server_python.services.tts import generate_all_audio, cleanup_audio
from server_python.services.remotion import render_video, delete_video


router = APIRouter()

# In-memory job storage (use a database in production)
jobs: dict[str, GenerationJob] = {}


@router.post("/preview")
async def preview_content(request: GenerateRequest):
    """Preview content without generating video."""
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    try:
        content = await generate_tutorial_content(
            request.prompt,
            request.language or "javascript",
            request.style or StyleLevel.BEGINNER,
        )
        return content.model_dump()
    except Exception as e:
        print(f"Preview error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate preview")


@router.post("/generate")
async def start_generation(request: GenerateRequest, background_tasks: BackgroundTasks):
    """Start video generation."""
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    job_id = str(uuid.uuid4())
    job = GenerationJob(
        id=job_id,
        status=JobStatus.PENDING,
        prompt=request.prompt,
        language=request.language or "javascript",
        style=request.style or StyleLevel.BEGINNER,
        voiceSpeed=request.voiceSpeed or 1.0,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )

    jobs[job_id] = job

    # Start async generation
    background_tasks.add_task(process_job, job_id)

    return {"jobId": job_id, "status": job.status}


async def process_job(job_id: str) -> None:
    """Process a generation job asynchronously."""
    job = jobs.get(job_id)
    if not job:
        return

    # Set start time
    job.startedAt = datetime.now(timezone.utc).isoformat()

    # Create progress tracker
    tracker = ProgressTracker(job)

    try:
        # Step 1: Generate content
        tracker.start_phase(JobStatus.GENERATING_CONTENT)
        sse_manager.broadcast(job_id, StreamEventType.STATUS, "generating_content")
        print(f"[{job_id}] Generating content...")

        content = await generate_tutorial_content(
            job.prompt,
            job.language or "javascript",
            job.style or StyleLevel.BEGINNER,
            tracker,
            job_id,
        )
        job.content = content
        tracker.complete_phase()

        # Step 2: Generate audio
        tracker.start_phase(JobStatus.GENERATING_AUDIO, len(content.steps))
        sse_manager.broadcast(job_id, StreamEventType.STATUS, "generating_audio")
        print(f"[{job_id}] Generating audio...")

        explanations = [step.explanation for step in content.steps]
        audio_files = await generate_all_audio(
            explanations,
            job_id,
            job.voiceSpeed or 1.0,
            tracker,
        )
        job.audioFiles = audio_files
        tracker.complete_phase()

        # Step 3: Render video
        tracker.start_phase(JobStatus.RENDERING)
        sse_manager.broadcast(job_id, StreamEventType.STATUS, "rendering")
        print(f"[{job_id}] Rendering video...")

        video_path = await render_video(
            job_id,
            content,
            audio_files,
            tracker,
        )

        job.videoPath = video_path
        job.status = JobStatus.COMPLETED
        job.completedAt = datetime.now(timezone.utc).isoformat()
        tracker.complete_phase()
        print(f"[{job_id}] Completed!")

        # Cleanup audio files after successful render
        await cleanup_audio(job_id)

        # Signal job completion to SSE clients
        sse_manager.complete_job(job_id)

    except Exception as e:
        print(f"[{job_id}] Error: {e}")
        tracker.set_error(str(e))
        # Broadcast error status and complete job
        sse_manager.broadcast(job_id, StreamEventType.STATUS, "error")
        sse_manager.complete_job(job_id)


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get job status."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.model_dump()


@router.get("/jobs")
async def list_jobs():
    """Get all jobs."""
    return [job.model_dump() for job in jobs.values()]


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its associated files."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Delete video file if exists
    await delete_video(job_id)

    # Clean up audio files
    await cleanup_audio(job_id)

    # Remove from memory
    del jobs[job_id]

    return {"success": True}


@router.get("/videos/{job_id}")
async def serve_video(job_id: str):
    """Serve video file."""
    job = jobs.get(job_id)
    if not job or job.status != JobStatus.COMPLETED or not job.videoPath:
        raise HTTPException(status_code=404, detail="Video not found")

    return FileResponse(
        job.videoPath,
        media_type="video/mp4",
        filename=f"{job_id}.mp4",
    )


@router.get("/audio/{job_id}/{step}")
async def serve_audio(job_id: str, step: int):
    """Serve audio file for Remotion rendering."""
    from server_python.config import AUDIO_DIR

    audio_path = AUDIO_DIR / f"{job_id}_step_{step}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")

    return FileResponse(
        str(audio_path),
        media_type="audio/mpeg",
        filename=f"{job_id}_step_{step}.mp3",
    )


@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str, request: Request):
    """SSE endpoint for real-time job output streaming."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get Last-Event-ID for reconnection support
    last_event_id = request.headers.get("Last-Event-ID")

    return StreamingResponse(
        sse_manager.subscribe(job_id, last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
