const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hinter', {
  ping: () => ipcRenderer.invoke('hinter:ping'),
  systemAudio: {
    listMonitors: () => ipcRenderer.invoke('system-audio:list-monitors'),
    getSourceId: (sourceName) => ipcRenderer.invoke('system-audio:start-capture', sourceName),
  },
});