"""Speech-to-text via OpenAI Whisper API."""

from __future__ import annotations

import io
import os

from openai import OpenAI


def transcribe_audio(audio_bytes: bytes, filename: str = "chunk.webm") -> str:
    """Send an audio blob to Whisper and return the transcript text."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key.startswith("sk-"):
        raise RuntimeError("OPENAI_API_KEY not set in environment / .env")

    client = OpenAI(api_key=api_key)

    if not filename.lower().endswith(
        (".webm", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".ogg")
    ):
        filename = "chunk.webm"

    file_obj = io.BytesIO(audio_bytes)
    file_obj.name = filename

    try:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, file_obj, "application/octet-stream"),
            response_format="text",
        )
    except Exception as e:
        raise RuntimeError(
            f"Whisper failed ({len(audio_bytes)} bytes, {filename}): {e}"
        ) from e

    if isinstance(result, str):
        return result.strip()
    return (getattr(result, "text", None) or str(result)).strip()