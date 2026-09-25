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
| Browser tab/screen audio | ✅ Done (getDisplayMedia + mic mix, optional) |
| Live transcription (Gemini Live) | ✅ Done |
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

## Deployment

Hinter is deployed as a full-stack application on Vercel. Both the web
frontend and Flask + Socket.IO backend are configured within the Vercel
project.

**Live demo:** [Try live demo](https://hinter-one.vercel.app)

### Environment variables

Configure the following variables in Vercel under
**Project → Settings → Environment Variables**:

```text
GEMINI_API_KEY=...
GEMINI_SUGGESTION_MODEL=gemini-3.6-flash
FRONTEND_URL=https://hinter-one.vercel.app

## Real-time transcription

Hinter keeps one Gemini Live API connection open for each listening session
using `gemini-3.5-transcribe-live` (override with
`GEMINI_TRANSCRIPTION_MODEL`). The renderer mixes the microphone and the
Linux `Hinter-System-Audio` virtual source, converts the result to mono,
16-bit PCM at 16 kHz, and sends binary audio frames through Flask-SocketIO.
Incremental transcription stays in the live session; only finalized segments
are persisted and sent to the debounced suggestion engine. The legacy
`/api/transcribe` endpoint remains available as a fallback for older clients.

System-audio capture currently depends on Linux PipeWire/PulseAudio and the
`Hinter-System-Audio` source. If it is unavailable, Hinter falls back to the
physical microphone. The source must be available before listening starts.

Run the frontend and backend separately during development when needed:

```bash
npm run backend
npm run dev
```

Run the test suites with:

```bash
npm test
npm run build
npm run backend:test
```


## Audio capture paths

| Environment | Sources | Notes |
|-------------|---------|--------|
| **Electron (Linux)** | Mic + `Hinter-System-Audio` (PipeWire/Pulse monitor) | Auto-mixed when `pactl` monitors exist |
| **Browser (Vercel / Chrome)** | Mic only, or mic + **tab/screen audio** | Check “Share tab/screen audio” then enable **Share audio** in the browser dialog |
| **Fallback** | Mic only | Used when system/display capture fails |

### Event contract (Socket.IO)

| Direction | Event | Purpose |
|-----------|--------|---------|
| Client → server | `transcription:start` | Open Gemini Live session; clears rolling transcript buffer |
| Client → server | `transcription:audio` | Binary PCM 16-bit mono @ 16 kHz |
| Client → server | `transcription:stop` | Close live session |
| Server → client | `transcription:interim` | Partial text (UI italic) |
| Server → client | `transcription:final` / `transcript` | Finalized line |
| Server → client | `transcription_error` | STT failure message |

Requires `pulseaudio-utils` on Linux for monitor detection:

```bash
sudo apt install pulseaudio-utils
pactl list short sources | grep monitor
```

## Data flow

```text
Audio → Flask → Gemini transcription → transcript
Transcript → Flask → Gemini suggestions → Socket.IO → overlay
```