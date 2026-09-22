import io
import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

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

    response = client.get("/api/health")

    assert response.status_code == 200

    data = response.get_json()

    assert data["ok"] is True
    assert data["gemini_key"] is True
    assert "session_id" in data
    assert "openai_key" not in data
    assert "deepgram_key" not in data


def test_health_accepts_configured_frontend_origin():
    import app

    client = app.app.test_client()

    response = client.get(
        "/api/health",
        headers={"Origin": "http://127.0.0.1:5173"},
    )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == (
        "http://127.0.0.1:5173"
    )


def test_transcript_endpoint():
    import app

    client = app.app.test_client()

    response = client.post(
        "/api/transcript",
        json={"text": "Test transcript line"},
    )

    assert response.status_code == 200

    data = response.get_json()

    assert data["ok"] is True


def test_sessions_endpoint():
    import app

    client = app.app.test_client()

    response = client.get("/api/sessions")

    assert response.status_code == 200

    data = response.get_json()

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

        response = client.post(
            "/api/transcript",
            json={"text": "We need to decide on the timeline."},
        )

        assert response.status_code == 200

        app._maybe_suggest()

        assert mock_client.models.generate_content.called

        session_id = app._state["session_id"]

        response = client.get(f"/api/sessions/{session_id}")

        assert response.status_code == 200

        data = response.get_json()

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

        response = client.post(
            "/api/transcribe",
            data=data,
            content_type="multipart/form-data",
        )

        assert response.status_code == 200
        assert response.get_json()["text"] == "Transcribed text"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])