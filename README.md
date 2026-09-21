# Hinter

**A transparent, real-time AI meeting co-pilot.**

Hinter is an always-on-top overlay that listens to your meeting (system audio + mic), transcribes it live, and surfaces short, useful suggestions. It is designed to be **disclosed and openly used**, like Otter.ai or Google Meet's AI features.

---

## Current status

| Milestone | Status |
|-----------|--------|
| Floating always-on-top overlay | ✅ Done |
| Audio capture (mic) | ✅ Done |
| System audio capture | ✅ Done (Electron loopback + PipeWire/PulseAudio detection) |
| Live transcription (Gemini) | ✅ Done |
| Flask backend + WebSocket | ✅ Done |
| LLM suggestion engine | ✅ Done (Gemini, debounced) |
| React UI migration | ✅ Done |
| Session history (SQLAlchemy) | ✅ Done |

---

## Run it

```bash
# 1. Install
npm install

# 2. Add your Gemini API key
cp .env.example .env
# edit .env → set GEMINI_API_KEY=...

# 3. Start the backend and app
npm run backend
npm start
```

## Data flow

```text
Audio → Flask → Gemini transcription → transcript
Transcript → Flask → Gemini suggestions → Socket.IO → overlay
```