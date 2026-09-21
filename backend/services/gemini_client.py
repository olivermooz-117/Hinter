from __future__ import annotations

import os

from google import genai


def get_gemini_client():
    """Return a configured Gemini client for backend services."""
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=api_key)
