"""Socket.IO transcription session behaviour."""

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

    app._state["transcript"] = ["old"]
    app._handle_live_transcription("sid-1", "partial text", final=False)
    assert app._state["transcript"] == ["old"]


def test_handle_live_final_appends_and_trims():
    import app

    app._state["transcript"] = []
    with patch.object(app, "_save_transcript"), patch.object(
        app.socketio, "emit"
    ), patch.object(app.socketio, "start_background_task"):
        app._handle_live_transcription("sid-1", "  final line  ", final=True)

    assert app._state["transcript"] == ["final line"]


def test_transcription_start_resets_rolling_buffer():
    import app

    app._state["transcript"] = ["stale"]
    app._state["last_suggestion_at"] = 99.0
    app._state["live_sessions"] = {}

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

    assert app._state["transcript"] == []
    assert app._state["last_suggestion_at"] == 0.0
    assert "test-sid" in app._state["live_sessions"]