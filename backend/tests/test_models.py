import pytest
from unittest.mock import MagicMock, patch
import sys
import os
import tempfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("HINTER_SUGGESTION_DEBOUNCE", "0")

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["HINTER_DB_PATH"] = _tmp_db.name

def test_session_creation():
    from models import Session, init_db
    SessionLocal = init_db(os.environ["HINTER_DB_PATH"])
    db = SessionLocal()
    try:
        s = Session(title="Test Meeting")
        db.add(s)
        db.commit()
        db.refresh(s)
        assert s.id is not None
        assert s.title == "Test Meeting"
        assert s.started_at is not None
        assert s.ended_at is None
    finally:
        db.close()

def test_transcript_line_relationship():
    from models import Session, TranscriptLine, init_db
    SessionLocal = init_db(os.environ["HINTER_DB_PATH"])
    db = SessionLocal()
    try:
        s = Session(title="Test")
        db.add(s)
        db.commit()
        db.refresh(s)
        
        t = TranscriptLine(session_id=s.id, text="Hello world")
        db.add(t)
        db.commit()
        db.refresh(t)
        
        assert t.id is not None
        assert t.session_id == s.id
        assert t.text == "Hello world"
        assert t.created_at is not None
        
        # Test relationship
        db.refresh(s)
        assert len(s.transcripts) == 1
        assert s.transcripts[0].text == "Hello world"
    finally:
        db.close()

def test_suggestion_relationship():
    from models import Session, Suggestion, init_db
    SessionLocal = init_db(os.environ["HINTER_DB_PATH"])
    db = SessionLocal()
    try:
        s = Session(title="Test")
        db.add(s)
        db.commit()
        db.refresh(s)
        
        g = Suggestion(session_id=s.id, text="Test suggestion")
        db.add(g)
        db.commit()
        db.refresh(g)
        
        assert g.id is not None
        assert g.session_id == s.id
        assert g.text == "Test suggestion"
        
        db.refresh(s)
        assert len(s.suggestions) == 1
        assert s.suggestions[0].text == "Test suggestion"
    finally:
        db.close()

def test_cascade_delete():
    from models import Session, TranscriptLine, Suggestion, init_db
    SessionLocal = init_db(os.environ["HINTER_DB_PATH"])
    db = SessionLocal()
    try:
        s = Session(title="Test")
        db.add(s)
        db.commit()
        db.refresh(s)
        
        t = TranscriptLine(session_id=s.id, text="Test")
        db.add(t)
        g = Suggestion(session_id=s.id, text="Suggestion")
        db.add(g)
        db.commit()
        
        session_id = s.id
        db.delete(s)
        db.commit()
        
        assert db.query(TranscriptLine).filter_by(session_id=session_id).count() == 0
        assert db.query(Suggestion).filter_by(session_id=session_id).count() == 0
    finally:
        db.close()

def test_multiple_transcripts_per_session():
    from models import Session, TranscriptLine, init_db
    SessionLocal = init_db(os.environ["HINTER_DB_PATH"])
    db = SessionLocal()
    try:
        s = Session(title="Test")
        db.add(s)
        db.commit()
        db.refresh(s)
        
        for i in range(5):
            t = TranscriptLine(session_id=s.id, text=f"Line {i}")
            db.add(t)
        db.commit()
        
        db.refresh(s)
        assert len(s.transcripts) == 5
    finally:
        db.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])