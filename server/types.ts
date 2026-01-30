export interface TutorialStep {
  code: string;
  explanation: string;
  language: string;
}

export interface TutorialContent {
  title: string;
  steps: TutorialStep[];
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
}

export interface GenerateRequest {
  prompt: string;
  language?: string;
  style?: 'beginner' | 'intermediate' | 'advanced';
  voiceSpeed?: number;
}
