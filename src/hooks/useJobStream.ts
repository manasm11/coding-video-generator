import { useState, useEffect, useCallback, useRef } from 'react';
import type { StreamLine, StreamEventType } from '../types';

interface UseJobStreamOptions {
  enabled?: boolean;
  maxLines?: number;
}

interface UseJobStreamResult {
  lines: StreamLine[];
  connected: boolean;
  error: string | null;
  clearLines: () => void;
}

const DEFAULT_MAX_LINES = 1000;

export function useJobStream(
  jobId: string | null,
  options: UseJobStreamOptions = {}
): UseJobStreamResult {
  const { enabled = true, maxLines = DEFAULT_MAX_LINES } = options;

  const [lines, setLines] = useState<StreamLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const clearLines = useCallback(() => {
    setLines([]);
  }, []);

  const addLine = useCallback((line: StreamLine) => {
    setLines((prev) => {
      const newLines = [...prev, line];
      // Trim to maxLines
      if (newLines.length > maxLines) {
        return newLines.slice(-maxLines);
      }
      return newLines;
    });
  }, [maxLines]);

  const handleHistoryEvent = useCallback((historyData: string) => {
    try {
      const historyLines = JSON.parse(historyData) as StreamLine[];
      setLines((prev) => {
        // Merge history, avoiding duplicates by id
        const existingIds = new Set(prev.map((l) => l.id));
        const newLines = historyLines.filter((l) => !existingIds.has(l.id));
        const merged = [...prev, ...newLines];
        // Sort by id and trim
        merged.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
        if (merged.length > maxLines) {
          return merged.slice(-maxLines);
        }
        return merged;
      });
    } catch (e) {
      console.error('Failed to parse history event:', e);
    }
  }, [maxLines]);

  useEffect(() => {
    if (!jobId || !enabled) {
      return;
    }

    const url = `http://localhost:8001/api/jobs/${jobId}/stream`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onerror = () => {
      setConnected(false);
      // EventSource will auto-reconnect, so we don't set error immediately
      // Only set error if the connection is completely closed
      if (eventSource.readyState === EventSource.CLOSED) {
        setError('Connection closed');
      }
    };

    // Handle different event types
    const handleEvent = (event: MessageEvent, type: StreamEventType) => {
      try {
        const line = JSON.parse(event.data) as StreamLine;

        if (type === 'history') {
          handleHistoryEvent(line.data);
        } else {
          addLine(line);
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };

    eventSource.addEventListener('connected', (e) => handleEvent(e as MessageEvent, 'connected'));
    eventSource.addEventListener('stdout', (e) => handleEvent(e as MessageEvent, 'stdout'));
    eventSource.addEventListener('stderr', (e) => handleEvent(e as MessageEvent, 'stderr'));
    eventSource.addEventListener('status', (e) => handleEvent(e as MessageEvent, 'status'));
    eventSource.addEventListener('history', (e) => handleEvent(e as MessageEvent, 'history'));

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [jobId, enabled, addLine, handleHistoryEvent]);

  return {
    lines,
    connected,
    error,
    clearLines,
  };
}
