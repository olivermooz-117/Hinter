import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const BACKEND = 'http://127.0.0.1:5000';

export function useBackend({ onSuggestion }) {
  const [status, setStatus] = useState({
    label: 'connecting…',
    kind: 'info',
  });
  const [backendOk, setBackendOk] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${BACKEND}/api/health`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBackendOk(!!data.ok);
        if (!data.ok) {
          setStatus({ label: 'backend error', kind: 'error' });
        } else if (!data.openai_key && !data.deepgram_key) {
          setStatus({ label: 'ready (no API keys)', kind: 'warn' });
        } else {
          setStatus({ label: 'ready', kind: 'ready' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBackendOk(false);
        setStatus({ label: 'backend offline', kind: 'error' });
      });

    const socket = io(BACKEND, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('start_session'));
    socket.on('suggestion', (payload) => {
      if (payload?.text) onSuggestion?.(payload.text);
    });
    socket.on('error', (payload) => {
      console.error('backend error', payload);
      setStatus({ label: payload?.message || 'Suggestion error', kind: 'error' });
    });
    socket.on('disconnect', () => {
      setStatus({ label: 'backend offline', kind: 'error' });
      setBackendOk(false);
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [onSuggestion]);

  const pushTranscript = async (text) => {
    if (!text?.trim()) return;
    try {
      await fetch(`${BACKEND}/api/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (e) {
      console.warn('push transcript failed', e);
    }
  };

  const endSession = () => {
    socketRef.current?.emit('end_session');
  };

  return { status, setStatus, backendOk, pushTranscript, endSession };
}