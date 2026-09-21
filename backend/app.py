"""
Hinter backend — Flask + SocketIO

 - Gemini STT via POST /api/transcribe
- Rolling transcript → debounced LLM suggestions
- SQLite session history
"""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit

from models import Session, Suggestion, TranscriptLine, init_db
from services.stt import transcribe_audio
from services.live_transcription import LiveTranscriptionSession
from services.suggestions import generate_suggestions

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DEFAULT_FRONTEND_URL = "http://127.0.0.1:5173"
frontend_origins = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_URL", DEFAULT_FRONTEND_URL).split(",")
    if origin.strip()
]
if not os.environ.get("FRONTEND_URL"):
    frontend_origins.append("http://localhost:5173")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET", "hinter-dev-secret")
CORS(app, resources={r"/api/*": {"origins": frontend_origins}})
socketio = SocketIO(app, cors_allowed_origins=frontend_origins, async_mode="threading")

SessionLocal = init_db(str(ROOT / "data" / "hinter.db"))

_state = {
    "session_id": None,
    "transcript": [],
    "last_suggestion_at": 0.0,
    "suggestion_lock": threading.Lock(),
    "live_sessions": {},
}
SUGGESTION_DEBOUNCE_SEC = float(os.environ.get("HINTER_SUGGESTION_DEBOUNCE", "8"))


def _ensure_session() -> int:
    if _state["session_id"] is not None:
        return _state["session_id"]
    db = SessionLocal()
    try:
        s = Session(title=f"Meeting {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        db.add(s)
        db.commit()
        db.refresh(s)
        _state["session_id"] = s.id
        return s.id
    finally:
        db.close()


def _save_transcript(text: str) -> None:
    sid = _ensure_session()
    db = SessionLocal()
    try:
        db.add(TranscriptLine(session_id=sid, text=text))
        db.commit()
    finally:
        db.close()


def _save_suggestion(text: str) -> None:
    sid = _ensure_session()
    db = SessionLocal()
    try:
        db.add(Suggestion(session_id=sid, text=text))
        db.commit()
    finally:
        db.close()


def _is_quota_error(error: Exception) -> bool:
    """Identify provider quota errors without exposing the raw payload."""
    status = getattr(error, "status_code", None) or getattr(error, "status", None)
    details = " ".join(
        str(value)
        for value in (error, getattr(error, "body", None), getattr(error, "code", None))
        if value is not None
    ).lower()
    return status == 429 or any(
        marker in details
        for marker in ("insufficient_quota", "credit_balance_exhausted", "quota exceeded")
    )


def _maybe_suggest() -> None:
    with _state["suggestion_lock"]:
        now = time.time()
        if now - _state["last_suggestion_at"] < SUGGESTION_DEBOUNCE_SEC:
            return
        _state["last_suggestion_at"] = now
        lines = list(_state["transcript"])

    if not lines:
        return

    try:
        text = generate_suggestions(lines)
        if text and text != "(listening)":
            _save_suggestion(text)
            socketio.emit("suggestion", {"text": text})
    except Exception as e:
        if _is_quota_error(e):
            socketio.emit(
                "error",
                {
                    "text": None,
                    "error": "quota",
                    "message": "Suggestion quota was reached; transcription still works.",
                },
            )
        else:
            socketio.emit("error", {"message": f"Suggestion error: {e}"})


def _handle_live_transcription(sid: str, text: str, final: bool) -> None:
    if not final or not text:
        socketio.emit("transcription_interim", {"text": text}, to=sid)
        return

    _state["transcript"].append(text)
    _state["transcript"] = _state["transcript"][-200:]
    _save_transcript(text)
    socketio.emit("transcript", {"text": text}, to=sid)
    socketio.start_background_task(_maybe_suggest)


def _handle_live_error(sid: str, message: str) -> None:
    socketio.emit("transcription_error", {"message": message}, to=sid)


@app.get("/api/health")
def health():
    gemini_key = bool(os.environ.get("GEMINI_API_KEY", "").strip())
    return jsonify(
        {
            "ok": True,
            "gemini_key": gemini_key,
            "session_id": _state["session_id"],
        }
    )


@app.post("/api/transcribe")
def api_transcribe():
    """Accept audio chunk → Whisper → transcript + maybe suggestion."""
    if "file" not in request.files and "audio" not in request.files:
        audio = request.get_data()
        filename = "chunk.webm"
        if not audio or len(audio) < 500:
            return jsonify({"error": "no audio"}), 400
    else:
        f = request.files.get("file") or request.files.get("audio")
        audio = f.read()
        filename = f.filename or "chunk.webm"
        if len(audio) < 500:
            return jsonify({"error": "audio too small"}), 400

    try:
        text = transcribe_audio(audio, filename=filename)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if text:
        _state["transcript"].append(text)
        if len(_state["transcript"]) > 200:
            _state["transcript"] = _state["transcript"][-200:]
        _save_transcript(text)
        socketio.emit("transcript", {"text": text})
        socketio.start_background_task(_maybe_suggest)

    return jsonify({"text": text or ""})


@app.post("/api/transcript")
def api_transcript_text():
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "empty"}), 400

    _state["transcript"].append(text)
    if len(_state["transcript"]) > 200:
        _state["transcript"] = _state["transcript"][-200:]
    _save_transcript(text)
    socketio.emit("transcript", {"text": text})
    socketio.start_background_task(_maybe_suggest)
    return jsonify({"ok": True})


