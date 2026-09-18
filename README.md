# Hinter — Step 1: Floating Overlay Window

This is the first milestone: a real Electron app that shows a floating,
always-on-top overlay window — the foundation everything else (audio
capture, live transcript, AI suggestions) will sit inside.

## Run it

```bash
npm install
npm start
```

You should see a small dark overlay panel appear in the top-right of your
screen, on top of other windows. It reads "window ready" once the
renderer confirms it can talk to the main process via the preload bridge.

## What's here

- `electron/main.js` — creates the window: frameless, transparent,
  always-on-top, visible over fullscreen apps (so it survives a
  fullscreen Zoom/Meet call).
- `electron/preload.js` — the only bridge between the UI and Node/Electron
  internals. Nothing is exposed to the renderer except what's explicitly
  listed here — keep it that way as you add features.
- `renderer/` — the UI. Currently plain HTML/CSS/JS. You can drag the
  window by clicking anywhere on it (`-webkit-app-region: drag`).

## Next steps (in order)

1. ✅ Floating window that stays on top (this step)
2. Capture system audio + mic (`desktopCapturer`), save to a file to
   confirm capture works
3. Send captured audio to Whisper for transcription, show it live in
   the `#transcript` div
4. Stand up the Flask + WebSocket backend, move transcription server-side
5. Add the LLM suggestion call
6. Migrate the renderer from plain JS to React, add session history via
   SQLAlchemy/SQLite

Say the word when you want to tackle audio capture next.
