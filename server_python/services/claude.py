import asyncio
import json
import re
from typing import Optional

from server_python.models.schemas import TutorialContent, TutorialStep, StyleLevel
from server_python.config import Timeouts
from server_python.utils.timeout import with_timeout
from server_python.services.progress import ProgressTracker
from server_python.services.sse_manager import sse_manager, StreamEventType


STYLE_DESCRIPTIONS = {
    StyleLevel.BEGINNER: "very simple, with detailed explanations of every concept",
    StyleLevel.INTERMEDIATE: "moderately complex, assuming familiarity with basic programming concepts",
    StyleLevel.ADVANCED: "complex, assuming deep knowledge of the language and programming patterns",
}


def build_prompt(prompt: str, language: str, style: StyleLevel) -> str:
    """Build the full prompt for Claude."""
    style_desc = STYLE_DESCRIPTIONS.get(style, STYLE_DESCRIPTIONS[StyleLevel.BEGINNER])

    return f"""You are an expert programming instructor creating video tutorial content.
Generate structured tutorial content that will be used to create an educational coding video.

Your response MUST be valid JSON matching this exact structure:
{{
  "title": "A concise, descriptive title for the tutorial",
  "steps": [
    {{
      "code": "The code snippet for this step (properly escaped for JSON)",
      "explanation": "A clear, spoken explanation of what this code does (2-3 sentences, suitable for text-to-speech narration)",
      "language": "The programming language"
    }}
  ]
}}

Guidelines:
- Create 3-6 logical steps that build upon each other
- Each code snippet should be complete and runnable when possible
- Explanations should be conversational and suitable for narration
- The difficulty level should be: {style_desc}
- Use {language} for all code examples
- Make explanations engaging but concise (good for 10-20 seconds of narration each)
- Escape any special characters in code properly for JSON

Create a coding tutorial about: {prompt}

Respond with ONLY valid JSON, no markdown code blocks or additional text."""


async def generate_tutorial_content(
    prompt: str,
    language: str = "javascript",
    style: StyleLevel = StyleLevel.BEGINNER,
    tracker: Optional[ProgressTracker] = None,
    job_id: Optional[str] = None,
) -> TutorialContent:
    """
    Generate tutorial content using Claude CLI.

    Args:
        prompt: The user's prompt for the tutorial
        language: Programming language for the tutorial
        style: Difficulty level
        tracker: Optional progress tracker
        job_id: Optional job ID for SSE streaming

    Returns:
        TutorialContent with title and steps
    """
    full_prompt = build_prompt(prompt, language, style)

    if tracker:
        tracker.update_progress(10, "Preparing prompt for AI...")

    async def run_claude() -> TutorialContent:
        if tracker:
            tracker.update_progress(20, "AI is generating content...")

        # Spawn Claude CLI process
        process = await asyncio.create_subprocess_exec(
            "claude",
            "-p", full_prompt,
            "--output-format", "json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout_data = b""
        stderr_data = b""
        has_received_data = False

        # Read stdout and stderr concurrently
        async def read_stdout():
            nonlocal stdout_data, has_received_data
            while True:
                chunk = await process.stdout.read(1024)
                if not chunk:
                    break
                stdout_data += chunk

                # Broadcast to SSE clients
                if job_id:
                    sse_manager.broadcast(job_id, StreamEventType.STDOUT, chunk.decode("utf-8", errors="replace"))

                if not has_received_data:
                    has_received_data = True
                    if tracker:
                        tracker.update_progress(50, "Receiving AI response...")

        async def read_stderr():
            nonlocal stderr_data
            while True:
                chunk = await process.stderr.read(1024)
                if not chunk:
                    break
                stderr_data += chunk

                # Broadcast to SSE clients
                if job_id:
                    sse_manager.broadcast(job_id, StreamEventType.STDERR, chunk.decode("utf-8", errors="replace"))

        # Run both readers concurrently
        await asyncio.gather(read_stdout(), read_stderr())

        # Wait for process to complete
        return_code = await process.wait()

        if return_code != 0:
            stderr_text = stderr_data.decode("utf-8", errors="replace")
            print(f"Claude CLI stderr: {stderr_text}")
            raise RuntimeError(f"Claude CLI failed with code {return_code}: {stderr_text}")

        if tracker:
            tracker.update_progress(80, "Parsing tutorial content...")

        # Parse the output
        stdout_text = stdout_data.decode("utf-8")
        text = stdout_text

        # Try to extract from CLI JSON wrapper
        try:
            cli_response = json.loads(stdout_text)
            if "result" in cli_response:
                text = cli_response["result"]
        except json.JSONDecodeError:
            text = stdout_text

        # Extract JSON from potential markdown code blocks
        json_str = text
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", json_str)
        if json_match:
            json_str = json_match.group(1)

        # Also try to extract just the JSON object if there's extra text
        object_match = re.search(r"\{[\s\S]*\}", json_str)
        if object_match:
            json_str = object_match.group(0)

        # Parse the JSON
        try:
            content_dict = json.loads(json_str.strip())
        except json.JSONDecodeError as e:
            print(f"Failed to parse tutorial content: {e}")
            print(f"Raw stdout: {stdout_text}")
            raise RuntimeError("Failed to parse tutorial content from Claude CLI response")

        # Validate structure
        if not content_dict.get("title") or not content_dict.get("steps"):
            raise RuntimeError("Invalid tutorial structure: missing title or steps")

        steps = content_dict["steps"]
        if not isinstance(steps, list) or len(steps) == 0:
            raise RuntimeError("Invalid tutorial structure: steps must be a non-empty array")

        # Validate each step
        validated_steps = []
        for step in steps:
            if not step.get("code") or not step.get("explanation") or not step.get("language"):
                raise RuntimeError("Invalid step structure: missing code, explanation, or language")
            validated_steps.append(TutorialStep(
                code=step["code"],
                explanation=step["explanation"],
                language=step["language"],
            ))

        if tracker:
            tracker.update_progress(100, "Content generation complete")

        return TutorialContent(
            title=content_dict["title"],
            steps=validated_steps,
        )

    return await with_timeout(
        run_claude(),
        Timeouts.CONTENT_GENERATION,
        "Content generation"
    )
