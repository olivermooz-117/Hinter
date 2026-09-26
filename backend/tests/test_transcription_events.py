"""Socket.IO transcription session behaviour — per-client isolation."""

from __future__ import annotations

import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("HINTER_SUGGESTION_DEBOUNCE", "0")

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["HINTER_DB_PATH"] = _tmp_db.name


def test_handle_live_interim_does_not_append_transcript():
    import app

    client = app._get_client("sid-1")
    client["transcript"] = ["old"]
    app._handle_live_transcription("sid-1", "partial text", final=False)
    assert client["transcript"] == ["old"]


def test_handle_live_final_appends_and_trims():
    import app

    client = app._get_client("sid-1")
    client["transcript"] = []
    with patch.object(app, "_save_transcript"), patch.object(
        app.socketio, "emit"
    ), patch.object(app.socketio, "start_background_task"):
        app._handle_live_transcription("sid-1", "  final line  ", final=True)

    assert client["transcript"] == ["final line"]


def test_clients_are_isolated():
    import app

    a = app._get_client("client-a")
    b = app._get_client("client-b")
    a["transcript"] = ["from-a"]
    b["transcript"] = ["from-b"]

    with patch.object(app, "_save_transcript"), patch.object(
        app.socketio, "emit"
    ), patch.object(app.socketio, "start_background_task"):
        app._handle_live_transcription("client-a", "a2", final=True)

    assert a["transcript"] == ["from-a", "a2"]
    assert b["transcript"] == ["from-b"]


def test_transcription_start_resets_rolling_buffer_for_client():
    import app

    client = app._get_client("test-sid")
    client["transcript"] = ["stale"]
    client["last_suggestion_at"] = 99.0
    client["live"] = None

    class FakeLive:
        def __init__(self, *a, **k):
            pass

        def start(self):
            pass

        def stop(self):
            pass

    mock_req = MagicMock()
    mock_req.sid = "test-sid"

    with patch.object(app, "LiveTranscriptionSession", FakeLive), patch.object(
        app, "emit"
    ), patch.object(app, "request", mock_req):
        app.on_transcription_start()

    assert client["transcript"] == []
    assert client["last_suggestion_at"] == 0.0
    assert client["live"] is not None


def test_maybe_suggest_targets_sid():
    import app

    client = app._get_client("sug-sid")
    client["transcript"] = ["hello meeting"]
    client["last_suggestion_at"] = 0.0

    with patch.object(
        app, "generate_suggestions", return_value="Ask for next steps"
    ), patch.object(app, "_save_suggestion"), patch.object(
        app.socketio, "emit"
    ) as emit:
        app._maybe_suggest("sug-sid")

    emit.assert_any_call(
        "suggestion",
        {"text": "Ask for next steps"},
        to="sug-sid",
    )
