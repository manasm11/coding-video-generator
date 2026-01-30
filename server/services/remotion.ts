import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import type { TutorialContent } from '../types.js';
import { getAudioDuration } from './tts.js';
import type { ProgressTracker } from './progress.js';
import { withTimeout, TIMEOUTS } from '../utils/timeout.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const REMOTION_ENTRY = path.join(__dirname, '..', 'remotion', 'index.ts');

async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

export interface RenderOptions {
  jobId: string;
  content: TutorialContent;
  audioFiles: string[];
  tracker?: ProgressTracker;
}

export async function renderVideo(options: RenderOptions): Promise<string> {
  const { jobId, content, audioFiles, tracker } = options;

  await ensureOutputDir();

  tracker?.updateProgress(5, 'Calculating audio durations...');

  // Calculate durations for each step based on audio files
  const stepDurations: number[] = [];
  for (const audioFile of audioFiles) {
    try {
      const duration = await getAudioDuration(audioFile);
      stepDurations.push(Math.ceil(duration * 30)); // Convert to frames at 30fps
    } catch {
      stepDurations.push(300); // Default 10 seconds at 30fps
    }
  }

  // Bundle the Remotion project with progress tracking
  tracker?.updateProgress(10, 'Bundling Remotion project...');
  console.log('Bundling Remotion project...');

  const bundlePromise = bundle({
    entryPoint: REMOTION_ENTRY,
    onProgress: (progress) => {
      // Map bundling progress (0-100) to 10-40% range
      const mappedProgress = 10 + (progress * 0.3);
      tracker?.updateProgress(mappedProgress, `Bundling: ${progress}%`);
      if (progress % 20 === 0) {
        console.log(`Bundling: ${progress}%`);
      }
    },
  });

  const bundleLocation = await withTimeout(
    bundlePromise,
    TIMEOUTS.REMOTION_BUNDLE,
    'Remotion bundling'
  );

  tracker?.updateProgress(40, 'Bundle complete, preparing composition...');

  // Prepare input props
  const inputProps = {
    content,
    audioFiles: audioFiles.map((f) => `file://${f.replace(/\\/g, '/')}`),
    stepDurations,
  };

  // Select composition
  console.log('Selecting composition...');
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'CodingTutorial',
    inputProps,
  });

  // Calculate total duration
  const totalDuration = stepDurations.reduce((a, b) => a + b, 0) + (stepDurations.length * 30); // Add transitions

  // Override composition duration
  const compositionWithDuration = {
    ...composition,
    durationInFrames: totalDuration,
  };

  // Render the video
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  tracker?.updateProgress(50, 'Starting video render...');
  console.log('Rendering video...');

  const renderPromise = renderMedia({
    composition: compositionWithDuration,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      // Map render progress (0-1) to 50-100% range
      const percent = progress * 100;
      const mappedProgress = 50 + (percent * 0.5);
      tracker?.updateProgress(mappedProgress, `Rendering video: ${Math.round(percent)}%`);
      if (Math.round(percent) % 10 === 0) {
        console.log(`Rendering: ${Math.round(percent)}%`);
      }
    },
  });

  await withTimeout(
    renderPromise,
    TIMEOUTS.VIDEO_RENDER,
    'Video rendering'
  );

  tracker?.updateProgress(100, 'Video render complete!');
  console.log('Video rendered successfully!');
  return outputPath;
}

export async function getVideoPath(jobId: string): Promise<string | null> {
  const videoPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
  try {
    await fs.access(videoPath);
    return videoPath;
  } catch {
    return null;
  }
}

export async function deleteVideo(jobId: string): Promise<void> {
  const videoPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
  try {
    await fs.unlink(videoPath);
  } catch {
    // Ignore if file doesn't exist
  }
}
