from pathlib import Path

# Timeout settings (in seconds)
class Timeouts:
    CONTENT_GENERATION = 5 * 60  # 5 minutes for Claude CLI
    AUDIO_PER_STEP = 1 * 60      # 1 minute per TTS step
    REMOTION_BUNDLE = 3 * 60     # 3 minutes for bundling
    VIDEO_RENDER = 10 * 60       # 10 minutes for rendering


# Path settings
BASE_DIR = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"
AUDIO_DIR = OUTPUT_DIR / "audio"

# Project root (parent of server_python)
PROJECT_ROOT = BASE_DIR.parent
REMOTION_DIR = PROJECT_ROOT / "server" / "remotion"

# SSE settings
MAX_BUFFER_LINES = 500
CLEANUP_GRACE_PERIOD_SECONDS = 5 * 60  # 5 minutes

# Progress tracking
MAX_LOGS = 50

# TTS settings
TTS_VOICE = "en-US-GuyNeural"
