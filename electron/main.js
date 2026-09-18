const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let overlayWindow = null;

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 260,
    x: width - 440,       // tuck it in the top-right corner
    y: 40,
    frame: false,          // no title bar
    transparent: true,     // lets our CSS control the rounded/blurred look
    alwaysOnTop: true,     // floats above other windows
    resizable: true,
    skipTaskbar: false,    // keep this true-to-life/visible for now (disclosed tool)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep it above fullscreen apps too (e.g. a fullscreen video call)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Simple IPC handshake so the renderer can confirm it's talking to the main process
ipcMain.handle('hinter:ping', () => 'pong from main process');

app.whenReady().then(() => {
  createOverlayWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
