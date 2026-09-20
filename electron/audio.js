/**
 * Audio capture notes (logic lives mainly in the renderer for getUserMedia).
 *
 * Mic:          navigator.mediaDevices.getUserMedia({ audio: true })
 * System audio: desktopCapturer → chromeMediaSource: 'desktop' (platform-dependent)
 *
 * On Linux, true system-audio loopback often requires a PulseAudio monitor
 * source; Electron's desktopCapturer may only give screen + optional audio
 * depending on the distro/PipeWire setup.
 *
 * This file is reserved for any future main-process capture helpers
 * (e.g. writing raw PCM to disk, native addons, etc.).
 */

module.exports = {};