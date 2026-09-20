import { useCallback, useState } from 'react';
import { useDeepgram } from './hooks/useDeepgram';
import { useBackend } from './hooks/useBackend';

export default function App() {
  const [lines, setLines] = useState([]);
  const [interim, setInterim] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);

  const onSuggestion = useCallback((text) => setSuggestion(text), []);
  const { status, setStatus, backendOk, pushTranscript, endSession } =
    useBackend({ onSuggestion });

  const onTranscript = useCallback(
    (text) => {
      setLines((prev) => {
        const next = [...prev, text].slice(-40);
        return next;
      });
      setInterim('');
      pushTranscript(text);
    },
    [pushTranscript]
  );

  const onInterim = useCallback((text) => setInterim(text), []);
  const onError = useCallback(
    (msg) => setStatus({ label: msg || 'STT error', kind: 'error' }),
    [setStatus]
  );

  const { listening, level, start, stop } = useDeepgram({
    onTranscript,
    onInterim,
    onError,
  });

  const toggle = async () => {
    if (listening) {
      stop();
      endSession();
      setStatus({
        label: backendOk ? 'ready' : 'backend offline',
        kind: backendOk ? 'ready' : 'error',
      });
      return;
    }
    if (!backendOk) {
      setStatus({ label: 'backend offline', kind: 'error' });
      return;
    }
    setBusy(true);
    try {
      await start();
      setStatus({ label: 'listening (Deepgram)', kind: 'ready' });
    } catch (err) {
      setStatus({ label: err.message || 'mic/STT error', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <div className="header">
        <div className="title">
          <span>🔎</span>
          <span>Hinter</span>
        </div>
        <span className={`status ${status.kind}`}>{status.label}</span>
      </div>

      <div className="controls">
        <button
          className={`listen-btn ${listening ? 'listening' : ''}`}
          onClick={toggle}
          disabled={busy}
        >
          {busy ? 'Starting…' : listening ? 'Stop listening' : 'Start listening'}
        </button>
        <div className="level-wrap">
          <div className="level-bar" style={{ width: `${level}%` }} />
        </div>
      </div>

      <div className="transcript">
        {lines.length === 0 && !interim ? (
          <span className="hint">
            Start the Flask backend, set DEEPGRAM_API_KEY + OPENAI_API_KEY in
            .env, then click Start listening.
          </span>
        ) : (
          <>
            {lines.map((line, i) => (
              <div className="line" key={`${i}-${line.slice(0, 12)}`}>
                {line}
              </div>
            ))}
            {interim ? <div className="line interim">{interim}</div> : null}
          </>
        )}
      </div>

      <div className="suggestions">
        {suggestion || (
          <span className="hint">Suggestions will appear here.</span>
        )}
      </div>
    </div>
  );
}