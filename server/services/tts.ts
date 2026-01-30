import { ttsSave } from 'edge-tts';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProgressTracker } from './progress.js';
import { withTimeout, TIMEOUTS } from '../utils/timeout.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, '..', 'output', 'audio');

async function ensureAudioDir(): Promise<void> {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export async function generateAudio(
  text: string,
  outputPath: string,
  voiceSpeed: number = 1.0
): Promise<string> {
  await ensureAudioDir();

  const rate = voiceSpeed > 1 ? `+${Math.round((voiceSpeed - 1) * 100)}%` :
               voiceSpeed < 1 ? `-${Math.round((1 - voiceSpeed) * 100)}%` : '+0%';

  await ttsSave(text, outputPath, {
    voice: 'en-US-GuyNeural',
    rate,
  });

  return outputPath;
}

export async function generateAllAudio(
  explanations: string[],
  jobId: string,
  voiceSpeed: number = 1.0,
  tracker?: ProgressTracker
): Promise<string[]> {
  await ensureAudioDir();

  const audioPaths: string[] = [];
  const totalSteps = explanations.length;

  for (let i = 0; i < explanations.length; i++) {
    const stepNum = i + 1;
    const percent = Math.round((i / totalSteps) * 100);

    tracker?.updateProgress(
      percent,
      `Generating audio for step ${stepNum}/${totalSteps}`,
      stepNum
    );

    const outputPath = path.join(AUDIO_DIR, `${jobId}_step_${i}.mp3`);

    const audioPromise = generateAudio(explanations[i], outputPath, voiceSpeed);
    await withTimeout(
      audioPromise,
      TIMEOUTS.AUDIO_PER_STEP,
      `Audio generation for step ${stepNum}`
    );

    audioPaths.push(outputPath);
  }

  tracker?.updateProgress(100, 'Audio generation complete', totalSteps);

  return audioPaths;
}

export async function getAudioDuration(audioPath: string): Promise<number> {
  // Estimate duration based on file size or use default
  // For more accurate duration, you would need ffprobe
  try {
    const stats = await fs.stat(audioPath);
    // Rough estimate: MP3 at 128kbps = 16KB per second
    const estimatedDuration = stats.size / (16 * 1024);
    return Math.max(5, estimatedDuration);
  } catch {
    return 10; // Default to 10 seconds
  }
}

export async function cleanupAudio(jobId: string): Promise<void> {
  try {
    const files = await fs.readdir(AUDIO_DIR);
    const jobFiles = files.filter((f) => f.startsWith(`${jobId}_`));
    await Promise.all(
      jobFiles.map((f) => fs.unlink(path.join(AUDIO_DIR, f)))
    );
  } catch {
    // Ignore cleanup errors
  }
}
