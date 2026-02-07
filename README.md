# Coding Video Tutorial Generator

A web application that generates professional coding tutorial videos from text prompts. It uses AI (Claude) to generate structured tutorial content, edge-tts for narration, and Remotion to render polished video output.

## Features

- **AI-Powered Content Generation** - Enter a prompt and Claude AI generates structured tutorial content with code snippets and explanations
- **Multi-Language Support** - 10 programming languages: JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust, Ruby, PHP
- **Text-to-Speech Narration** - Natural-sounding narration using Edge-TTS with configurable speed (0.5-1.5x)
- **Professional Video Output** - 1920x1080 videos with animated title cards, code typing animations, syntax highlighting, and transitions with accurate audio-synced durations
- **Preview Before Rendering** - Review generated content before committing to video rendering
- **Real-Time Progress** - Live terminal output via SSE and polling-based progress updates
- **Single Server** - Go backend serves HTML templates, API, and static files on one port

## Tech Stack

- **Backend:** Go (stdlib `net/http` router)
- **Templates:** [templ](https://templ.guide/) (type-safe, compiled Go templates)
- **Frontend:** [htmx](https://htmx.org/) + [Pico CSS](https://picocss.com/) (dark theme)
- **Video:** [Remotion](https://www.remotion.dev/) 4 (Node.js subprocess)
- **TTS:** [bytectlgo/edge-tts](https://github.com/bytectlgo/edge-tts) Go library
- **AI:** Claude CLI

## Prerequisites

- Go 1.22+
- Node.js 18+
- Claude CLI installed and configured
- FFmpeg (required by Remotion)
- templ CLI (`go install github.com/a-h/templ/cmd/templ@latest`)

## Installation

```bash
git clone https://github.com/yourusername/coding-video-generator.git
cd coding-video-generator

# Install Node.js dependencies (Remotion)
npm install

# Install Go dependencies
go mod download
```

## Usage

```bash
# Development (generate templates + run server)
make dev

# Or build and run
make build
make run
```

Open http://localhost:8001, enter a tutorial prompt, and click Generate.

## Available Commands

```bash
make dev       # Generate templates + run server
make build     # Build binary to bin/server
make run       # Build + run
make generate  # Generate templ templates only
make clean     # Clean build artifacts
air            # Hot-reload dev server (requires air)

npm run remotion:preview  # Preview Remotion composition
```

## Project Structure

```
coding-video-generator/
├── cmd/server/main.go          # Entry point, routing, server startup
├── internal/
│   ├── config/                 # Timeouts, paths, settings
│   ├── models/                 # Job, content, progress types
│   ├── handler/                # HTTP handlers (pages, API, SSE, files)
│   ├── service/                # Claude, TTS, Remotion, pipeline
│   ├── sse/                    # SSE fan-out manager
│   ├── job/                    # In-memory job store
│   └── progress/               # Progress tracking
├── templates/                  # templ templates
│   ├── layout.templ            # Base HTML (Pico CSS, htmx)
│   ├── pages/index.templ       # Main page
│   └── components/             # Form, job card, terminal, etc.
├── static/css/app.css          # Custom styles
├── server/remotion/            # Remotion video composition
├── package.json                # Remotion dependencies
├── go.mod / go.sum
└── Makefile
```

## API Endpoints

- `POST /api/generate` - Start video generation (form data)
- `POST /api/preview` - Generate content preview (form data)
- `GET /api/jobs` - List all jobs (JSON)
- `GET /api/jobs/{jobId}` - Get job status (JSON)
- `GET /api/jobs/{jobId}/card` - Job card HTML partial (htmx polling)
- `GET /api/jobs/{jobId}/stream` - SSE stream for terminal output
- `DELETE /api/jobs/{jobId}` - Delete a job
- `GET /api/videos/{jobId}` - Serve video file
- `GET /api/audio/{jobId}/{step}` - Serve audio file (for Remotion)

## License

MIT
