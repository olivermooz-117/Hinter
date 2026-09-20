const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hinter', {
  ping: () => ipcRenderer.invoke('hinter:ping'),
});