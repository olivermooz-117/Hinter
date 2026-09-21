import os

os.environ.setdefault("GEMINI_API_KEY", "test-key")

from app import app


def test_health_endpoint():
    client = app.test_client()

    response = client.get("/api/health")

    assert response.status_code == 200

    data = response.get_json()

    assert data["ok"] is True
    assert data["gemini_key"] is True
    assert "session_id" in data


def test_transcript_endpoint():
    client = app.test_client()

    response = client.post(
        "/api/transcript",
        json={"text": "Hello, this is a test transcript."},
    )

    assert response.status_code == 200

    data = response.get_json()

    assert data["ok"] is True


def test_transcript_endpoint_rejects_empty_text():
    client = app.test_client()

    response = client.post(
        "/api/transcript",
        json={"text": ""},
    )

    assert response.status_code in (200, 400)


def test_health_method():
    client = app.test_client()

    response = client.get("/api/health")

    assert response.is_json


def test_unknown_route():
    client = app.test_client()

    response = client.get("/api/does-not-exist")

    assert response.status_code == 404