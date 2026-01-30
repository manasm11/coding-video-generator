import React from 'react';
import { Composition } from 'remotion';
import { CodingTutorial } from './Composition';
import type { TutorialContent } from '../types';

export interface TutorialProps {
  content: TutorialContent;
  audioFiles: string[];
  stepDurations: number[];
}

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

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CodingTutorial"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={CodingTutorial as any}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          content: defaultContent,
          audioFiles: [],
          stepDurations: [300],
        }}
      />
    </>
  );
};
