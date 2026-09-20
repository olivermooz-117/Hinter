"""LLM suggestion engine — short, actionable meeting co-pilot prompts."""

from __future__ import annotations

import os
from typing import List

from openai import OpenAI

SYSTEM_PROMPT = """You are Hinter, a transparent AI meeting co-pilot.
You receive a rolling transcript of a live meeting. Your job is to suggest
short, useful things the user might say or do next.

Rules:
- Reply with 1–3 short suggestions only (each 1 line, max ~15 words)
- Prefer: clarifying questions, concise answers, action items, talking points
- No long summaries, no preamble, no markdown headers
- If the transcript is empty or pure noise, reply with exactly: (listening)
- Format: one suggestion per line, plain text
"""


def generate_suggestions(transcript_window: List[str]) -> str:
    """Given recent transcript lines, return short suggestion text."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key.startswith("sk-"):
        raise RuntimeError("OPENAI_API_KEY not set")

    window = "\n".join(transcript_window[-30:]).strip()
    if not window:
        return "(listening)"

    client = OpenAI(api_key=api_key)
    model = os.environ.get("HINTER_LLM_MODEL", "gpt-4o-mini")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript so far:\n\n{window}\n\nSuggestions:"},
        ],
        max_tokens=120,
        temperature=0.4,
    )
    text = (response.choices[0].message.content or "").strip()
    return text or "(listening)"