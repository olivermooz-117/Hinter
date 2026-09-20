const { app, BrowserWindow, screen, ipcMain, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let overlayWindow = null;

// Load .env from project root if present (no extra dependency)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

/**
 * Create the always-on-top overlay window.
 * Designed to stay visible over fullscreen meeting apps (Zoom, Meet, Teams).
 * This is a disclosed tool — the window is meant to be seen.
 */
function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 320,
    x: width - 440,
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture'];
    callback(allowed.includes(permission));
  });

  createOverlayWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC ---

ipcMain.handle('hinter:ping', () => 'pong from main process');

ipcMain.handle('hinter:getDesktopSources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 0, height: 0 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
  }));
});

ipcMain.handle('hinter:hasApiKey', () => {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-'));
});

/**
 * Transcribe an audio blob via OpenAI Whisper API.
 * API key stays in the main process — never sent to the renderer.
 */
ipcMain.handle('hinter:transcribe', async (_event, arrayBuffer, mimeType) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-')) {
    throw new Error('OPENAI_API_KEY not set. Add it to a .env file in the project root.');
  }

  const buffer = Buffer.from(arrayBuffer);
  const boundary = '----HinterFormBoundary' + Date.now();
  const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';

  const bodyStart = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="chunk.${ext}"\r\n` +
      `Content-Type: ${mimeType || 'audio/webm'}\r\n\r\n`
  );
  const bodyMid = Buffer.from(
    `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `json\r\n` +
      `--${boundary}--\r\n`
  );
  const body = Buffer.concat([bodyStart, buffer, bodyMid]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Whisper API ${res.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(json.text || '');
          } catch (e) {
            reject(new Error('Failed to parse Whisper response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
});