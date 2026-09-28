# Hinter

**A transparent, real-time AI meeting co-pilot.**

Hinter listens to your meeting (mic, optional tab audio, or Linux system audio),
transcribes live with Gemini, and surfaces short AI suggestions. It is designed
to be **disclosed and openly used** — not a hidden assist tool.

**Live demo (homepage + listener):** https://hinter-one.vercel.app

---

## Current status

| Milestone | Status |
|-----------|--------|
| Marketing homepage + embedded live demo | Done |
| Floating always-on-top Electron overlay | Done |
| Mic + browser tab/screen audio | Done |
| Linux system audio (PipeWire/Pulse) | Done |
| Gemini Live transcription | Done |
| Flask + Socket.IO backend | Done |
| Debounced LLM suggestions | Done |
| Per-client session isolation | Done |
| Session history (SQLAlchemy / SQLite) | Done |

---

## Surfaces

| Surface | What you get | How to open |
|---------|--------------|-------------|
| **Web (primary)** | Homepage + live Listen panel | https://hinter-one.vercel.app |
| **Local browser** | Same UI as production | `npm run backend` then `npx vite` → http://127.0.0.1:5173 |
| **Electron overlay** | Compact always-on-top panel + system audio | `npm run backend` then `npm run dev` |
| **GitHub Pages** | Static marketing mirror; **Try live** points to Vercel | https://olivermooz-117.github.io/Hinter/ |

---

## Run locally

```bash
# 1. Install frontend deps
npm install

# 2. Backend venv + deps
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

# 3. Env
cp .env.example .env
# edit .env → set GEMINI_API_KEY=...

# 4a. Browser homepage (recommended for demos)
npm run backend          # terminal 1 — http://127.0.0.1:5000
npx vite                 # terminal 2 — http://127.0.0.1:5173

# 4b. Electron overlay (desktop meetings / system audio)
npm run backend
npm run dev              # Vite + Electron
```

---

## Deployment (Vercel)

Full-stack on Vercel: Vite frontend + Flask backend (`vercel.json`).

**Production URL:** https://hinter-one.vercel.app

### Environment variables

In **Project → Settings → Environment Variables**:

```text
GEMINI_API_KEY=...
GEMINI_SUGGESTION_MODEL=gemini-3.6-flash
FRONTEND_URL=https://hinter-one.vercel.app
```

Optional: `GEMINI_TRANSCRIPTION_MODEL`, `HINTER_SUGGESTION_DEBOUNCE`.

---

## Real-time transcription

Each Listen session opens a Gemini Live connection (`gemini-3.5-transcribe-live`,
overridable). The client sends 16-bit mono PCM @ 16 kHz over Socket.IO.

| Direction | Event | Purpose |
|-----------|--------|---------|
| Client → server | `transcription:start` | Open live session; clear this client's buffer |
| Client → server | `transcription:audio` | Binary PCM chunks |
| Client → server | `transcription:stop` | Close live session |
| Server → client | `transcription:interim` | Partial text |
| Server → client | `transcription:final` | Finalized line (UI + suggestions) |
| Server → client | `suggestion` | Debounced AI card |
| Server → client | `transcription_error` | STT failure |

HTTP `POST /api/transcribe` remains as a legacy fallback.

### Audio capture paths

| Environment | Sources | Notes |
|-------------|---------|--------|
| **Browser** | Mic, optional tab/screen audio | Check “Share tab/screen audio” |
| **Electron (Linux)** | Mic + `Hinter-System-Audio` | Preferred default-sink monitor via `pactl` |
| **Fallback** | Mic only | When system/display capture fails |

```bash
sudo apt install pulseaudio-utils   # Linux monitor detection
pactl list short sources | grep monitor
```

---

## Tests

```bash
npm test
npm run backend:test
```

---

## Portfolio notes

See [docs/PORTFOLIO.md](docs/PORTFOLIO.md) for architecture diagram and the
**transparent vs hidden** product decision.

---

## License

MIT — see [LICENSE](LICENSE).
