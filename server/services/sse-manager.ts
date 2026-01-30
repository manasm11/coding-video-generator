import type { Response } from 'express';

export type StreamEventType = 'stdout' | 'stderr' | 'status' | 'connected' | 'history';

export interface StreamLine {
  id: string;
  type: StreamEventType;
  data: string;
  timestamp: string;
}

interface SSEClient {
  res: Response;
  lastEventId: number;
}

interface JobBuffer {
  lines: StreamLine[];
  clients: Set<SSEClient>;
  eventCounter: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const MAX_BUFFER_LINES = 500;
const CLEANUP_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

export class SSEManager {
  private jobs: Map<string, JobBuffer> = new Map();

  /**
   * Add a client to receive SSE events for a job
   */
  addClient(jobId: string, res: Response, lastEventId?: string): void {
    let buffer = this.jobs.get(jobId);

    if (!buffer) {
      buffer = {
        lines: [],
        clients: new Set(),
        eventCounter: 0,
      };
      this.jobs.set(jobId, buffer);
    }

    // Clear any pending cleanup timer since we have a new client
    if (buffer.cleanupTimer) {
      clearTimeout(buffer.cleanupTimer);
      buffer.cleanupTimer = undefined;
    }

    const client: SSEClient = {
      res,
      lastEventId: lastEventId ? parseInt(lastEventId, 10) : 0,
    };

    buffer.clients.add(client);

    // Send connection confirmation
    this.sendToClient(client, {
      id: String(++buffer.eventCounter),
      type: 'connected',
      data: `Connected to job ${jobId}`,
      timestamp: new Date().toISOString(),
    });

    // Send buffered history to late-joining clients
    if (buffer.lines.length > 0) {
      const historyStartId = lastEventId ? parseInt(lastEventId, 10) : 0;
      const missedLines = buffer.lines.filter(
        (line) => parseInt(line.id, 10) > historyStartId
      );

      if (missedLines.length > 0) {
        this.sendToClient(client, {
          id: String(buffer.eventCounter),
          type: 'history',
          data: JSON.stringify(missedLines),
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(jobId, client);
    });
  }

  /**
   * Remove a client from a job's SSE connections
   */
  private removeClient(jobId: string, client: SSEClient): void {
    const buffer = this.jobs.get(jobId);
    if (buffer) {
      buffer.clients.delete(client);
    }
  }

  /**
   * Broadcast data to all connected clients for a job
   */
  broadcast(jobId: string, type: StreamEventType, data: string): void {
    let buffer = this.jobs.get(jobId);

    if (!buffer) {
      buffer = {
        lines: [],
        clients: new Set(),
        eventCounter: 0,
      };
      this.jobs.set(jobId, buffer);
    }

    const line: StreamLine = {
      id: String(++buffer.eventCounter),
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    // Add to buffer
    buffer.lines.push(line);

    // Trim buffer if it exceeds max size
    if (buffer.lines.length > MAX_BUFFER_LINES) {
      buffer.lines = buffer.lines.slice(-MAX_BUFFER_LINES);
    }

    // Send to all connected clients
    for (const client of buffer.clients) {
      this.sendToClient(client, line);
    }
  }

  /**
   * Send a line to a specific client
   */
  private sendToClient(client: SSEClient, line: StreamLine): void {
    try {
      client.res.write(`id: ${line.id}\n`);
      client.res.write(`event: ${line.type}\n`);
      client.res.write(`data: ${JSON.stringify(line)}\n\n`);
    } catch (error) {
      // Client disconnected, will be cleaned up on 'close' event
      console.error('Error sending to SSE client:', error);
    }
  }

  /**
   * Mark a job as complete and schedule cleanup
   */
  completeJob(jobId: string): void {
    const buffer = this.jobs.get(jobId);
    if (!buffer) return;

    // Send completion status to all clients
    this.broadcast(jobId, 'status', 'completed');

    // Schedule cleanup after grace period
    buffer.cleanupTimer = setTimeout(() => {
      this.cleanup(jobId);
    }, CLEANUP_GRACE_PERIOD_MS);
  }

  /**
   * Clean up a job's SSE resources
   */
  cleanup(jobId: string): void {
    const buffer = this.jobs.get(jobId);
    if (!buffer) return;

    // Clear any pending cleanup timer
    if (buffer.cleanupTimer) {
      clearTimeout(buffer.cleanupTimer);
    }

    // Close all client connections
    for (const client of buffer.clients) {
      try {
        client.res.end();
      } catch {
        // Client already disconnected
      }
    }

    // Remove job from map
    this.jobs.delete(jobId);
  }

  /**
   * Get the number of connected clients for a job
   */
  getClientCount(jobId: string): number {
    const buffer = this.jobs.get(jobId);
    return buffer ? buffer.clients.size : 0;
  }

  /**
   * Check if a job has any buffered output
   */
  hasBuffer(jobId: string): boolean {
    const buffer = this.jobs.get(jobId);
    return buffer ? buffer.lines.length > 0 : false;
  }
}

// Singleton instance
export const sseManager = new SSEManager();
