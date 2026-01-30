import asyncio
import json
import math
from pathlib import Path
from typing import Optional

from server_python.models.schemas import TutorialContent
from server_python.config import OUTPUT_DIR, REMOTION_DIR, Timeouts
from server_python.utils.timeout import with_timeout
from server_python.services.progress import ProgressTracker
from server_python.services.tts import get_audio_duration


async def ensure_output_dir() -> None:
    """Ensure the output directory exists."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


async def render_video(
    job_id: str,
    content: TutorialContent,
    audio_files: list[str],
    tracker: Optional[ProgressTracker] = None
) -> str:
    """
    Render video using Remotion (via subprocess).

    Uses the Remotion programmatic API through Node.js.

    Args:
        job_id: The job ID
        content: Tutorial content
        audio_files: List of audio file paths
        tracker: Optional progress tracker

    Returns:
        Path to the rendered video
    """
    await ensure_output_dir()

    if tracker:
        tracker.update_progress(5, "Calculating audio durations...")

    # Calculate durations for each step based on audio files
    step_durations = []
    for audio_file in audio_files:
        try:
            duration = await get_audio_duration(audio_file)
            step_durations.append(math.ceil(duration * 30))  # Convert to frames at 30fps
        except Exception:
            step_durations.append(300)  # Default 10 seconds at 30fps

    # Prepare input props - serve audio files via HTTP
    # Remotion can't handle file:// URLs, so we serve them from our server
    audio_file_urls = []
    for i, f in enumerate(audio_files):
        # Use HTTP URL served by our Python backend
        audio_file_urls.append(f"http://localhost:8001/api/audio/{job_id}/{i}")

    input_props = {
        "content": content.model_dump(),
        "audioFiles": audio_file_urls,
        "stepDurations": step_durations,
    }

    output_path = OUTPUT_DIR / f"{job_id}.mp4"

    if tracker:
        tracker.update_progress(10, "Starting Remotion render...")

    # Convert paths for the Node.js script
    remotion_dir_str = str(REMOTION_DIR).replace("\\", "/")
    output_path_str = str(output_path).replace("\\", "/")

    # Run the Remotion render using the Node.js programmatic API
    render_script = f"""
const {{ bundle }} = require('@remotion/bundler');
const {{ renderMedia, selectComposition }} = require('@remotion/renderer');
const path = require('path');

async function main() {{
    const entryPoint = path.join({json.dumps(remotion_dir_str)}, 'index.ts');
    const inputProps = {json.dumps(input_props)};
    const outputPath = {json.dumps(output_path_str)};

    console.log(JSON.stringify({{ type: 'progress', phase: 'bundling', percent: 0 }}));

    const bundleLocation = await bundle({{
        entryPoint,
        onProgress: (progress) => {{
            console.log(JSON.stringify({{ type: 'progress', phase: 'bundling', percent: progress }}));
        }},
    }});

    console.log(JSON.stringify({{ type: 'progress', phase: 'selecting', percent: 100 }}));

    const composition = await selectComposition({{
        serveUrl: bundleLocation,
        id: 'CodingTutorial',
        inputProps,
    }});

    const totalDuration = {json.dumps(step_durations)}.reduce((a, b) => a + b, 0) + ({len(step_durations)} * 30);

    const compositionWithDuration = {{
        ...composition,
        durationInFrames: totalDuration,
    }};

    console.log(JSON.stringify({{ type: 'progress', phase: 'rendering', percent: 0 }}));

    await renderMedia({{
        composition: compositionWithDuration,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps,
        onProgress: ({{ progress }}) => {{
            console.log(JSON.stringify({{ type: 'progress', phase: 'rendering', percent: progress * 100 }}));
        }},
    }});

    console.log(JSON.stringify({{ type: 'complete', outputPath }}));
}}

main().catch((err) => {{
    console.error(JSON.stringify({{ type: 'error', message: err.message }}));
    process.exit(1);
}});
"""

    async def run_render():
        # Run Node.js with the render script from the project root
        project_root = str(REMOTION_DIR.parent.parent).replace("\\", "/")

        process = await asyncio.create_subprocess_exec(
            "node",
            "-e", render_script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=project_root,
        )

        # Process stdout for progress updates
        async def read_stdout():
            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                line_text = line.decode("utf-8").strip()
                if not line_text:
                    continue

                try:
                    data = json.loads(line_text)
                    if data.get("type") == "progress" and tracker:
                        phase = data.get("phase", "")
                        percent = data.get("percent", 0)

                        if phase == "bundling":
                            # Map bundling progress (0-100) to 10-40% range
                            mapped_progress = 10 + (percent * 0.3)
                            tracker.update_progress(mapped_progress, f"Bundling: {int(percent)}%")
                        elif phase == "selecting":
                            tracker.update_progress(40, "Bundle complete, preparing composition...")
                        elif phase == "rendering":
                            # Map render progress (0-100) to 50-100% range
                            mapped_progress = 50 + (percent * 0.5)
                            tracker.update_progress(mapped_progress, f"Rendering video: {int(percent)}%")
                    elif data.get("type") == "complete":
                        if tracker:
                            tracker.update_progress(100, "Video render complete!")
                        print("Video rendered successfully!")
                except json.JSONDecodeError:
                    # Not JSON, just log it
                    print(f"Remotion: {line_text}")

        # Process stderr
        async def read_stderr():
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                print(f"Remotion stderr: {line.decode('utf-8').strip()}")

        await asyncio.gather(read_stdout(), read_stderr())

        return_code = await process.wait()

        if return_code != 0:
            raise RuntimeError(f"Remotion render failed with code {return_code}")

        return str(output_path)

    return await with_timeout(
        run_render(),
        Timeouts.VIDEO_RENDER + Timeouts.REMOTION_BUNDLE,  # Combined timeout
        "Video rendering"
    )


async def get_video_path(job_id: str) -> Optional[str]:
    """
    Get the video path for a job if it exists.

    Args:
        job_id: The job ID

    Returns:
        The video path or None
    """
    video_path = OUTPUT_DIR / f"{job_id}.mp4"
    if video_path.exists():
        return str(video_path)
    return None


async def delete_video(job_id: str) -> None:
    """
    Delete the video file for a job.

    Args:
        job_id: The job ID
    """
    video_path = OUTPUT_DIR / f"{job_id}.mp4"
    try:
        video_path.unlink()
    except Exception:
        # Ignore if file doesn't exist
        pass
