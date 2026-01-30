import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';
import { CodeEditor } from './components/CodeEditor';
import { TypeWriter } from './components/TypeWriter';
import type { TutorialProps } from './Root';

const TRANSITION_FRAMES = 30;

export const CodingTutorial: React.FC<TutorialProps> = ({
  content,
  audioFiles,
  stepDurations,
}) => {
  // Calculate step start frames
  const stepStarts: number[] = [];
  let currentStart = 0;
  for (let i = 0; i < stepDurations.length; i++) {
    stepStarts.push(currentStart);
    currentStart += stepDurations[i] + TRANSITION_FRAMES;
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#1e1e1e',
        fontFamily: "'Fira Code', 'Consolas', monospace",
      }}
    >
      {/* Title at the beginning */}
      <Sequence from={0} durationInFrames={Math.min(90, stepDurations[0] || 90)}>
        <TitleCard title={content.title} />
      </Sequence>

      {/* Render each step */}
      {content.steps.map((step, index) => {
        const startFrame = stepStarts[index];
        const duration = stepDurations[index] || 300;

        return (
          <React.Fragment key={index}>
            <Sequence from={startFrame} durationInFrames={duration + TRANSITION_FRAMES}>
              <StepContent
                stepNumber={index + 1}
                totalSteps={content.steps.length}
                code={step.code}
                explanation={step.explanation}
                language={step.language}
                duration={duration}
              />
            </Sequence>

            {/* Audio for this step */}
            {audioFiles[index] && (
              <Sequence from={startFrame} durationInFrames={duration}>
                <Audio src={audioFiles[index]} />
              </Sequence>
            )}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

interface TitleCardProps {
  title: string;
}

const TitleCard: React.FC<TitleCardProps> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 15, 75, 90], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });

  const scale = spring({
    frame,
    fps,
    config: {
      damping: 100,
      stiffness: 200,
      mass: 0.5,
    },
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        opacity,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          textAlign: 'center',
          padding: '40px',
        }}
      >
        <h1
          style={{
            color: '#e94560',
            fontSize: 64,
            margin: 0,
            fontWeight: 'bold',
            textShadow: '0 4px 20px rgba(233, 69, 96, 0.3)',
          }}
        >
          {title}
        </h1>
        <div
          style={{
            marginTop: 30,
            color: '#0f3460',
            backgroundColor: '#e94560',
            padding: '12px 30px',
            borderRadius: 30,
            fontSize: 24,
            display: 'inline-block',
          }}
        >
          Coding Tutorial
        </div>
      </div>
    </AbsoluteFill>
  );
};

interface StepContentProps {
  stepNumber: number;
  totalSteps: number;
  code: string;
  explanation: string;
  language: string;
  duration: number;
}

const StepContent: React.FC<StepContentProps> = ({
  stepNumber,
  totalSteps,
  code,
  explanation,
  language,
  duration,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in animation
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Slide in animation
  const slideIn = spring({
    frame,
    fps,
    config: {
      damping: 100,
      stiffness: 200,
      mass: 0.5,
    },
  });

  const translateY = interpolate(slideIn, [0, 1], [50, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#1e1e1e',
        padding: 60,
        opacity: fadeIn,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 30,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: '#007acc',
            color: 'white',
            padding: '10px 25px',
            borderRadius: 25,
            fontSize: 20,
            fontWeight: 'bold',
          }}
        >
          Step {stepNumber} of {totalSteps}
        </div>
        <div
          style={{
            backgroundColor: '#2d2d2d',
            color: '#9cdcfe',
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 18,
            textTransform: 'uppercase',
          }}
        >
          {language}
        </div>
      </div>

      {/* Main content area */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: 40,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {/* Code editor */}
        <div style={{ flex: 3 }}>
          <CodeEditor
            code={code}
            language={language}
            typingDuration={Math.min(duration * 0.6, 180)}
          />
        </div>

        {/* Explanation panel */}
        <div style={{ flex: 2 }}>
          <div
            style={{
              backgroundColor: '#252526',
              borderRadius: 12,
              padding: 30,
              height: '100%',
              border: '1px solid #3c3c3c',
            }}
          >
            <div
              style={{
                color: '#569cd6',
                fontSize: 18,
                marginBottom: 15,
                fontWeight: 'bold',
              }}
            >
              📝 Explanation
            </div>
            <TypeWriter
              text={explanation}
              typingDuration={Math.min(duration * 0.4, 120)}
            />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: 60,
          right: 60,
          height: 4,
          backgroundColor: '#3c3c3c',
          borderRadius: 2,
        }}
      >
        <div
          style={{
            width: `${(stepNumber / totalSteps) * 100}%`,
            height: '100%',
            backgroundColor: '#007acc',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
