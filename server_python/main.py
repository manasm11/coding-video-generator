import sys
from pathlib import Path

# Add server_python to path for imports when running directly
sys.path.insert(0, str(Path(__file__).parent.parent))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server_python.config import OUTPUT_DIR
from server_python.routers.generate import router as generate_router

# Create FastAPI app
app = FastAPI(
    title="Coding Video Generator API",
    description="Generate coding tutorial videos from prompts using Claude, Edge-TTS, and Remotion",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure output directory exists
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files for video serving (alternative to endpoint)
app.mount("/static/videos", StaticFiles(directory=str(OUTPUT_DIR)), name="videos")

# Include API routes
app.include_router(generate_router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "server_python.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
    )
