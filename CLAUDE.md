# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered coding video tutorial generator. Users enter a text prompt, and the system generates a narrated coding tutorial video using Claude AI (content), Edge-TTS (narration), and Remotion (video rendering). The backend is Go, serving templ templates with htmx for interactivity and Pico CSS for styling.

## Commands

### Development

```bash
# Generate templ templates + run server
make dev

# Hot-reload development (requires air: go install github.com/air-verse/air@latest)
air

# Build binary
make build

# Run built binary
make run

# Generate templ templates only
make generate

# Remotion video preview
npm run remotion:preview
```

### Prerequisites

```bash
# Install templ CLI
go install github.com/a-h/templ/cmd/templ@latest

# Install Node.js dependencies (for Remotion)
npm install
```

## Architecture

### Video Generation Pipeline

The core workflow is a 3-phase pipeline triggered by `POST /api/generate` (htmx form submission):

1. **Content Generation** — Spawns `claude -p "{prompt}" --output-format json` as a subprocess. Parses the JSON response into a structured tutorial (title, 3-8 steps with code snippets and explanations). Each code snippet is constrained to 25 lines max (`config.MaxLinesPerStep`) for video slide readability; longer concepts are split into multiple steps. Post-parse validation logs warnings for any violations.
2. **Audio Generation** — Uses the `bytectlgo/edge-tts` Go library to generate MP3 narration for each step. Configurable voice speed (0.5-1.5x).
3. **Video Rendering** — Bundles and renders a Remotion composition (`CodingTutorial`) into an MP4 (1920x1080 @ 30fps, H.264) via Node.js subprocess (with `--max-old-space-size=1024`). Chromium is configured with `enableMultiProcessOnLinux: false`, `--disable-dev-shm-usage`, and `--disable-gpu` for stability on Linux. Concurrency is set to 1. Audio durations are measured by Remotion's `calculateMetadata` (using `@remotion/media-utils`) for accurate frame-level sync.

Jobs are tracked in-memory with `sync.RWMutex`. Real-time progress via SSE streaming and htmx polling.

### Go Backend

Single Go server (`cmd/server/main.go`) using Go 1.22+ stdlib router. Key packages:

- `internal/config/` — Timeouts, paths, TTS voice settings, content generation limits
- `internal/models/` — GenerationJob, TutorialContent, enums
- `internal/job/` — Thread-safe in-memory job store
- `internal/handler/` — HTTP handlers (pages, API, SSE, file serving)
- `internal/service/` — Claude, TTS, Remotion subprocess wrappers + pipeline orchestration
- `internal/sse/` — SSE fan-out manager with event buffering and subscriber channels
- `internal/progress/` — Phase management and progress tracking

### Templates & Frontend

- `templates/` — templ templates (type-safe, compiled Go templates)
- `templates/layout.templ` — Base HTML with Pico CSS (dark theme) and htmx
- `templates/components/` — Reusable components (form, job card, progress bar, terminal, preview, toast)
- `static/css/app.css` — Terminal styling, toast animations, Pico CSS overrides
- htmx handles all interactivity: form submissions, job polling, SSE terminal streaming, delete confirmation

### Remotion Video Composition

Located in `server/remotion/`. The `CodingTutorial` component renders:
- Animated title card with spring physics
- Per-step code editor with syntax highlighting (`CodeEditor.tsx`) and typewriter effect (`TypeWriter.tsx`)
- Explanation panel with synced audio playback
- 30-frame transitions between steps

Font sizing is dynamic (16-26px range) to prevent code overflow.

**Audio duration measurement:** `Root.tsx` defines a `calculateMetadata` function that uses `@remotion/media-utils` (`getAudioDurationInSeconds`) to measure each audio file's actual duration in the Remotion browser context. This replaces the previous approach of passing pre-calculated durations from Go. The Go backend sends an empty `stepDurations` array; Remotion computes the real values and sets `durationInFrames` dynamically.

### Audio Duration Strategy

`GetAudioDuration()` in `internal/service/tts.go` uses a 3-tier fallback:
1. **ffmpeg full-decode** (primary) — most accurate for VBR MP3s without Xing/VBRI headers
2. **ffprobe** (fallback) — may underreport for VBR files
3. **File-size estimate** (last resort) — assumes 128kbps

All methods add a 0.5s buffer. Go-measured durations are logged for diagnostics only; Remotion measures its own durations for rendering.

### htmx Interaction Patterns

- **Generate:** `hx-post="/api/generate"` → returns job card HTML prepended to `#job-list`
- **Preview:** `hx-post="/api/preview"` → returns preview HTML into `#preview-panel`
- **Job polling:** Active job cards poll `hx-get="/api/jobs/{id}/card"` every 2s; stops when completed/error
- **Terminal:** `hx-ext="sse" sse-connect="/api/jobs/{id}/stream"` for real-time CLI output
- **Delete:** `hx-delete="/api/jobs/{id}"` with confirmation

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

- `internal/models/job.go` — Go types for jobs, tutorial content, progress
- `server/types.ts` — TypeScript types used by the Remotion video composition

The `GenerateRequest` includes: prompt, language (10 supported), difficulty level, and narration speed.
