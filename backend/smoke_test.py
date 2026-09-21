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

sys.path.insert(0, os.path.dirname(__file__))


def fake_gemini_response(text: str):
    resp = MagicMock()
    resp.text = text
    return resp


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

        r = client.get("/api/health")
        if r.status_code != 200 or not r.get_json().get("ok"):
            failures.append(f"/api/health failed: {r.status_code} {r.get_data()}")
        elif not r.get_json().get("gemini_key"):
            failures.append("/api/health did not report gemini_key as set")
        else:
            print("[OK] /api/health ->", r.get_json())

        r = client.post("/api/transcript", json={"text": "We need to lock the launch date."})
        if r.status_code != 200 or not r.get_json().get("ok"):
            failures.append(f"/api/transcript failed: {r.status_code} {r.get_data()}")
        else:
            print("[OK] /api/transcript ->", r.get_json())

        hinter_app._maybe_suggest()
        if not mock_client.models.generate_content.called:
            failures.append("generate_suggestions did not call the Gemini client")
        else:
            call_kwargs = mock_client.models.generate_content.call_args.kwargs
            sent_transcript = call_kwargs["contents"][0]["parts"][0]["text"]
            if "lock the launch date" not in sent_transcript:
                failures.append("transcript text was not passed through to the LLM prompt")
            else:
                print("[OK] suggestion engine received the transcript and returned a suggestion")

        sid = hinter_app._state["session_id"]
        r = client.get(f"/api/sessions/{sid}")
        data = r.get_json()
        if r.status_code != 200:
            failures.append(f"/api/sessions/{sid} failed: {r.status_code}")
        elif not data.get("transcripts") or not data.get("suggestions"):
            failures.append(f"session did not persist transcript+suggestion: {data}")
        else:
            print(f"[OK] /api/sessions/{sid} -> transcript+suggestion persisted in SQLite")

    if failures:
        print("\nSMOKE TEST FAILED:")
        for f in failures:
            print(" -", f)
        return 1

    print("\nAll smoke tests passed — backend wiring is correct end-to-end (Gemini call mocked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())