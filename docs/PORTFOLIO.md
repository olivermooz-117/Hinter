# Hinter — portfolio write-up

## One-liner

**Hinter** is a transparent, real-time AI meeting co-pilot: it captures audio,
streams transcription, and shows short suggestions in a visible panel — designed
to be disclosed, not hidden.

**Try it:** https://hinter-one.vercel.app  
**Source:** https://github.com/olivermooz-117/Hinter

---

## Problem

Meetings move faster than notes. People want live help (clarifying questions,
next steps, short answers) without:

- A bot joining the call as a participant, or
- A tool whose whole product story is “undetectable.”

There is room for an assist layer that is **useful and explainable**.

---

## Product decision: transparent vs hidden

| | **Transparent (Hinter)** | **Hidden meeting AI** |
|--|--------------------------|------------------------|
| **Intent** | Open co-pilot you can disclose | Stay invisible to others |
| **Trust** | Clear capture + processing story | Ambiguous boundaries |
| **UX** | Visible panel, status, transcript | Overlay designed not to be noticed |
| **Ethics** | Aligns with informed consent | Easy to misuse without consent |
| **Portfolio** | Easy to defend in interviews | Harder to discuss product ethics |

Hinter deliberately chooses the left column. The homepage, README, and demo UI
all reinforce: *openly, not hidden*.

That choice shaped technical defaults too: no “stealth” framing, explicit mic /
tab-share permissions, and server-side API keys so the client is not a black box
holding secrets.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Client                                                      │
│  ┌──────────────────┐    ┌───────────────────────────────┐  │
│  │ Browser          │    │ Electron (desktop)            │  │
│  │ Landing + panel  │    │ Always-on-top overlay         │  │
│  │ Mic / tab audio  │    │ Mic + Linux system audio      │  │
│  └────────┬─────────┘    └──────────────┬────────────────┘  │
│           │  PCM 16 kHz mono + Socket.IO │                   │
└───────────┼──────────────────────────────┼───────────────────┘
            │                              │
            ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Flask + Flask-SocketIO                                       │
│  • Per-socket client state (transcript, session, live STT)  │
│  • transcription:start / audio / stop                        │
│  • Debounced suggestion job                                  │
│  • SQLAlchemy + SQLite session history                       │
└───────────┬──────────────────────────────┬──────────────────┘
            │                              │
            ▼                              ▼
     Gemini Live STT              Gemini suggestions
     (interim + final)            (short cards → client)
```

### Why this stack

- **Electron** — real system audio and always-on-top; browsers cannot do both well.
- **React + Vite** — shared UI for web marketing demo and overlay content.
- **Flask-SocketIO** — low-friction binary audio + events; fits a solo full-stack project.
- **Gemini Live** — streaming STT without operating a separate ASR cluster.
- **Per-client state** — two tabs do not share one transcript buffer.

---

## Data flow (happy path)

1. User hits **Listen** (and optionally shares tab audio).
2. Client mixes streams → PCM frames → `transcription:audio`.
3. Backend owns a **LiveTranscriptionSession** per socket id.
4. Interim text updates the UI; **final** lines append to that client’s buffer.
5. After debounce, the rolling transcript feeds the suggestion model.
6. `suggestion` event fills the AI card; history can be stored in SQLite.

---

## What I built (talking points)

- End-to-end real-time pipeline (capture → STT → LLM → UI)
- Multi-path audio (mic, `getDisplayMedia`, Linux monitor source)
- Production web deploy (Vercel) with live demo on the marketing page
- Explicit product stance (transparent assist) carried through UX and docs
- Tests for backend isolation and frontend listen paths

---

## Limits & honesty

- Browser demo cannot capture full OS audio the way Electron + Pulse can.
- Serverless SQLite on Vercel is ephemeral; durable history needs a managed DB.
- Suggestion quality depends on transcript quality and model limits / quota.

---

## Links

- Live: https://hinter-one.vercel.app  
- Repo: https://github.com/olivermooz-117/Hinter  
- Static pages: https://olivermooz-117.github.io/Hinter/  
