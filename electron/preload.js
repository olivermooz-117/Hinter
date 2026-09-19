const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge between renderer and main process.
 * API key never leaves the main process.
 */
contextBridge.exposeInMainWorld('hinter', {
  ping: () => ipcRenderer.invoke('hinter:ping'),
  getDesktopSources: () => ipcRenderer.invoke('hinter:getDesktopSources'),
  hasApiKey: () => ipcRenderer.invoke('hinter:hasApiKey'),
  transcribe: (arrayBuffer, mimeType) =>
    ipcRenderer.invoke('hinter:transcribe', arrayBuffer, mimeType),
});