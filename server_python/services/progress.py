from datetime import datetime, timezone
from typing import Optional

from server_python.models.schemas import GenerationJob, ProgressDetails, LogEntry, JobStatus
from server_python.config import MAX_LOGS


class ProgressTracker:
    """Tracks progress for a generation job."""

    def __init__(self, job: GenerationJob):
        self.job = job

    def start_phase(self, status: JobStatus, total_steps: Optional[int] = None) -> None:
        """Start a new phase of the job."""
        self.job.status = status
        self.job.progress = ProgressDetails(
            currentAction=self._get_default_action(status),
            subProgress=0,
            currentStep=1 if total_steps else None,
            totalSteps=total_steps,
            phaseStartedAt=datetime.now(timezone.utc).isoformat(),
            logs=self.job.progress.logs if self.job.progress else [],
        )
        self.log(f"Starting phase: {status}")

    def update_progress(
        self,
        percent: float,
        action: str,
        step: Optional[int] = None,
        file: Optional[str] = None
    ) -> None:
        """Update progress within the current phase."""
        if not self.job.progress:
            self.job.progress = ProgressDetails(
                currentAction=action,
                subProgress=percent,
                phaseStartedAt=datetime.now(timezone.utc).isoformat(),
                logs=[],
            )

        self.job.progress.subProgress = max(0, min(100, percent))
        self.job.progress.currentAction = action

        if step is not None:
            self.job.progress.currentStep = step

        log_message = f"{action} ({file})" if file else action
        self.log(f"[{round(percent)}%] {log_message}")

    def log(self, message: str) -> None:
        """Add a log entry."""
        if not self.job.progress:
            self.job.progress = ProgressDetails(
                currentAction="",
                subProgress=0,
                phaseStartedAt=datetime.now(timezone.utc).isoformat(),
                logs=[],
            )

        entry = LogEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            message=message,
        )

        self.job.progress.logs.append(entry)

        # Keep only the last MAX_LOGS entries
        if len(self.job.progress.logs) > MAX_LOGS:
            self.job.progress.logs = self.job.progress.logs[-MAX_LOGS:]

        # Also log to console for debugging
        print(f"[{self.job.id}] {message}")

    def complete_phase(self) -> None:
        """Mark the current phase as complete."""
        if self.job.progress:
            self.job.progress.subProgress = 100
            self.log(f"Phase completed: {self.job.status}")

    def set_error(self, message: str) -> None:
        """Set job to error state."""
        self.job.status = JobStatus.ERROR
        self.job.error = message
        self.job.completedAt = datetime.now(timezone.utc).isoformat()
        self.log(f"Error: {message}")

    def get_job(self) -> GenerationJob:
        """Get the current job state."""
        return self.job

    def _get_default_action(self, status: JobStatus) -> str:
        """Get the default action description for a status."""
        actions = {
            JobStatus.PENDING: "Waiting to start...",
            JobStatus.GENERATING_CONTENT: "AI is generating tutorial content...",
            JobStatus.GENERATING_AUDIO: "Converting text to speech...",
            JobStatus.RENDERING: "Rendering video...",
            JobStatus.COMPLETED: "Done!",
            JobStatus.ERROR: "An error occurred",
        }
        return actions.get(status, "Processing...")
