import { useEffect, useState } from 'react';
import { BACKEND_URL } from '../config';

export default function HistoryPanel() {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${BACKEND_URL}/api/sessions`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setSessions(Array.isArray(data) ? data : []);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load sessions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/sessions/${selected}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="history">
      <div className="history-intro">
        <h1>Session history</h1>
        <p>
          Recent Listen sessions stored on this backend. No account required —
          history is scoped to the server instance.
        </p>
      </div>

      {loading && <p className="history-muted">Loading…</p>}
      {error && <p className="history-error">{error}</p>}

      {!loading && !error && sessions.length === 0 && (
        <p className="history-muted">
          No sessions yet. Open Listen, press the button, and speak — then come
          back here.
        </p>
      )}

      <div className="history-layout">
        <ul className="history-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={selected === s.id ? 'active' : ''}
                onClick={() => setSelected(s.id)}
              >
                <span className="history-title">
                  {s.title || `Session #${s.id}`}
                </span>
                <span className="history-meta">
                  {s.started_at
                    ? new Date(s.started_at).toLocaleString()
                    : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="history-detail">
          {!selected && sessions.length > 0 && (
            <p className="history-muted">Select a session to view transcript and suggestions.</p>
          )}
          {detail && (
            <>
              <h2>{detail.title || `Session #${detail.id}`}</h2>
              <section>
                <h3>Transcript</h3>
                {(detail.transcripts || []).length === 0 ? (
                  <p className="history-muted">No lines saved.</p>
                ) : (
                  <ul className="history-lines">
                    {detail.transcripts.map((t, i) => (
                      <li key={i}>{t.text}</li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3>Suggestions</h3>
                {(detail.suggestions || []).length === 0 ? (
                  <p className="history-muted">No suggestions saved.</p>
                ) : (
                  <ul className="history-lines history-suggestions">
                    {detail.suggestions.map((s, i) => (
                      <li key={i}>{s.text}</li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
