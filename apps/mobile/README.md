# Hinter Mobile (Expo)

Companion app for Listen + History. Shares the same Flask + Socket.IO API as web and desktop.

## Setup

```bash
# from monorepo root
cp ../../.env.example ../../.env   # if not done
# set EXPO_PUBLIC_BACKEND_URL — use your machine LAN IP on a physical device
npm install
npm run backend                    # monorepo root, terminal 1
npm run dev:mobile                 # terminal 2
```

Scan the QR code with Expo Go.

## Scope (v0.4)

- Start / stop listening (mic permission)
- Live transcript + suggestion cards (when backend streams events)
- Session history from `GET /api/sessions`

Auth is optional and not required for this release.

## Note on audio streaming

Web and Electron stream 16 kHz PCM over Socket.IO. Expo’s recording APIs are more limited; the mobile shell is wired to the same events and history API. Full continuous PCM streaming can be added with a native module or `expo-av` metering + chunked upload later.
