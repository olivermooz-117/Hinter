"""
Local speech-to-text via faster-whisper (Whisper models, runs offline).

No OpenAI credits needed for transcription.
Optional: WHISPER_MODEL=tiny.en|base.en|small.en (default base.en)
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_model = None


def _get_model():
    global _model
    if _model is not None:
        return _model

    from faster_whisper import WhisperModel

    name = os.environ.get("WHISPER_MODEL", "base.en")
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute = os.environ.get("WHISPER_COMPUTE", "int8")
    print(f"Loading local Whisper model '{name}' ({device}/{compute})…")
    _model = WhisperModel(name, device=device, compute_type=compute)
    print("Whisper model ready.")
    return _model


def transcribe_audio(audio_bytes: bytes, filename: str = "chunk.webm") -> str:
    """Transcribe an audio blob with local Whisper. Returns text."""
    if not audio_bytes or len(audio_bytes) < 500:
        return ""

    suffix = Path(filename).suffix or ".webm"
    if suffix.lower() not in {
        ".webm", ".wav", ".mp3", ".mp4", ".m4a", ".ogg", ".mpeg", ".mpga",
    }:
        suffix = ".webm"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        model = _get_model()
        segments, _info = model.transcribe(
            tmp_path,
            language="en",
            beam_size=1,
            vad_filter=True,
        )
        parts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
        return " ".join(parts).strip()
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass