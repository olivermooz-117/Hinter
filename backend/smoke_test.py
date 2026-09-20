"""
End-to-end smoke test for the Hinter backend, using a mocked OpenAI client
so it can run without a real OPENAI_API_KEY or network access.

Exercises the real code path:
  Flask test client -> /api/transcript -> _maybe_suggest()
  -> services.suggestions.generate_suggestions() -> (mocked) OpenAI call
  -> socketio.emit("suggestion", ...)

Run with:
    cd backend && python smoke_test.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
from unittest.mock import MagicMock, patch

# Fake key so app.py's own bool checks pass; the actual OpenAI call is mocked.
os.environ.setdefault("OPENAI_API_KEY", "sk-smoketest-not-a-real-key")
os.environ.setdefault("HINTER_SUGGESTION_DEBOUNCE", "0")

# Use a throwaway DB file for this run.
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()

sys.path.insert(0, os.path.dirname(__file__))


def fake_openai_response(text: str):
    resp = MagicMock()
    resp.choices = [MagicMock(message=MagicMock(content=text))]
    return resp


def main() -> int:
    failures = []

    with patch("services.suggestions.OpenAI") as MockOpenAI:
        mock_client = MockOpenAI.return_value
        mock_client.chat.completions.create.return_value = fake_openai_response(
            "Ask them for the deadline.\nConfirm budget before next step."
        )

        import app as hinter_app  # import after patch + env is set

        client = hinter_app.app.test_client()

        # 1. /api/health should report ok + a (fake) key present
        r = client.get("/api/health")
        if r.status_code != 200 or not r.get_json().get("ok"):
            failures.append(f"/api/health failed: {r.status_code} {r.get_data()}")
        elif not r.get_json().get("openai_key"):
            failures.append("/api/health did not report openai_key as set")
        else:
            print("[OK] /api/health ->", r.get_json())

        # 2. Push a transcript line, then run the (usually background) suggestion
        #    step synchronously so we can assert on it directly.
        r = client.post("/api/transcript", json={"text": "We need to lock the launch date."})
        if r.status_code != 200 or not r.get_json().get("ok"):
            failures.append(f"/api/transcript failed: {r.status_code} {r.get_data()}")
        else:
            print("[OK] /api/transcript ->", r.get_json())

        hinter_app._maybe_suggest()  # debounce is 0, so this fires immediately
        if not mock_client.chat.completions.create.called:
            failures.append("generate_suggestions did not call the OpenAI client")
        else:
            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            sent_transcript = call_kwargs["messages"][1]["content"]
            if "lock the launch date" not in sent_transcript:
                failures.append("transcript text was not passed through to the LLM prompt")
            else:
                print("[OK] suggestion engine received the transcript and returned a suggestion")

        # 3. Session should now exist with the transcript + suggestion persisted.
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

    print("\nAll smoke tests passed — backend wiring is correct end-to-end (OpenAI call mocked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())