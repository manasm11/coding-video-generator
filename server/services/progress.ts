import type { GenerationJob, ProgressDetails, LogEntry } from '../types.js';

const MAX_LOGS = 50;

export class ProgressTracker {
  private job: GenerationJob;

  constructor(job: GenerationJob) {
    this.job = job;
  }

  startPhase(
    status: GenerationJob['status'],
    totalSteps?: number
  ): void {
    this.job.status = status;
    this.job.progress = {
      currentAction: this.getDefaultAction(status),
      subProgress: 0,
      currentStep: totalSteps ? 1 : undefined,
      totalSteps,
      phaseStartedAt: new Date().toISOString(),
      logs: this.job.progress?.logs || [],
    };
    this.log(`Starting phase: ${status}`);
  }

  updateProgress(
    percent: number,
    action: string,
    step?: number,
    file?: string
  ): void {
    if (!this.job.progress) {
      this.job.progress = {
        currentAction: action,
        subProgress: percent,
        phaseStartedAt: new Date().toISOString(),
        logs: [],
      };
    }

    this.job.progress.subProgress = Math.min(100, Math.max(0, percent));
    this.job.progress.currentAction = action;

    if (step !== undefined) {
      this.job.progress.currentStep = step;
    }

    const logMessage = file
      ? `${action} (${file})`
      : action;
    this.log(`[${Math.round(percent)}%] ${logMessage}`);
  }

  log(message: string): void {
    if (!this.job.progress) {
      this.job.progress = {
        currentAction: '',
        subProgress: 0,
        phaseStartedAt: new Date().toISOString(),
        logs: [],
      };
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      message,
    };

    this.job.progress.logs.push(entry);

    // Keep only the last MAX_LOGS entries
    if (this.job.progress.logs.length > MAX_LOGS) {
      this.job.progress.logs = this.job.progress.logs.slice(-MAX_LOGS);
    }

    // Also log to console for debugging
    console.log(`[${this.job.id}] ${message}`);
  }

  completePhase(): void {
    if (this.job.progress) {
      this.job.progress.subProgress = 100;
      this.log(`Phase completed: ${this.job.status}`);
    }
  }

  setError(message: string): void {
    this.job.status = 'error';
    this.job.error = message;
    this.job.completedAt = new Date().toISOString();
    this.log(`Error: ${message}`);
  }

  getJob(): GenerationJob {
    return this.job;
  }

  private getDefaultAction(status: GenerationJob['status']): string {
    const actions: Record<GenerationJob['status'], string> = {
      pending: 'Waiting to start...',
      generating_content: 'AI is generating tutorial content...',
      generating_audio: 'Converting text to speech...',
      rendering: 'Rendering video...',
      completed: 'Done!',
      error: 'An error occurred',
    };
    return actions[status];
  }
}
