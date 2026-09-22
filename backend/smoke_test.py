"""End-to-end smoke test for the Hinter backend, using a mocked Gemini client."""

from __future__ import annotations

import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

os.environ.setdefault("GEMINI_API_KEY", "smoketest-key")
os.environ.setdefault("HINTER_SUGGESTION_DEBOUNCE", "0")

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()

os.environ["HINTER_DB_PATH"] = _tmp_db.name

sys.path.insert(0, os.path.dirname(__file__))


def fake_gemini_response(text: str):
    response = MagicMock()
    response.text = text
    return response


def extract_prompt_text(call_kwargs):
    """Extract prompt text without depending on one Gemini SDK content shape."""

    contents = call_kwargs.get("contents")

    if isinstance(contents, str):
        return contents

    if isinstance(contents, list):
        parts = []

        for item in contents:
            if isinstance(item, str):
                parts.append(item)
                continue

            if isinstance(item, dict):
                item_parts = item.get("parts", [])

                for part in item_parts:
                    if isinstance(part, str):
                        parts.append(part)
                    elif isinstance(part, dict) and "text" in part:
                        parts.append(part["text"])

        return "\n".join(parts)

    return str(contents)


def main() -> int:
    failures = []

    with patch("services.suggestions.get_gemini_client") as mock_client_factory:
        mock_client = MagicMock()

        mock_client.models.generate_content.return_value = fake_gemini_response(
            "Ask them for the deadline.\nConfirm budget before next step."
        )

        mock_client_factory.return_value = mock_client

        import app as hinter_app

        client = hinter_app.app.test_client()

        response = client.get("/api/health")

        if response.status_code != 200 or not response.get_json().get("ok"):
            failures.append(
                f"/api/health failed: "
                f"{response.status_code} {response.get_data()}"
            )
        elif not response.get_json().get("gemini_key"):
            failures.append("/api/health did not report gemini_key as set")
        else:
            print("[OK] /api/health ->", response.get_json())

        response = client.post(
            "/api/transcript",
            json={"text": "We need to lock the launch date."},
        )

        if response.status_code != 200 or not response.get_json().get("ok"):
            failures.append(
                f"/api/transcript failed: "
                f"{response.status_code} {response.get_data()}"
            )
        else:
            print("[OK] /api/transcript ->", response.get_json())

        hinter_app._maybe_suggest()

        if not mock_client.models.generate_content.called:
            failures.append(
                "generate_suggestions did not call the Gemini client"
            )
        else:
            call_kwargs = (
                mock_client.models.generate_content.call_args.kwargs
            )

            prompt_text = extract_prompt_text(call_kwargs)

            if "lock the launch date" not in prompt_text:
                failures.append(
                    "transcript text was not passed through "
                    "to the LLM prompt"
                )
            else:
                print(
                    "[OK] suggestion engine received the transcript "
                    "and returned a suggestion"
                )

        session_id = hinter_app._state["session_id"]

        response = client.get(f"/api/sessions/{session_id}")

        data = response.get_json()

        if response.status_code != 200:
            failures.append(
                f"/api/sessions/{session_id} failed: "
                f"{response.status_code}"
            )
        elif not data.get("transcripts") or not data.get("suggestions"):
            failures.append(
                f"session did not persist transcript+suggestion: {data}"
            )
        else:
            print(
                f"[OK] /api/sessions/{session_id} -> "
                "transcript+suggestion persisted in SQLite"
            )

    if failures:
        print("\nSMOKE TEST FAILED:")

        for failure in failures:
            print(" -", failure)

        return 1

    print(
        "\nAll smoke tests passed — backend wiring is correct "
        "end-to-end (Gemini call mocked)."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())