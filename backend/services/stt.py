"""Speech-to-text using the Google Gemini API."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from services.gemini_client import get_gemini_client


def _resolve_mime_type(filename: str, fallback: str = "audio/webm") -> str:
    suffix = (Path(filename).suffix or ".webm").lower()
    mime_map = {
        ".webm": "audio/webm",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".mp4": "audio/mp4",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".mpeg": "audio/mpeg",
        ".mpga": "audio/mpeg",
    }
    return mime_map.get(suffix, fallback)


def transcribe_audio(audio_bytes: bytes, filename: str = "chunk.webm") -> str:
    """Transcribe an audio blob with Gemini's transcription API."""
    if not audio_bytes or len(audio_bytes) < 500:
        return ""

    client = get_gemini_client()
    mime_type = _resolve_mime_type(filename)

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix or ".webm", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        file_obj = client.files.upload(file=tmp_path, config={"mime_type": mime_type})
        response = client.models.generate_content(
            model="gemini-3.5-transcribe",
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {"text": "Transcribe the spoken audio exactly as it is spoken."},
                        {"file": file_obj},
                    ],
                }
            ],
        )
        text = getattr(response, "text", None)
        if text is None:
            text = getattr(response, "candidates", None)
            if isinstance(text, list) and text:
                text = getattr(text[0], "content", None)
                if text is not None:
                    parts = getattr(text, "parts", None) or []
                    values = []
                    for part in parts:
                        if getattr(part, "text", None):
                            values.append(part.text)
                    text = "".join(values)
        if not text:
            return ""
        return str(text).strip()
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass