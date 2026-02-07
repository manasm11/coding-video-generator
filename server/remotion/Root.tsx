import React from 'react';
import { Composition } from 'remotion';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { CodingTutorial } from './Composition';
import type { TutorialContent } from '../types';

export interface TutorialProps {
  content: TutorialContent;
  audioFiles: string[];
  stepDurations: number[];
}

const FPS = 30;
const TRANSITION_FRAMES = 30;
const BUFFER_FRAMES = 15; // 0.5s buffer per step
const DEFAULT_STEP_FRAMES = 300; // 10s fallback

const defaultContent: TutorialContent = {
  title: 'Sample Tutorial',
  steps: [
    {
      code: 'console.log("Hello, World!");',
      explanation: 'This is a simple example showing how to print to the console.',
      language: 'javascript',
    },
  ],
};

const calculateMetadata: React.ComponentProps<
  typeof Composition<TutorialProps>
>['calculateMetadata'] = async ({ props }) => {
  const { audioFiles, content } = props;
  const numSteps = content.steps.length;

  let stepDurations: number[];

  if (audioFiles.length > 0) {
    // Measure audio durations in Remotion's browser context
    stepDurations = await Promise.all(
      audioFiles.map(async (url) => {
        try {
          const durationSec = await getAudioDurationInSeconds(url);
          return Math.ceil(durationSec * FPS) + BUFFER_FRAMES;
        } catch (e) {
          console.warn(`Failed to measure audio duration for ${url}:`, e);
          return DEFAULT_STEP_FRAMES;
        }
      })
    );
  } else {
    // Preview mode: use existing stepDurations from props or default
    stepDurations =
      props.stepDurations.length > 0
        ? props.stepDurations
        : Array(numSteps).fill(DEFAULT_STEP_FRAMES);
  }

  const totalDuration =
    stepDurations.reduce((a, b) => a + b, 0) + numSteps * TRANSITION_FRAMES;

  return {
    durationInFrames: totalDuration,
    props: {
      ...props,
      stepDurations,
    },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CodingTutorial"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={CodingTutorial as any}
        durationInFrames={300}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          content: defaultContent,
          audioFiles: [],
          stepDurations: [300],
        }}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
