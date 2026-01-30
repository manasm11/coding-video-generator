import axios from 'axios';
import type { GenerateRequest, GenerateResponse, GenerationJob, TutorialContent } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function generateTutorial(request: GenerateRequest): Promise<GenerateResponse> {
  const response = await api.post<GenerateResponse>('/generate', request);
  return response.data;
}

export async function getJobStatus(jobId: string): Promise<GenerationJob> {
  const response = await api.get<GenerationJob>(`/jobs/${jobId}`);
  return response.data;
}

export async function getAllJobs(): Promise<GenerationJob[]> {
  const response = await api.get<GenerationJob[]>('/jobs');
  return response.data;
}

export async function previewContent(prompt: string): Promise<TutorialContent> {
  const response = await api.post<TutorialContent>('/preview', { prompt });
  return response.data;
}

export function getVideoUrl(jobId: string): string {
  return `/api/videos/${jobId}`;
}

export async function deleteJob(jobId: string): Promise<void> {
  await api.delete(`/jobs/${jobId}`);
}
