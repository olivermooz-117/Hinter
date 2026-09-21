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

    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

const isDev =
  !app.isPackaged &&
  (process.env.HINTER_DEV === '1' ||
    process.env.NODE_ENV === 'development');

function listLinuxMonitorSources() {
  if (process.platform !== 'linux') {
    return [];
  }

  const monitors = [];

  try {
    const pactlOut = execSync('pactl list short sources', {
      encoding: 'utf8',
      timeout: 2000,
    });

    for (const line of pactlOut.trim().split('\n')) {
      const parts = line.split('\t');

      if (
        parts.length >= 2 &&
        parts[1] &&
        parts[1].endsWith('.monitor')
      ) {
        monitors.push(parts[1]);
      }
    }
  } catch (error) {
    console.warn(
      '[system-audio] pactl monitor detection failed:',
      error.message
    );
  }

  return monitors;
}

function detectMonitorSources() {
  if (process.platform !== 'linux') {
    return false;
  }

  return listLinuxMonitorSources().length > 0;
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
  overlayWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  if (isDev) {
    overlayWindow.loadURL('http://127.0.0.1:5173');
  } else {
    overlayWindow.loadFile(
      path.join(__dirname, '..', 'dist', 'index.html')
    );
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function configureDisplayMediaHandler() {
  /*
   * Linux/PipeWire:
   *
   * We do NOT use getDisplayMedia() for system audio here.
   *
   * Electron's "audio: 'loopback'" display-media option is currently
   * supported only on Windows. Passing video: null also causes Electron
   * to throw because video must be a DesktopCapturerSource or WebFrameMain.
   *
   * Linux system audio is handled separately through the PipeWire/PulseAudio
   * monitor source exposed to the renderer.
   */

  if (process.platform === 'linux') {
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        console.info(
          '[system-audio] Linux display capture requested; display-media system audio is disabled'
        );

        callback(null);
      }
    );

    return;
  }

  /*
   * For non-Linux platforms, leave display capture to Electron's normal
   * handling. The Linux monitor implementation above is the platform-specific
   * path used by this build.
   */
}

app.whenReady().then(() => {
  SYSTEM_AUDIO_AVAILABLE = detectMonitorSources();

  console.info('[system-audio] monitor detection:', {
    platform: process.platform,
    available: SYSTEM_AUDIO_AVAILABLE,
    monitors: listLinuxMonitorSources(),
  });

  configureDisplayMediaHandler();

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(
        [
          'media',
          'mediaKeySystem',
          'display-capture',
        ].includes(permission)
      );
    }
  );

  createOverlayWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('hinter:ping', () => 'pong from main process');

ipcMain.handle('system-audio:list-monitors', async () => {
  const monitors = listLinuxMonitorSources();

  console.info('[system-audio] monitor sources:', monitors);

  return monitors;
});

ipcMain.handle(
  'system-audio:start-capture',
  async (_event, sourceName) => {
    if (process.platform !== 'linux') {
      throw new Error(
        'System audio capture only implemented for Linux in this build'
      );
    }

    const monitors = listLinuxMonitorSources();

    if (!sourceName || !monitors.includes(sourceName)) {
      throw new Error(
        `Monitor source is no longer available: ${
          sourceName || '(none)'
        }`
      );
    }

    console.info(
      '[system-audio] selected PipeWire/PulseAudio monitor:',
      sourceName
    );

    return {
      sourceName,
    };
  }
);

