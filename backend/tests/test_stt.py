import pytest
from unittest.mock import MagicMock, patch
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")


def test_transcribe_audio_empty():
    from services.stt import transcribe_audio
    result = transcribe_audio(b"")
    assert result == ""


def test_transcribe_audio_too_small():
    from services.stt import transcribe_audio
    result = transcribe_audio(b"small")
    assert result == ""


@patch("services.stt.get_gemini_client")
def test_transcribe_audio_calls_model(mock_get_client):
    from services.stt import transcribe_audio

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="Hello world")
    mock_get_client.return_value = mock_client

    result = transcribe_audio(b"x" * 600)

    assert result == "Hello world"
    mock_client.models.generate_content.assert_called_once()


@patch("services.stt.get_gemini_client")
def test_transcribe_audio_multiple_segments(mock_get_client):
    from services.stt import transcribe_audio

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="Hello world")
    mock_get_client.return_value = mock_client

    result = transcribe_audio(b"x" * 600)

    assert result == "Hello world"


@patch("services.stt.get_gemini_client")
def test_transcribe_audio_empty_result(mock_get_client):
    from services.stt import transcribe_audio

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="")
    mock_get_client.return_value = mock_client

    result = transcribe_audio(b"x" * 600)

    assert result == ""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])