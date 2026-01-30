# Coding Video Tutorial Generator

A full-stack web application that automatically generates professional coding tutorial videos from text prompts. It uses AI (Claude) to generate structured tutorial content, text-to-speech for narration, and Remotion to render polished video output.

## Features

- **AI-Powered Content Generation** - Enter a simple prompt and Claude AI generates structured tutorial content with code snippets and explanations
- **Multi-Language Support** - Supports 10+ programming languages including JavaScript, Python, Java, C++, Go, Rust, TypeScript, and more
- **Text-to-Speech Narration** - Natural-sounding narration using Edge-TTS with configurable speed
- **Professional Video Output** - 1920x1080 videos with animated title cards, code typing animations, syntax highlighting, and smooth transitions
- **Preview Before Rendering** - Review generated content before committing to video rendering
- **Job Management** - Track progress of video generation with real-time status updates

## Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite 5
- Ant Design 5

**Backend:**
- Express.js
- Remotion 4 (video rendering)
- Edge-TTS (text-to-speech)
- Claude CLI (AI content generation)

## Prerequisites

- Node.js 18+
- Claude CLI installed and configured
- FFmpeg (required by Remotion)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/coding-video-generator.git
   cd coding-video-generator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment example and configure:
   ```bash
   cp .env.example .env
   ```

## Usage

1. Start the backend server:
   ```bash
   npm run server
   ```

2. In a separate terminal, start the frontend:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3001 in your browser

4. Enter a tutorial prompt (e.g., "Create a tutorial on JavaScript array methods"), select your options, and click Generate

## Available Scripts

- `npm run dev` - Start frontend development server (port 3001)
- `npm run server` - Start backend server (port 8001)
- `npm run build` - Build for production
- `npm run remotion:preview` - Preview Remotion video composition

## Project Structure

```
coding-video-generator/
├── src/                     # Frontend (React + Vite)
│   ├── App.tsx             # Main application component
│   ├── api/                # API client
│   └── components/         # React components
├── server/                 # Backend (Express)
│   ├── routes/             # API endpoints
│   ├── services/           # Claude, TTS, Remotion services
│   └── remotion/           # Video composition components
├── public/                 # Static assets
└── package.json
```

## API Endpoints

- `POST /api/generate` - Start video generation
- `POST /api/preview` - Generate content preview
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:jobId` - Get job status
- `DELETE /api/jobs/:jobId` - Delete a job
- `GET /api/videos/:jobId` - Download generated video

## License

MIT
