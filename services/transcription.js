/**
 * Transcription notes (Whisper is called from Electron main process for now).
 *
 * Current: OpenAI Whisper API via IPC (hinter:transcribe)
 * Later:   move to Flask backend, or swap for Deepgram/AssemblyAI streaming
 *
 * Chunk size: ~4 seconds of audio (MediaRecorder in renderer)
 */
module.exports = {
  // Placeholder — real work is in electron/main.js + renderer.js for this milestone
};