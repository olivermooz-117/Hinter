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
    file_obj = io.BytesIO(audio_bytes)
    file_obj.name = filename

    result = client.audio.transcriptions.create(
        model="whisper-1",
        file=file_obj,
        response_format="text",
    )
    # response_format=text returns a plain string
    if isinstance(result, str):
        return result.strip()
    return (getattr(result, "text", None) or str(result)).strip()