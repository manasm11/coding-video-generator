export const TIMEOUTS = {
  CONTENT_GENERATION: 5 * 60 * 1000,  // 5 minutes for Claude CLI
  AUDIO_PER_STEP: 1 * 60 * 1000,      // 1 minute per TTS step
  REMOTION_BUNDLE: 3 * 60 * 1000,      // 3 minutes for bundling
  VIDEO_RENDER: 10 * 60 * 1000,        // 10 minutes for rendering
};

export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}
