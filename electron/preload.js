const { contextBridge, ipcRenderer } = require('electron');

// Everything the renderer (your UI) is allowed to call on the main process
// goes through here — nothing else is exposed, for security.
contextBridge.exposeInMainWorld('hinter', {
  ping: () => ipcRenderer.invoke('hinter:ping'),
});
