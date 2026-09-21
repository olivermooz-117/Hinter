"""LLM suggestion engine — short, actionable meeting co-pilot prompts."""

from __future__ import annotations

import os
from typing import List

from services.gemini_client import get_gemini_client


SYSTEM_PROMPT = """You are Hinter, a transparent AI meeting co-pilot.

You receive a rolling transcript of a live meeting. Your job is to suggest
short, useful things the user might say or do next.

Rules:
- Reply with 1–3 short suggestions only.
- Each suggestion must be one line.
- Keep each suggestion to approximately 15 words or fewer.
- Prefer clarifying questions, concise answers, action items, and talking points.
- No long summaries.
- No preamble.
- No markdown headers.
- If the transcript is empty or pure noise, reply with exactly: (listening)
- Format: one suggestion per line, plain text.
"""


def generate_suggestions(transcript_window: List[str]) -> str:
    """Given recent transcript lines, return short suggestion text."""

    if not transcript_window:
        return "(listening)"

    window = "\n".join(
        str(part).strip()
        for part in transcript_window[-30:]
        if str(part).strip()
    )

    if not window:
        return "(listening)"

    client = get_gemini_client()

    model = os.environ.get(
        "GEMINI_SUGGESTION_MODEL",
        "gemini-2.5-flash",
    )

    prompt = f"""{SYSTEM_PROMPT}

Transcript so far:

{window}

Suggestions:"""

    response = client.models.generate_content(
        model=model,
        contents=prompt,
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

    text = (text or "").strip()

    return text or "(listening)"