import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import type { TutorialContent } from '../types.js';
import { getAudioDuration } from './tts.js';

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
}

export async function renderVideo(options: RenderOptions): Promise<string> {
  const { jobId, content, audioFiles } = options;

  await ensureOutputDir();

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

  // Bundle the Remotion project
  console.log('Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: REMOTION_ENTRY,
    onProgress: (progress) => {
      if (progress % 20 === 0) {
        console.log(`Bundling: ${progress}%`);
      }
    },
  });

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

  console.log('Rendering video...');
  await renderMedia({
    composition: compositionWithDuration,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 10 === 0) {
        console.log(`Rendering: ${Math.round(progress * 100)}%`);
      }
    },
  });

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
