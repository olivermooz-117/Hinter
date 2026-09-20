import pytest
from unittest.mock import MagicMock, patch
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("WHISPER_MODEL_SIZE", "base.en")
os.environ.setdefault("WHISPER_LANGUAGE", "en")
os.environ.setdefault("WHISPER_VAD", "true")

def test_transcribe_audio_empty():
    from services.stt import transcribe_audio
    result = transcribe_audio(b"")
    assert result == ""

def test_transcribe_audio_too_small():
    from services.stt import transcribe_audio
    result = transcribe_audio(b"small")
    assert result == ""

@patch("services.stt._get_model")
def test_transcribe_audio_calls_model(mock_get_model):
    from services.stt import transcribe_audio
    
    mock_model_instance = MagicMock()
    mock_segment = MagicMock()
    mock_segment.text = "Hello world"
    mock_model_instance.transcribe.return_value = ([mock_segment], None)
    mock_get_model.return_value = mock_model_instance
    
    result = transcribe_audio(b"x" * 600)
    
    assert result == "Hello world"
    mock_model_instance.transcribe.assert_called_once()

@patch("services.stt._get_model")
def test_transcribe_audio_multiple_segments(mock_get_model):
    from services.stt import transcribe_audio
    
    mock_model_instance = MagicMock()
    mock_segment1 = MagicMock()
    mock_segment1.text = "Hello"
    mock_segment2 = MagicMock()
    mock_segment2.text = "world"
    mock_model_instance.transcribe.return_value = ([mock_segment1, mock_segment2], None)
    mock_get_model.return_value = mock_model_instance
    
    result = transcribe_audio(b"x" * 600)
    
    assert result == "Hello world"

@patch("services.stt._get_model")
def test_transcribe_audio_filters_empty_segments(mock_get_model):
    from services.stt import transcribe_audio
    
    mock_model_instance = MagicMock()
    mock_segment1 = MagicMock()
    mock_segment1.text = "Hello"
    mock_segment2 = MagicMock()
    mock_segment2.text = ""
    mock_segment3 = MagicMock()
    mock_segment3.text = "world"
    mock_model_instance.transcribe.return_value = ([mock_segment1, mock_segment2, mock_segment3], None)
    mock_get_model.return_value = mock_model_instance
    
    result = transcribe_audio(b"x" * 600)
    
    assert result == "Hello world"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])