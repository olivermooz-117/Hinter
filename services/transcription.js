/**
 * Streaming transcription service (placeholder).
 *
 * Planned providers: Deepgram Nova / AssemblyAI.
 * Input: raw audio chunks from electron/audio.js
 * Output: partial + final transcript events
 */
module.exports = {
  start: async () => {
    throw new Error('Transcription service not implemented yet');
  },
  stop: async () => {},
};