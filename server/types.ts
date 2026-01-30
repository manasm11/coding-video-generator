export interface TutorialStep {
  code: string;
  explanation: string;
  language: string;
}

export interface TutorialContent {
  title: string;
  steps: TutorialStep[];
}

export interface LogEntry {
  timestamp: string;
  message: string;
}

export interface ProgressDetails {
  currentAction: string;
  subProgress: number;
  currentStep?: number;
  totalSteps?: number;
  phaseStartedAt: string;
  logs: LogEntry[];
}

export interface GenerationJob {
  id: string;
  status: 'pending' | 'generating_content' | 'generating_audio' | 'rendering' | 'completed' | 'error';
  prompt: string;
  language?: string;
  style?: 'beginner' | 'intermediate' | 'advanced';
  voiceSpeed?: number;
  content?: TutorialContent;
  audioFiles?: string[];
  videoPath?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress?: ProgressDetails;
}

export interface GenerateRequest {
  prompt: string;
  language?: string;
  style?: 'beginner' | 'intermediate' | 'advanced';
  voiceSpeed?: number;
}
