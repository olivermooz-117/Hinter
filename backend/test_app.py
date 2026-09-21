import pytest
from unittest.mock import MagicMock, patch
import sys
import os
import tempfile
import io

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("HINTER_SUGGESTION_DEBOUNCE", "0")

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["HINTER_DB_PATH"] = _tmp_db.name


def fake_gemini_response(text: str):
    resp = MagicMock()
    resp.text = text
    return resp


def test_health_endpoint():
    import app
    client = app.app.test_client()
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.get_json()
    assert data["ok"] is True
    assert data["gemini_key"] is True


def test_transcript_endpoint():
    import app
    client = app.app.test_client()
    r = client.post("/api/transcript", json={"text": "Test transcript line"})
    assert r.status_code == 200
    data = r.get_json()
    assert data["ok"] is True


def test_sessions_endpoint():
    import app
    client = app.app.test_client()
    r = client.get("/api/sessions")
    assert r.status_code == 200
    data = r.get_json()
    assert isinstance(data, list)


def test_session_creation_and_persistence():
    with patch("services.suggestions.get_gemini_client") as mock_client_factory:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = fake_gemini_response(
            "Ask for clarification.\nConfirm next steps."
        )
        mock_client_factory.return_value = mock_client
        import app
        client = app.app.test_client()

        r = client.post("/api/transcript", json={"text": "We need to decide on the timeline."})
        assert r.status_code == 200

        app._maybe_suggest()

        assert mock_client.models.generate_content.called

        sid = app._state["session_id"]
        r = client.get(f"/api/sessions/{sid}")
        assert r.status_code == 200
        data = r.get_json()
        assert data["transcripts"]
        assert data["suggestions"]


def test_transcribe_endpoint_with_audio():
    with patch("app.transcribe_audio") as mock_transcribe:
        mock_transcribe.return_value = "Transcribed text"
        import app
        client = app.app.test_client()

        fake_audio = b"x" * 600
        data = {
            "file": (io.BytesIO(fake_audio), "chunk.webm"),
        }
        r = client.post("/api/transcribe", data=data, content_type="multipart/form-data")
        assert r.status_code == 200
        assert r.get_json()["text"] == "Transcribed text"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])