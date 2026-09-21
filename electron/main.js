const { app, BrowserWindow, screen, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let overlayWindow = null;
let SYSTEM_AUDIO_AVAILABLE = false;

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const isDev =
  !app.isPackaged &&
  (process.env.HINTER_DEV === '1' || process.env.NODE_ENV === 'development');

function detectMonitorSources() {
  if (process.platform !== 'linux') {
    return true;
  }
  return listLinuxMonitorSources().length > 0;
}

function listLinuxMonitorSources() {
  if (process.platform !== 'linux') return [];

  const monitors = [];
  try {
    const pactlOut = execSync('pactl list short sources', { encoding: 'utf8', timeout: 2000 });
    for (const line of pactlOut.trim().split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 2 && parts[1].endsWith('.monitor')) {
        monitors.push(parts[1]);
      }
    }
  } catch (error) {
    console.warn('[system-audio] pactl monitor detection failed:', error.message);
  }
  return monitors;
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 440,
    height: 340,
    x: width - 460,
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

  if (isDev) {
    overlayWindow.loadURL('http://127.0.0.1:5173');
  } else {
    overlayWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

app.whenReady().then(() => {
  SYSTEM_AUDIO_AVAILABLE = detectMonitorSources();

  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      console.info('[system-audio] display media request', {
        platform: process.platform,
        available: SYSTEM_AUDIO_AVAILABLE,
        audioRequested: request.audio,
        videoRequested: request.video,
      });
      callback({
        video: null,
        audio: SYSTEM_AUDIO_AVAILABLE ? 'loopback' : false,
      });
    },
    { useSystemPicker: true }
  );

  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      callback(
        ['media', 'mediaKeySystem', 'display-capture'].includes(permission)
      );
    }
  );

  createOverlayWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('hinter:ping', () => 'pong from main process');

ipcMain.handle('system-audio:list-monitors', async () => {
  const monitors = listLinuxMonitorSources();
  console.info('[system-audio] monitor sources:', monitors);
  return monitors;
});

ipcMain.handle('system-audio:start-capture', async (_event, sourceName) => {
  if (process.platform !== 'linux') {
    throw new Error('System audio capture only implemented for Linux in this build');
  }
  const monitors = listLinuxMonitorSources();
  if (!sourceName || !monitors.includes(sourceName)) {
    throw new Error(`Monitor source is no longer available: ${sourceName || '(none)'}`);
  }
  console.info('[system-audio] requesting loopback for monitor:', sourceName);
  return { sourceName };
});