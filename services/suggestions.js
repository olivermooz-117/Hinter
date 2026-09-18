/**
 * Suggestion engine (placeholder).
 *
 * Takes a rolling transcript window + optional meeting context,
 * calls an LLM (Claude / GPT) with a tight system prompt,
 * and streams short, actionable suggestions back.
 *
 * Design goals:
 * - Debounce so we don't fire on every word
 * - Keep suggestions short (1–3 lines)
 * - Prefer questions, answers, and action items over long summaries
 */
module.exports = {
  generate: async (_transcriptWindow) => {
    throw new Error('Suggestion engine not implemented yet');
  },
};