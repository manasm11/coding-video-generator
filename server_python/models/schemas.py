from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    PENDING = "pending"
    GENERATING_CONTENT = "generating_content"
    GENERATING_AUDIO = "generating_audio"
    RENDERING = "rendering"
    COMPLETED = "completed"
    ERROR = "error"


class StyleLevel(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class TutorialStep(BaseModel):
    code: str
    explanation: str
    language: str


class TutorialContent(BaseModel):
    title: str
    steps: list[TutorialStep]


class LogEntry(BaseModel):
    timestamp: str
    message: str


class ProgressDetails(BaseModel):
    currentAction: str
    subProgress: float = 0
    currentStep: Optional[int] = None
    totalSteps: Optional[int] = None
    phaseStartedAt: str
    logs: list[LogEntry] = Field(default_factory=list)


class GenerationJob(BaseModel):
    id: str
    status: JobStatus = JobStatus.PENDING
    prompt: str
    language: Optional[str] = "javascript"
    style: Optional[StyleLevel] = StyleLevel.BEGINNER
    voiceSpeed: Optional[float] = 1.0
    content: Optional[TutorialContent] = None
    audioFiles: Optional[list[str]] = None
    videoPath: Optional[str] = None
    error: Optional[str] = None
    createdAt: str
    startedAt: Optional[str] = None
    completedAt: Optional[str] = None
    progress: Optional[ProgressDetails] = None

    class Config:
        use_enum_values = True


class GenerateRequest(BaseModel):
    prompt: str
    language: Optional[str] = "javascript"
    style: Optional[StyleLevel] = StyleLevel.BEGINNER
    voiceSpeed: Optional[float] = 1.0
