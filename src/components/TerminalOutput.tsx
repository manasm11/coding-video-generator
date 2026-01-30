import { useEffect, useRef, useState } from 'react';
import type { StreamLine } from '../types';
import { useJobStream } from '../hooks/useJobStream';

interface TerminalOutputProps {
  jobId: string;
  enabled?: boolean;
  defaultExpanded?: boolean;
}

export function TerminalOutput({
  jobId,
  enabled = true,
  defaultExpanded = true,
}: TerminalOutputProps) {
  const { lines, connected, error, clearLines } = useJobStream(jobId, { enabled });
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Handle manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const getLineColor = (type: StreamLine['type']): string => {
    switch (type) {
      case 'stdout':
        return '#22c55e'; // green-500
      case 'stderr':
        return '#ef4444'; // red-500
      case 'status':
      case 'connected':
        return '#3b82f6'; // blue-500
      default:
        return '#9ca3af'; // gray-400
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const renderLineContent = (line: StreamLine): string => {
    // For status events, show a friendly message
    if (line.type === 'status') {
      const statusMessages: Record<string, string> = {
        generating_content: 'Phase: Generating content...',
        generating_audio: 'Phase: Generating audio...',
        rendering: 'Phase: Rendering video...',
        completed: 'Job completed successfully!',
        error: 'Job failed with error',
      };
      return statusMessages[line.data] || `Status: ${line.data}`;
    }

    if (line.type === 'connected') {
      return line.data;
    }

    // For stdout/stderr, return the raw data
    return line.data;
  };

  return (
    <div className="terminal-output">
      <div className="terminal-header">
        <button
          onClick={() => setExpanded(!expanded)}
          className="terminal-toggle"
        >
          <span className="terminal-toggle-icon">{expanded ? '▼' : '▶'}</span>
          <span>CLI Output</span>
          <span
            className={`connection-indicator ${connected ? 'connected' : 'disconnected'}`}
          />
        </button>
        {expanded && (
          <div className="terminal-controls">
            <label className="auto-scroll-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              <span>Auto-scroll</span>
            </label>
            <button onClick={clearLines} className="clear-button">
              Clear
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div
          ref={terminalRef}
          className="terminal-content"
          onScroll={handleScroll}
        >
          {error && (
            <div className="terminal-error">
              Connection error: {error}
            </div>
          )}
          {lines.length === 0 && !error && (
            <div className="terminal-placeholder">
              Waiting for output...
            </div>
          )}
          {lines.map((line) => (
            <div key={line.id} className="terminal-line">
              <span className="terminal-timestamp">
                [{formatTimestamp(line.timestamp)}]
              </span>
              <span
                className="terminal-content-text"
                style={{ color: getLineColor(line.type) }}
              >
                {renderLineContent(line)}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .terminal-output {
          background: #1e1e1e;
          border-radius: 8px;
          overflow: hidden;
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 12px;
          margin-top: 12px;
          border: 1px solid #333;
        }

        .terminal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #2d2d2d;
          border-bottom: 1px solid #333;
        }

        .terminal-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          color: #e0e0e0;
          cursor: pointer;
          font-size: 12px;
          font-family: inherit;
          padding: 0;
        }

        .terminal-toggle:hover {
          color: #fff;
        }

        .terminal-toggle-icon {
          font-size: 10px;
        }

        .connection-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-left: 4px;
        }

        .connection-indicator.connected {
          background: #22c55e;
        }

        .connection-indicator.disconnected {
          background: #ef4444;
        }

        .terminal-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .auto-scroll-toggle {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #9ca3af;
          cursor: pointer;
          font-size: 11px;
        }

        .auto-scroll-toggle input {
          margin: 0;
        }

        .clear-button {
          background: #3f3f3f;
          border: none;
          color: #9ca3af;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        }

        .clear-button:hover {
          background: #4f4f4f;
          color: #e0e0e0;
        }

        .terminal-content {
          max-height: 300px;
          overflow-y: auto;
          padding: 8px 12px;
        }

        .terminal-error {
          color: #ef4444;
          padding: 8px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 4px;
          margin-bottom: 8px;
        }

        .terminal-placeholder {
          color: #6b7280;
          font-style: italic;
        }

        .terminal-line {
          display: flex;
          gap: 8px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .terminal-timestamp {
          color: #6b7280;
          flex-shrink: 0;
        }

        .terminal-content-text {
          flex: 1;
        }

        /* Scrollbar styling */
        .terminal-content::-webkit-scrollbar {
          width: 8px;
        }

        .terminal-content::-webkit-scrollbar-track {
          background: #1e1e1e;
        }

        .terminal-content::-webkit-scrollbar-thumb {
          background: #4b5563;
          border-radius: 4px;
        }

        .terminal-content::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
    </div>
  );
}
