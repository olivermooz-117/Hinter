import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';

const BACKEND = BACKEND_URL;

export function useBackend({ onSuggestion }) {
  const [status, setStatus] = useState({
    label: 'connecting…',
    kind: 'info',
  });

  const [backendOk, setBackendOk] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');

  const socketRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${BACKEND}/api/health`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;

        setBackendOk(!!data.ok);

        if (!data.ok) {
          setStatus({
            label: 'backend error',
            kind: 'error',
          });
        } else if (!data.gemini_key) {
          setStatus({
            label: 'ready (no Gemini key)',
            kind: 'warn',
          });
        } else {
          setStatus({
            label: 'ready',
            kind: 'ready',
          });
        }
      })
      .catch(() => {
        if (cancelled) return;

        setBackendOk(false);

        setStatus({
          label: 'backend offline',
          kind: 'error',
        });
      });

    const socket = io(BACKEND, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (cancelled) return;

      console.log('[socket] connected:', socket.id);

      setConnectionState('connected');

      socket.emit('start_session');
    });

    socket.on('disconnect', (reason) => {
      if (cancelled) return;

      console.log('[socket] disconnected:', reason);

      setConnectionState('disconnected');

      setStatus({
        label: 'backend offline',
        kind: 'error',
      });

      setBackendOk(false);
    });

    socket.on('connect_error', (error) => {
      if (cancelled) return;

      console.error('[socket] connection error:', error);

      setConnectionState('disconnected');
    });

    socket.on('suggestion', (payload) => {
      if (payload?.text) {
        onSuggestion?.(payload.text);
      }
    });

    socket.on('error', (payload) => {
      if (payload?.error === 'quota') {
        onSuggestion?.(payload.message);
        return;
      }

      console.error('[backend] error:', payload);

      setStatus({
        label: payload?.message || 'Suggestion error',
        kind: 'error',
      });
    });

    return () => {
      cancelled = true;

      socket.removeAllListeners?.();
      socket.disconnect?.();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [onSuggestion]);

  const pushTranscript = async (text) => {
    if (!text?.trim()) return;

    try {
      await fetch(`${BACKEND}/api/transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
        }),
      });
    } catch (error) {
      console.warn('[backend] push transcript failed:', error);
    }
  };

  const startSession = () => {
    socketRef.current?.emit('start_session');
  };

  const endSession = () => {
    socketRef.current?.emit('end_session');
  };

  return {
    status,
    setStatus,
    backendOk,
    pushTranscript,
    startSession,
    endSession,
    connectionState,
    socket: socketRef.current,
  };
}
