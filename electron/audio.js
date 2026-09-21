const { ipcRenderer } = require('electron');

/**
 * Returns a list of available monitor source names (Linux/PipeWire/PulseAudio).
 * On non-Linux platforms, returns an empty array.
 */
async function listMonitorSources() {
  return ipcRenderer.invoke('system-audio:list-monitors');
}

/**
 * Validates the monitor and enables the Electron display-media loopback path.
 * The renderer must request the actual stream with getDisplayMedia().
 */
async function startSystemAudioCapture(sourceName) {
  return ipcRenderer.invoke('system-audio:start-capture', sourceName);
}

module.exports = { listMonitorSources, startSystemAudioCapture };