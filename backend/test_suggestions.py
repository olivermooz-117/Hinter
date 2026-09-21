import pytest
from unittest.mock import MagicMock, patch
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")


def test_generate_suggestions_empty_transcript():
    from services.suggestions import generate_suggestions
    result = generate_suggestions([])
    assert result == "(listening)"


def test_generate_suggestions_whitespace_only():
    from services.suggestions import generate_suggestions
    result = generate_suggestions(["   ", "\n", ""])
    assert result == "(listening)"


@patch("services.suggestions.get_gemini_client")
def test_generate_suggestions_calls_gemini(mock_factory):
    from services.suggestions import generate_suggestions

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="Ask for clarification.\nConfirm next steps.")
    mock_factory.return_value = mock_client

    result = generate_suggestions(["We need to decide on the timeline."])

    assert result == "Ask for clarification.\nConfirm next steps."
    mock_client.models.generate_content.assert_called_once()
    call_args = mock_client.models.generate_content.call_args.kwargs
    assert call_args["model"] == "gemini-2.5-flash"
    assert "We need to decide on the timeline" in call_args["contents"][0]["parts"][0]["text"]


@patch("services.suggestions.get_gemini_client")
def test_generate_suggestions_uses_custom_model(mock_factory):
    from services.suggestions import generate_suggestions

    os.environ["GEMINI_SUGGESTION_MODEL"] = "gemini-2.5-flash-lite"
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="Test suggestion")
    mock_factory.return_value = mock_client

    result = generate_suggestions(["Test transcript"])

    call_args = mock_client.models.generate_content.call_args.kwargs
    assert call_args["model"] == "gemini-2.5-flash-lite"
    assert result == "Test suggestion"

    del os.environ["GEMINI_SUGGESTION_MODEL"]


@patch("services.suggestions.get_gemini_client")
def test_generate_suggestions_passes_system_prompt(mock_factory):
    from services.suggestions import generate_suggestions, SYSTEM_PROMPT

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="Test")
    mock_factory.return_value = mock_client

    generate_suggestions(["Test"])

    call_args = mock_client.models.generate_content.call_args.kwargs
    prompt = call_args["contents"][0]["parts"][0]["text"]
    assert SYSTEM_PROMPT in prompt


@patch("services.suggestions.get_gemini_client")
def test_generate_suggestions_raises_without_api_key(mock_factory):
    from services.suggestions import generate_suggestions

    mock_factory.side_effect = RuntimeError("GEMINI_API_KEY is not configured")

    with pytest.raises(RuntimeError, match="GEMINI_API_KEY is not configured"):
        generate_suggestions(["Test"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])