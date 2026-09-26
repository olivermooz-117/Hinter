const { app, BrowserWindow, screen, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

let overlayWindow = null;
let SYSTEM_AUDIO_AVAILABLE = false;

const SYSTEM_AUDIO_SOURCE = 'hinter_system_audio';
const SYSTEM_AUDIO_DESCRIPTION = 'Hinter-System-Audio';

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

function runPactl(args) {
  return execFileSync('pactl', args, {
    encoding: 'utf8',
    timeout: 3000,
  }).trim();
}

function listLinuxSources() {
  if (process.platform !== 'linux') {
    return [];
  }

  try {
    const output = runPactl(['list', 'short', 'sources']);

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);

        return {
          id: parts[0],
          name: parts[1],
          driver: parts[2],
          format: parts[3],
          channels: parts[4],
          sampleRate: parts[5],
          state: parts.slice(6).join(' '),
        };
      });
  } catch (error) {
    console.warn(
      '[system-audio] Could not list PulseAudio/PipeWire sources:',
      error.message
    );

    return [];
  }
}

function listLinuxMonitorSources() {
  const monitors = listLinuxSources()
    .filter((source) => source.name?.endsWith('.monitor'))
    .map((source) => source.name);

  // Prefer the default sink's monitor when available.
  try {
    const info = runPactl(['info']);
    const match = /Default Sink:\s*(.+)/i.exec(info || '');
    if (match) {
      const preferred = `${match[1].trim()}.monitor`;
      const idx = monitors.indexOf(preferred);
      if (idx > 0) {
        monitors.splice(idx, 1);
        monitors.unshift(preferred);
      } else if (idx === -1 && monitors.length) {
        console.info(
          '[system-audio] default sink monitor not listed yet:',
          preferred
        );
      }
    }
  } catch (error) {
    console.warn('[system-audio] could not read default sink:', error.message);
  }

  return monitors;
}

/**
 * Ensures that Hinter-System-Audio exists.
 *
 * The source is a remapped copy of the default speaker monitor.
 * This allows Chromium/Electron to capture computer audio as an
 * ordinary input device while leaving the user's physical microphone
 * untouched.
 */
function ensureLinuxSystemAudioSource() {
  if (process.platform !== 'linux') {
    return false;
  }

  const sources = listLinuxSources();

  const existing = sources.find(
    (source) => source.name === SYSTEM_AUDIO_SOURCE
  );

  if (existing) {
    console.info(
      '[system-audio] Existing Hinter-System-Audio source found:',
      existing.name
    );

    return true;
  }

  // Prefer default-sink monitor (listLinuxMonitorSources already sorts).
  const preferredMonitors = listLinuxMonitorSources();
  const monitorName =
    preferredMonitors[0] ||
    sources.find((source) => source.name?.endsWith('.monitor'))?.name;

  if (!monitorName) {
    console.warn(
      '[system-audio] No Linux monitor source is available yet.'
    );

    return false;
  }

  try {
    console.info(
      '[system-audio] Creating Hinter-System-Audio from:',
      monitorName
    );

    const moduleId = runPactl([
      'load-module',
      'module-remap-source',
      `master=${monitorName}`,
      `source_name=${SYSTEM_AUDIO_SOURCE}`,
      `source_properties=device.description=${SYSTEM_AUDIO_DESCRIPTION}`,
      'channels=2',
      'channel_map=front-left,front-right',
      'master_channel_map=front-left,front-right',
      'remix=no',
    ]);

    console.info(
      '[system-audio] Hinter-System-Audio created successfully.',
      {
        moduleId,
        sourceName: SYSTEM_AUDIO_SOURCE,
      }
    );

    return true;
  } catch (error) {
    console.error(
      '[system-audio] Failed to create Hinter-System-Audio:',
      error.message
    );

    return false;
  }
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
   * Electron's "audio: 'loopback'" display-media option is
   * platform-dependent and is not used by Hinter's Linux path.
   *
   * Linux system audio is handled through the PipeWire/PulseAudio
   * Hinter-System-Audio source exposed to the renderer.
   */

  if (process.platform === 'linux') {
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        console.info(
          '[system-audio] Linux display capture requested; ' +
            'display-media system audio is disabled'
        );

        callback(null);
      }
    );

    return;
  }
}

app.whenReady().then(() => {
  /*
   * Make sure the virtual system-audio source exists BEFORE
   * the renderer starts enumerating audio devices.
   */
  if (process.platform === 'linux') {
    SYSTEM_AUDIO_AVAILABLE = ensureLinuxSystemAudioSource();

    /*
     * The source may take a moment to appear in PipeWire after
     * module-remap-source returns, so verify it once more.
     */
    if (!SYSTEM_AUDIO_AVAILABLE) {
      setTimeout(() => {
        SYSTEM_AUDIO_AVAILABLE = ensureLinuxSystemAudioSource();

        console.info('[system-audio] delayed availability check:', {
          available: SYSTEM_AUDIO_AVAILABLE,
          source: SYSTEM_AUDIO_SOURCE,
        });
      }, 500);
    }
  }

  const monitors = listLinuxMonitorSources();

  console.info('[system-audio] monitor detection:', {
    platform: process.platform,
    available: SYSTEM_AUDIO_AVAILABLE,
    monitors,
    hinterSource: SYSTEM_AUDIO_SOURCE,
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

ipcMain.handle(
  'system-audio:list-monitors',
  async () => {
    /*
     * Re-check the virtual source whenever the renderer asks for
     * available system audio. This also repairs the source if
     * PipeWire removed it while Hinter was running.
     */
    if (process.platform === 'linux') {
      SYSTEM_AUDIO_AVAILABLE = ensureLinuxSystemAudioSource();
    }

    const monitors = listLinuxMonitorSources();

    console.info('[system-audio] monitor sources:', monitors);

    return monitors;
  }
);

ipcMain.handle(
  'system-audio:start-capture',
  async (_event, sourceName) => {
    if (process.platform !== 'linux') {
      throw new Error(
        'System audio capture only implemented for Linux in this build'
      );
    }

    /*
     * Make sure the virtual source exists before capture begins.
     */
    SYSTEM_AUDIO_AVAILABLE = ensureLinuxSystemAudioSource();

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
      systemAudioSource: SYSTEM_AUDIO_SOURCE,
      systemAudioAvailable: SYSTEM_AUDIO_AVAILABLE,
    };
  }
);