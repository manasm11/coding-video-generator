# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered coding video tutorial generator. Users enter a text prompt, and the system generates a narrated coding tutorial video using Claude AI (content), Edge-TTS (narration), and Remotion (video rendering). There are two backend implementations (TypeScript/Express and Python/FastAPI) that share the same React frontend.

## Commands

### Development

```bash
# Frontend dev server (port 3001, proxies /api to :8001)
npm run dev

# TypeScript backend (port 8001)
npm run server

# Python backend (port 8001)
npm run server:python
# or: uvicorn server_python.main:app --reload --port 8001

# Remotion video preview
npm run remotion:preview
```

### Build

```bash
npm run build          # tsc && vite build
```

### Python Dependencies

```bash
pip install -r server_python/requirements.txt
```

## Architecture

### Video Generation Pipeline

The core workflow is a 3-phase async pipeline triggered by `POST /api/generate`:

1. **Content Generation** — Spawns `claude -p "{prompt}" --output-format json` as a subprocess. Parses the JSON response into a structured tutorial (title, steps with code snippets and explanations).
2. **Audio Generation** — Uses Edge-TTS to generate MP3 narration for each step's explanation text. Configurable voice speed (0.5-1.5x).
3. **Video Rendering** — Bundles and renders a Remotion composition (`CodingTutorial`) into an MP4 (1920x1080 @ 30fps, H.264). Each step gets a code editor with typewriter animation synced to its audio.

Jobs are tracked in-memory (no database). Real-time progress is streamed to the frontend via SSE (`/api/jobs/{jobId}/stream`) with reconnection and event buffering support.

### Dual Backends

`server/` (TypeScript/Express) and `server_python/` (FastAPI) are functionally equivalent — same API endpoints, same job model, same pipeline. Key difference: Python uses `mutagen` for MP3 duration detection and serves audio files over HTTP for Remotion (since `file://` doesn't work in that context).

### Frontend

React + Vite + Ant Design. Key pieces:
- `src/hooks/useJobStream.ts` — EventSource-based SSE hook with auto-reconnect and history replay
- `src/components/PromptForm.tsx` — Form with language/difficulty/speed selectors
- `src/components/VideoList.tsx` — Job table with polling (1.5s) for status updates

### Remotion Video Composition

Located in `server/remotion/`. The `CodingTutorial` component renders:
- Animated title card with spring physics
- Per-step code editor with syntax highlighting (`CodeEditor.tsx`) and typewriter effect (`TypeWriter.tsx`)
- Explanation panel with synced audio playback
- 30-frame transitions between steps

Font sizing is dynamic (16-26px range) to prevent code overflow.

### Job Lifecycle

```
pending → generating_content → generating_audio → rendering → completed
                                                             ↘ error
```

### Timeout Limits

- Content generation: 5 min
- Audio per step: 1 min
- Remotion bundling: 3 min
- Video rendering: 10 min

## Key Types

Shared types are in `server/types.ts` (TS) and `server_python/models/schemas.py` (Python). The `GenerateRequest` includes: prompt, language (10 supported), difficulty level, and narration speed.
