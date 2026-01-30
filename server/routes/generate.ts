import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { GenerationJob, GenerateRequest } from '../types.js';
import { generateTutorialContent } from '../services/claude.js';
import { generateAllAudio, cleanupAudio } from '../services/tts.js';
import { renderVideo, deleteVideo } from '../services/remotion.js';
import { ProgressTracker } from '../services/progress.js';
import { sseManager } from '../services/sse-manager.js';

const router = Router();

// In-memory job storage (use a database in production)
// Export for progress tracker access
export const jobs = new Map<string, GenerationJob>();

// Preview content without generating video
router.post('/preview', async (req, res) => {
  try {
    const { prompt, language = 'javascript', style = 'beginner' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const content = await generateTutorialContent(prompt, language, style);
    res.json(content);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Start video generation
router.post('/generate', async (req, res) => {
  try {
    const { prompt, language = 'javascript', style = 'beginner', voiceSpeed = 1.0 }: GenerateRequest = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const jobId = uuidv4();
    const job: GenerationJob = {
      id: jobId,
      status: 'pending',
      prompt,
      language,
      style,
      voiceSpeed,
      createdAt: new Date().toISOString(),
    };

    jobs.set(jobId, job);

    // Start async generation
    processJob(jobId).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
      const failedJob = jobs.get(jobId);
      if (failedJob) {
        failedJob.status = 'error';
        failedJob.error = error.message;
        failedJob.completedAt = new Date().toISOString();
      }
    });

    res.json({ jobId, status: job.status });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to start generation' });
  }
});

// Process job asynchronously
async function processJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  // Set start time
  job.startedAt = new Date().toISOString();

  // Create progress tracker
  const tracker = new ProgressTracker(job);

  try {
    // Step 1: Generate content
    tracker.startPhase('generating_content');
    sseManager.broadcast(jobId, 'status', 'generating_content');
    console.log(`[${jobId}] Generating content...`);

    const content = await generateTutorialContent(
      job.prompt,
      job.language || 'javascript',
      job.style || 'beginner',
      tracker,
      jobId
    );
    job.content = content;
    tracker.completePhase();

    // Step 2: Generate audio
    tracker.startPhase('generating_audio', content.steps.length);
    sseManager.broadcast(jobId, 'status', 'generating_audio');
    console.log(`[${jobId}] Generating audio...`);

    const explanations = content.steps.map((step) => step.explanation);
    const audioFiles = await generateAllAudio(
      explanations,
      jobId,
      job.voiceSpeed,
      tracker
    );
    job.audioFiles = audioFiles;
    tracker.completePhase();

    // Step 3: Render video
    tracker.startPhase('rendering');
    sseManager.broadcast(jobId, 'status', 'rendering');
    console.log(`[${jobId}] Rendering video...`);

    const videoPath = await renderVideo({
      jobId,
      content,
      audioFiles,
      tracker,
    });

    job.videoPath = videoPath;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    tracker.completePhase();
    console.log(`[${jobId}] Completed!`);

    // Cleanup audio files after successful render
    await cleanupAudio(jobId);

    // Signal job completion to SSE clients
    sseManager.completeJob(jobId);
  } catch (error) {
    console.error(`[${jobId}] Error:`, error);
    tracker.setError(error instanceof Error ? error.message : 'Unknown error');
    // Broadcast error status and complete job
    sseManager.broadcast(jobId, 'status', 'error');
    sseManager.completeJob(jobId);
  }
}

// Get job status
router.get('/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Get all jobs
router.get('/jobs', (_, res) => {
  const allJobs = Array.from(jobs.values());
  res.json(allJobs);
});

// Delete job
router.delete('/jobs/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Delete video file if exists
  await deleteVideo(req.params.jobId);

  // Clean up audio files
  await cleanupAudio(req.params.jobId);

  // Remove from memory
  jobs.delete(req.params.jobId);

  res.json({ success: true });
});

// Serve video files
router.get('/videos/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.status !== 'completed' || !job.videoPath) {
    return res.status(404).json({ error: 'Video not found' });
  }

  res.sendFile(job.videoPath);
});

// SSE endpoint for real-time job output streaming
router.get('/jobs/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Prevent response timeout
  req.socket.setTimeout(0);

  // Get Last-Event-ID for reconnection support
  const lastEventId = req.headers['last-event-id'] as string | undefined;

  // Add client to SSE manager
  sseManager.addClient(req.params.jobId, res, lastEventId);

  // Send initial status
  sseManager.broadcast(req.params.jobId, 'status', job.status);
});

export default router;
