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


def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "chunk.webm",
) -> str:
    """Transcribe an audio blob with Gemini."""

    if not audio_bytes or len(audio_bytes) < 500:
        return ""

    client = get_gemini_client()
    mime_type = _resolve_mime_type(filename)

    tmp_path = None

    try:
        # Save the uploaded audio temporarily.
        with tempfile.NamedTemporaryFile(
            suffix=Path(filename).suffix or ".webm",
            delete=False,
        ) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        # Upload the audio file to Gemini.
        file_obj = client.files.upload(
            file=tmp_path,
            config={"mime_type": mime_type},
        )

        # Gemini's transcription model accepts the uploaded
        # file directly as the content.
        response = client.models.generate_content(
            model="gemini-3.5-transcribe",
            contents=[file_obj],
        )

        text = getattr(response, "text", None)

        # Fallback for responses where .text isn't directly available.
        if text is None:
            candidates = getattr(response, "candidates", None)

            if isinstance(candidates, list) and candidates:
                content = getattr(candidates[0], "content", None)

                if content is not None:
                    parts = getattr(content, "parts", None) or []

                    values = []

                    for part in parts:
                        part_text = getattr(part, "text", None)

                        if part_text:
                            values.append(part_text)

                    text = "".join(values)

        if not text:
            return ""

        return str(text).strip()

    finally:
        # Always remove the temporary audio file.
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass