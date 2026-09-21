import { useCallback, useState } from 'react';
import { useWhisper } from './hooks/useWhisper';
import { useBackend } from './hooks/useBackend';

export default function App() {
  const [lines, setLines] = useState([]);
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);

  const onSuggestion = useCallback((text) => setSuggestion(text), []);
  const { status, setStatus, backendOk, endSession } = useBackend({
    onSuggestion,
  });

  const onTranscript = useCallback((text) => {
    const cleaned = (text || '').trim();
    if (!cleaned) return;
    setLines((prev) => [...prev, cleaned].slice(-40));
  }, []);

  const onError = useCallback(
    (msg) => setStatus({ label: msg || 'STT error', kind: 'error' }),
    [setStatus]
  );

  const { listening, level, start, stop } = useWhisper({
    onTranscript,
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
      setStatus({ label: 'listening', kind: 'ready' });
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
          <span className="mark" />
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
          {busy ? 'Starting…' : listening ? 'Stop' : 'Listen'}
        </button>
        <div className="level-wrap">
          <div className="level-bar" style={{ width: `${level}%` }} />
        </div>
      </div>

      <div className="panel-label">Live transcript</div>
      <div className="transcript">
        {lines.length === 0 ? (
          <span className="hint">
            Backend running + GEMINI_API_KEY in .env, then hit Listen.
          </span>
        ) : (
          lines.map((line, i) => (
            <div className="line" key={`${i}-${line.slice(0, 12)}`}>
              {line}
            </div>
          ))
        )}
      </div>

      <div className="panel-label">Assist</div>
      <div className="suggestions">
        {suggestion || (
          <span className="hint">Suggestions will appear here.</span>
        )}
      </div>
    </div>
  );
}