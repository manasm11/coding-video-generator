from pathlib import Path
from typing import Optional

import edge_tts

from server_python.config import AUDIO_DIR, TTS_VOICE, Timeouts
from server_python.utils.timeout import with_timeout
from server_python.services.progress import ProgressTracker


async def ensure_audio_dir() -> None:
    """Ensure the audio output directory exists."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


async def generate_audio(
    text: str,
    output_path: Path,
    voice_speed: float = 1.0
) -> Path:
    """
    Generate audio from text using edge-tts.

    Args:
        text: The text to convert to speech
        output_path: Path to save the audio file
        voice_speed: Speed multiplier (1.0 = normal)

    Returns:
        The output path
    """
    await ensure_audio_dir()

    # Convert speed to rate string
    if voice_speed > 1:
        rate = f"+{round((voice_speed - 1) * 100)}%"
    elif voice_speed < 1:
        rate = f"-{round((1 - voice_speed) * 100)}%"
    else:
        rate = "+0%"

    # Create communicate instance and save
    communicate = edge_tts.Communicate(text, TTS_VOICE, rate=rate)
    await communicate.save(str(output_path))

    return output_path


async def generate_all_audio(
    explanations: list[str],
    job_id: str,
    voice_speed: float = 1.0,
    tracker: Optional[ProgressTracker] = None
) -> list[str]:
    """
    Generate audio files for all explanations.

    Args:
        explanations: List of text explanations to convert
        job_id: The job ID for file naming
        voice_speed: Speed multiplier
        tracker: Optional progress tracker

    Returns:
        List of audio file paths
    """
    await ensure_audio_dir()

    audio_paths: list[str] = []
    total_steps = len(explanations)

    for i, explanation in enumerate(explanations):
        step_num = i + 1
        percent = round((i / total_steps) * 100)

        if tracker:
            tracker.update_progress(
                percent,
                f"Generating audio for step {step_num}/{total_steps}",
                step_num
            )

        output_path = AUDIO_DIR / f"{job_id}_step_{i}.mp3"

        # Generate with timeout
        await with_timeout(
            generate_audio(explanation, output_path, voice_speed),
            Timeouts.AUDIO_PER_STEP,
            f"Audio generation for step {step_num}"
        )

        audio_paths.append(str(output_path))

    if tracker:
        tracker.update_progress(100, "Audio generation complete", total_steps)

    return audio_paths


async def get_audio_duration(audio_path: str) -> float:
    """
    Get actual audio duration using mutagen.

    Args:
        audio_path: Path to the audio file

    Returns:
        Duration in seconds
    """
    try:
        from mutagen.mp3 import MP3
        audio = MP3(audio_path)
        duration = audio.info.length
        # Add a small buffer (0.5 seconds) to ensure audio completes
        return duration + 0.5
    except Exception as e:
        print(f"Warning: Could not read audio duration for {audio_path}: {e}")
        # Fallback to file size estimate
        try:
            path = Path(audio_path)
            stats = path.stat()
            # Rough estimate: MP3 at 128kbps = 16KB per second
            estimated_duration = stats.st_size / (16 * 1024)
            return max(5.0, estimated_duration)
        except Exception:
            return 10.0  # Default to 10 seconds


async def cleanup_audio(job_id: str) -> None:
    """
    Clean up audio files for a job.

    Args:
        job_id: The job ID
    """
    try:
        for audio_file in AUDIO_DIR.glob(f"{job_id}_*"):
            try:
                audio_file.unlink()
            except Exception:
                pass
    except Exception:
        # Ignore cleanup errors
        pass
