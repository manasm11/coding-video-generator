import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface TypeWriterProps {
  text: string;
  typingDuration: number;
  startFrame?: number;
}

export const TypeWriter: React.FC<TypeWriterProps> = ({
  text,
  typingDuration,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - startFrame);

  // Calculate how many characters to show
  const totalChars = text.length;
  const charsToShow = Math.floor(
    interpolate(adjustedFrame, [0, typingDuration], [0, totalChars], {
      extrapolateRight: 'clamp',
    })
  );

  const visibleText = text.slice(0, charsToShow);

  // Cursor blink (only show while typing)
  const cursorVisible = charsToShow < totalChars && Math.floor(frame / 15) % 2 === 0;

  return (
    <div
      style={{
        color: '#d4d4d4',
        fontSize: 24,
        lineHeight: 1.7,
        letterSpacing: 0.3,
      }}
    >
      {visibleText}
      {cursorVisible && (
        <span
          style={{
            display: 'inline-block',
            width: 2,
            height: 28,
            backgroundColor: '#aeafad',
            marginLeft: 2,
            verticalAlign: 'text-bottom',
          }}
        />
      )}
    </div>
  );
};

export default TypeWriter;
