const { ipcRenderer } = require('electron');

/**
 * Returns a list of available monitor source names (Linux/PipeWire/PulseAudio).
 * On non-Linux platforms, returns an empty array.
 */
async function listMonitorSources() {
  return ipcRenderer.invoke('system-audio:list-monitors');
}

/**
 * Requests a desktopCapturer source ID for the given monitor source name.
 * The caller (renderer) must then use this sourceId with getUserMedia:
 *   const stream = await navigator.mediaDevices.getUserMedia({
 *     audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
 *     video: false
 *   });
 * Returns { sourceId: string } on success, throws on failure.
 */
async function startSystemAudioCapture(sourceName) {
  return ipcRenderer.invoke('system-audio:start-capture', sourceName);
}

module.exports = { listMonitorSources, startSystemAudioCapture };