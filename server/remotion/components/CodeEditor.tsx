import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface CodeEditorProps {
  code: string;
  language: string;
  typingDuration: number;
}

// Simple syntax highlighting colors
const getTokenColor = (token: string, language: string): string => {
  const keywords: Record<string, string[]> = {
    javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'new', 'this', 'true', 'false', 'null', 'undefined'],
    typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'new', 'this', 'true', 'false', 'null', 'undefined', 'interface', 'type', 'extends', 'implements'],
    python: ['def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'try', 'except', 'with', 'as', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'lambda', 'self'],
    java: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'return', 'if', 'else', 'for', 'while', 'new', 'this', 'static', 'void', 'int', 'String', 'boolean', 'true', 'false', 'null'],
  };

  const langKeywords = keywords[language] || keywords.javascript;

  if (langKeywords.includes(token)) {
    return '#569cd6'; // Blue for keywords
  }
  if (/^['"`].*['"`]$/.test(token)) {
    return '#ce9178'; // Orange for strings
  }
  if (/^\d+$/.test(token)) {
    return '#b5cea8'; // Green for numbers
  }
  if (token.startsWith('//') || token.startsWith('#')) {
    return '#6a9955'; // Green for comments
  }
  if (/^[A-Z][a-zA-Z]*$/.test(token)) {
    return '#4ec9b0'; // Teal for class names
  }

  return '#d4d4d4'; // Default white
};

const tokenize = (code: string): string[] => {
  // Simple tokenizer that splits on whitespace and punctuation while preserving them
  const tokens: string[] = [];
  let current = '';

  for (const char of code) {
    if (/[\s\(\)\[\]\{\}\,\;\:\.\=\+\-\*\/\<\>\!\&\|]/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language,
  typingDuration,
}) => {
  const frame = useCurrentFrame();

  // Calculate how many characters to show
  const totalChars = code.length;
  const charsToShow = Math.floor(
    interpolate(frame, [0, typingDuration], [0, totalChars], {
      extrapolateRight: 'clamp',
    })
  );

  const visibleCode = code.slice(0, charsToShow);
  const lines = visibleCode.split('\n');

  // Cursor blink
  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  return (
    <div
      style={{
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #3c3c3c',
      }}
    >
      {/* Editor header */}
      <div
        style={{
          backgroundColor: '#323233',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f57' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#febc2e' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#28c840' }} />
        <span style={{ marginLeft: 12, color: '#858585', fontSize: 14 }}>
          tutorial.{language === 'python' ? 'py' : language === 'typescript' ? 'ts' : 'js'}
        </span>
      </div>

      {/* Code area */}
      <div
        style={{
          flex: 1,
          padding: 20,
          overflow: 'auto',
          fontSize: 20,
          lineHeight: 1.6,
        }}
      >
        {lines.map((line, lineIndex) => {
          const tokens = tokenize(line);
          const isLastLine = lineIndex === lines.length - 1;

          return (
            <div key={lineIndex} style={{ display: 'flex', minHeight: 32 }}>
              {/* Line number */}
              <span
                style={{
                  color: '#858585',
                  width: 50,
                  textAlign: 'right',
                  paddingRight: 20,
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                {lineIndex + 1}
              </span>

              {/* Code content */}
              <span style={{ whiteSpace: 'pre' }}>
                {tokens.map((token, tokenIndex) => (
                  <span
                    key={tokenIndex}
                    style={{ color: getTokenColor(token, language) }}
                  >
                    {token}
                  </span>
                ))}

                {/* Cursor at end of last line */}
                {isLastLine && charsToShow < totalChars && cursorVisible && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 2,
                      height: 24,
                      backgroundColor: '#aeafad',
                      marginLeft: 2,
                      verticalAlign: 'text-bottom',
                    }}
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CodeEditor;