@app.get("/api/sessions")
def list_sessions():
    db = SessionLocal()
    try:
        rows = db.query(Session).order_by(Session.started_at.desc()).limit(50).all()
        return jsonify(
            [
                {
                    "id": s.id,
                    "title": s.title,
                    "started_at": s.started_at.isoformat() if s.started_at else None,
                    "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                }
                for s in rows
            ]
        )
    finally:
        db.close()


@app.get("/api/sessions/<int:session_id>")
def get_session(session_id: int):
    db = SessionLocal()
    try:
        s = db.query(Session).get(session_id)
        if not s:
            return jsonify({"error": "not found"}), 404
        return jsonify(
            {
                "id": s.id,
                "title": s.title,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "transcripts": [
                    {"text": t.text, "at": t.created_at.isoformat()}
                    for t in s.transcripts
                ],
                "suggestions": [
                    {"text": g.text, "at": g.created_at.isoformat()}
                    for g in s.suggestions
                ],
            }
        )
    finally:
        db.close()


@socketio.on("connect")
def on_connect():
    emit("status", {"message": "connected", "session_id": _state["session_id"]})


@socketio.on("start_session")
def on_start_session():
    _state["session_id"] = None
    _state["transcript"] = []
    _state["last_suggestion_at"] = 0.0
    sid = _ensure_session()
    emit("status", {"message": "session_started", "session_id": sid})


@socketio.on("end_session")
def on_end_session():
    if _state["session_id"] is None:
        return
    db = SessionLocal()
    try:
        s = db.query(Session).get(_state["session_id"])
        if s:
            s.ended_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
    emit("status", {"message": "session_ended", "session_id": _state["session_id"]})


@socketio.on("transcription:start")
def on_transcription_start():
    sid = request.sid
    existing = _state["live_sessions"].pop(sid, None)
    if existing:
        existing.stop()
    session = LiveTranscriptionSession(
        lambda text, final: _handle_live_transcription(sid, text, final),
        lambda message: _handle_live_error(sid, message),
    )
    _state["live_sessions"][sid] = session
    session.start()
    emit("transcription:started")


@socketio.on("transcription:audio")
def on_transcription_audio(audio):
    session = _state["live_sessions"].get(request.sid)
    if not session or not isinstance(audio, (bytes, bytearray)):
        emit("transcription_error", {"message": "Live transcription is not active."})
        return
    session.send_audio(bytes(audio))


@socketio.on("transcription:stop")
def on_transcription_stop():
    session = _state["live_sessions"].pop(request.sid, None)
    if session:
        session.stop()
    emit("transcription:stopped")


@socketio.on("disconnect")
def on_disconnect():
    session = _state["live_sessions"].pop(request.sid, None)
    if session:
        session.stop()


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT") or os.environ.get("HINTER_PORT", "5000"))
    debug = os.environ.get("HINTER_DEBUG", "0").lower() in {"1", "true", "yes"}
    print(f"Hinter backend on http://{host}:{port}")
    print(
        f"Gemini key: {bool(os.environ.get('GEMINI_API_KEY', '').strip())}"
    )
    socketio.run(app, host=host, port=port, debug=debug)
