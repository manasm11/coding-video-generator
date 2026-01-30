import { spawn } from 'child_process';
import type { TutorialContent } from '../types.js';
import type { ProgressTracker } from './progress.js';
import { withTimeout, TIMEOUTS } from '../utils/timeout.js';
import { sseManager } from './sse-manager.js';

export async function generateTutorialContent(
  prompt: string,
  language: string = 'javascript',
  style: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  tracker?: ProgressTracker,
  jobId?: string
): Promise<TutorialContent> {
  const styleDescriptions = {
    beginner: 'very simple, with detailed explanations of every concept',
    intermediate: 'moderately complex, assuming familiarity with basic programming concepts',
    advanced: 'complex, assuming deep knowledge of the language and programming patterns',
  };

  const fullPrompt = `You are an expert programming instructor creating video tutorial content.
Generate structured tutorial content that will be used to create an educational coding video.

Your response MUST be valid JSON matching this exact structure:
{
  "title": "A concise, descriptive title for the tutorial",
  "steps": [
    {
      "code": "The code snippet for this step (properly escaped for JSON)",
      "explanation": "A clear, spoken explanation of what this code does (2-3 sentences, suitable for text-to-speech narration)",
      "language": "The programming language"
    }
  ]
}

Guidelines:
- Create 3-6 logical steps that build upon each other
- Each code snippet should be complete and runnable when possible
- Explanations should be conversational and suitable for narration
- The difficulty level should be: ${styleDescriptions[style]}
- Use ${language} for all code examples
- Make explanations engaging but concise (good for 10-20 seconds of narration each)
- Escape any special characters in code properly for JSON

Create a coding tutorial about: ${prompt}

Respond with ONLY valid JSON, no markdown code blocks or additional text.`;

  tracker?.updateProgress(10, 'Preparing prompt for AI...');

  const generatePromise = new Promise<TutorialContent>((resolve, reject) => {
    const claude = spawn('claude', ['-p', fullPrompt, '--output-format', 'json'], {
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let hasReceivedData = false;

    tracker?.updateProgress(20, 'AI is generating content...');

    claude.stdout.on('data', (data) => {
      stdout += data;
      // Broadcast to SSE clients
      if (jobId) {
        sseManager.broadcast(jobId, 'stdout', data.toString());
      }
      if (!hasReceivedData) {
        hasReceivedData = true;
        tracker?.updateProgress(50, 'Receiving AI response...');
      }
    });

    claude.stderr.on('data', (data) => {
      stderr += data;
      // Broadcast to SSE clients
      if (jobId) {
        sseManager.broadcast(jobId, 'stderr', data.toString());
      }
    });

    claude.on('close', (code) => {
      if (code !== 0) {
        console.error('Claude CLI stderr:', stderr);
        reject(new Error(`Claude CLI failed with code ${code}: ${stderr}`));
        return;
      }

      tracker?.updateProgress(80, 'Parsing tutorial content...');

      try {
        // Parse the JSON output from Claude CLI
        // The --output-format json wraps the response in a JSON object with a "result" field
        let text = stdout;

        try {
          const cliResponse = JSON.parse(stdout);
          // If the CLI wraps the response, extract the result
          if (cliResponse.result) {
            text = cliResponse.result;
          }
        } catch {
          // If stdout isn't valid JSON wrapper, use it directly
          text = stdout;
        }

        // Extract JSON from the response (handle potential markdown code blocks)
        let jsonStr = text;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }

        // Also try to extract just the JSON object if there's extra text
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }

        const content = JSON.parse(jsonStr.trim()) as TutorialContent;

        // Validate structure
        if (!content.title || !Array.isArray(content.steps) || content.steps.length === 0) {
          throw new Error('Invalid tutorial structure');
        }

        for (const step of content.steps) {
          if (!step.code || !step.explanation || !step.language) {
            throw new Error('Invalid step structure');
          }
        }

        tracker?.updateProgress(100, 'Content generation complete');
        resolve(content);
      } catch (error) {
        console.error('Failed to parse tutorial content:', error);
        console.error('Raw stdout:', stdout);
        reject(new Error('Failed to parse tutorial content from Claude CLI response'));
      }
    });

    claude.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });

  return withTimeout(
    generatePromise,
    TIMEOUTS.CONTENT_GENERATION,
    'Content generation'
  );
}
