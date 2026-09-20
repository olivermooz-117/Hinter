import pytest
from unittest.mock import MagicMock, patch
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("OPENAI_API_KEY", "sk-test-key")

def test_generate_suggestions_empty_transcript():
    from services.suggestions import generate_suggestions
    result = generate_suggestions([])
    assert result == "(listening)"

def test_generate_suggestions_whitespace_only():
    from services.suggestions import generate_suggestions
    result = generate_suggestions(["   ", "\n", ""])
    assert result == "(listening)"

@patch("services.suggestions.OpenAI")
def test_generate_suggestions_calls_openai(mock_openai):
    from services.suggestions import generate_suggestions
    
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="Ask for clarification.\nConfirm next steps."))]
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai.return_value = mock_client
    
    result = generate_suggestions(["We need to decide on the timeline."])
    
    assert result == "Ask for clarification.\nConfirm next steps."
    mock_client.chat.completions.create.assert_called_once()
    call_args = mock_client.chat.completions.create.call_args
    assert call_args.kwargs["model"] == "gpt-4o-mini"
    assert "We need to decide on the timeline" in call_args.kwargs["messages"][1]["content"]

@patch("services.suggestions.OpenAI")
def test_generate_suggestions_uses_custom_model(mock_openai):
    from services.suggestions import generate_suggestions
    
    os.environ["HINTER_LLM_MODEL"] = "gpt-4o"
    
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="Test suggestion"))]
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai.return_value = mock_client
    
    result = generate_suggestions(["Test transcript"])
    
    call_args = mock_client.chat.completions.create.call_args
    assert call_args.kwargs["model"] == "gpt-4o"
    
    del os.environ["HINTER_LLM_MODEL"]

@patch("services.suggestions.OpenAI")
def test_generate_suggestions_passes_system_prompt(mock_openai):
    from services.suggestions import generate_suggestions, SYSTEM_PROMPT
    
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="Test"))]
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai.return_value = mock_client
    
    generate_suggestions(["Test"])
    
    call_args = mock_client.chat.completions.create.call_args
    assert call_args.kwargs["messages"][0]["role"] == "system"
    assert call_args.kwargs["messages"][0]["content"] == SYSTEM_PROMPT

@patch("services.suggestions.OpenAI")
def test_generate_suggestions_raises_without_api_key(mock_openai):
    from services.suggestions import generate_suggestions
    
    del os.environ["OPENAI_API_KEY"]
    
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY not set"):
        generate_suggestions(["Test"])
    
    os.environ["OPENAI_API_KEY"] = "sk-test-key"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])