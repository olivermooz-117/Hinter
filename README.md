# Hinter

**A transparent, real-time AI meeting co-pilot.**

Hinter is an always-on-top overlay that listens to your meeting (system audio + mic), transcribes it live, and surfaces short, useful suggestions. It is designed to be **disclosed and openly used**, like Otter.ai or Google Meet’s AI features.

---

## Current status

| Milestone | Status |
|-----------|--------|
| Floating always-on-top overlay | ✅ Done |
| Audio capture (mic + system) | ✅ Done |
| Live transcription (Whisper) | ✅ Done |
| Flask backend + WebSocket | Next |
| LLM suggestion engine | Planned |
| React UI migration | Later |
| Session history (SQLAlchemy) | Later |

---

## Run it

```bash
# 1. Install
npm install

# 2. Add your OpenAI API key
cp .env.example .env
# edit .env → set OPENAI_API_KEY=sk-...

# 3. Start
npm start