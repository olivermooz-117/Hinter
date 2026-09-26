import { useCallback, useState } from 'react';
import { useWhisper } from '../hooks/useWhisper';
import { useBackend } from '../hooks/useBackend';

/**
 * Live listen / transcript / suggestion UI.
 * Used as Electron overlay and as the in-page demo on the marketing site.
 */
export default function ListenerPanel({ embedded = false }) {
  const [lines, setLines] = useState([]);
  const [interim, setInterim] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [shareDisplay, setShareDisplay] = useState(false);

  const onSuggestion = useCallback((text) => {
    setSuggestion(text);
  }, []);

  const { status, setStatus, backendOk, endSession, socket } = useBackend({
    onSuggestion,
  });

  const onTranscript = useCallback((text) => {
    const cleaned = (text || '').trim();
    if (!cleaned) return;
    setInterim('');
    setLines((prev) => [...prev, cleaned].slice(-40));
  }, []);

  const onInterim = useCallback((text) => {
    setInterim((text || '').trim());
  }, []);

  const onError = useCallback(
    (msg) => setStatus({ label: msg || 'STT error', kind: 'error' }),
    [setStatus]
  );

  const {
    listening,
    level,
    systemAudioState,
    audioSource,
    start,
    stop,
  } = useWhisper({
    onTranscript,
    onInterim,
    onError,
    socket,
  });

  const toggle = async () => {
    if (listening) {
      stop();
      endSession();
      setInterim('');
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
      await start({ shareDisplayAudio: shareDisplay });
      setStatus({
        label: shareDisplay ? 'listening (+ tab audio)' : 'listening',
        kind: 'ready',
      });
    } catch (err) {
      setStatus({ label: err.message || 'mic/STT error', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`overlay${embedded ? ' overlay--embedded' : ''}`}
      id="demo"
    >
      <div className="header">
        <div className="title">
          <span className="dot" />
          <span>Hinter</span>
          {embedded ? <span className="live-badge">Live demo</span> : null}
        </div>
        <span className={`status ${status.kind}`}>{status.label}</span>
      </div>

      <div className="controls">
        <button
          className={`listen-btn ${listening ? 'listening' : ''}`}
          onClick={toggle}
          disabled={busy}
          type="button"
        >
          {busy ? 'Starting…' : listening ? 'Stop' : 'Listen'}
        </button>
        <div className="level-wrap">
          <div className="level-bar" style={{ width: `${level}%` }} />
        </div>
      </div>

      {!listening && (
        <label className="share-toggle">
          <input
            type="checkbox"
            checked={shareDisplay}
            onChange={(e) => setShareDisplay(e.target.checked)}
          />
          Share tab/screen audio (browser)
        </label>
      )}

      <div className="section-label">Live transcript</div>
      <div className="transcript">
        {lines.length === 0 && !interim ? (
          <span className="hint">
            Backend online, then hit Listen. Optional: share tab audio for
            meeting capture in the browser.
          </span>
        ) : (
          <>
            {lines.map((line, i) => (
              <div className="line" key={`${i}-${line.slice(0, 16)}`}>
                {line}
              </div>
            ))}
            {interim ? <div className="line interim">{interim}</div> : null}
          </>
        )}
      </div>

      <div className="suggestion">
        <div className="suggestion-label">AI suggestion</div>
        <div className="suggestion-text">
          {suggestion || 'Suggestions will appear here.'}
        </div>
      </div>

      <div className="audio-state">
        System audio: {systemAudioState}
        {listening ? ` · source: ${audioSource}` : ''}
      </div>
    </div>
  );
}
