const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge between renderer and main process.
 * Only expose what the UI actually needs.
 */
contextBridge.exposeInMainWorld('hinter', {
  ping: () => ipcRenderer.invoke('hinter:ping'),
  getDesktopSources: () => ipcRenderer.invoke('hinter:getDesktopSources'),
});