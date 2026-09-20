import pytest
from unittest.mock import MagicMock, patch
import sys
import os
import tempfile
import io

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("OPENAI_API_KEY", "sk-test-key")
os.environ.setdefault("HINTER_SUGGESTION_DEBOUNCE", "0")

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["HINTER_DB_PATH"] = _tmp_db.name

def fake_openai_response(text: str):
    resp = MagicMock()
    resp.choices = [MagicMock(message=MagicMock(content=text))]
    return resp


def test_health_endpoint():
    with patch("services.suggestions.OpenAI") as MockOpenAI:
        import app
        client = app.app.test_client()
        r = client.get("/api/health")
        assert r.status_code == 200
        data = r.get_json()
        assert data["ok"] is True
        assert data["openai_key"] is True


def test_transcript_endpoint():
    with patch("services.suggestions.OpenAI") as MockOpenAI:
        import app
        client = app.app.test_client()
        r = client.post("/api/transcript", json={"text": "Test transcript line"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["ok"] is True


def test_sessions_endpoint():
    with patch("services.suggestions.OpenAI") as MockOpenAI:
        import app
        client = app.app.test_client()
        r = client.get("/api/sessions")
        assert r.status_code == 200
        data = r.get_json()
        assert isinstance(data, list)


def test_session_creation_and_persistence():
    with patch("services.suggestions.OpenAI") as MockOpenAI:
        mock_client = MockOpenAI.return_value
        mock_client.chat.completions.create.return_value = fake_openai_response(
            "Ask for clarification.\nConfirm next steps."
        )
        import app
        client = app.app.test_client()
        
        r = client.post("/api/transcript", json={"text": "We need to decide on the timeline."})
        assert r.status_code == 200
        
        app._maybe_suggest()
        
        assert mock_client.chat.completions.create.called
        
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
        
        # Audio must be at least 500 bytes
        fake_audio = b"x" * 600
        data = {
            "file": (io.BytesIO(fake_audio), "chunk.webm"),
        }
        r = client.post("/api/transcribe", data=data, content_type="multipart/form-data")
        assert r.status_code == 200
        assert r.get_json()["text"] == "Transcribed text"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])