import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

function getBackendUrl() {
  const configuredBackend =
    import.meta.env.VITE_BACKEND_URL?.trim();

  if (configuredBackend) {
    return configuredBackend;
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location;

    // Local browser development.
    if (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' ||
        hostname === '127.0.0.1')
    ) {
      return 'http://127.0.0.1:5000';
    }

    // Vercel / normal web deployment.
    if (
      protocol === 'http:' ||
      protocol === 'https:'
    ) {
      return origin;
    }
  }

  // Packaged Electron app.
  return 'http://127.0.0.1:5000';
}

const BACKEND = getBackendUrl();

export function useBackend({ onSuggestion }) {
  const [status, setStatus] = useState({
    label: 'connecting…',
    kind: 'info',
  });

  const [backendOk, setBackendOk] = useState(false);

  const [connectionState, setConnectionState] =
    useState('connecting');

  const socketRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${BACKEND}/api/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Health check failed: ${response.status}`
          );
        }

        return response.json();
      })
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
      .catch((error) => {
        if (cancelled) return;

        console.error(
          '[backend] health check failed:',
          error
        );

        setBackendOk(false);

        setStatus({
          label: 'backend offline',
          kind: 'error',
        });
      });

    /*
     * IMPORTANT:
     *
     * Vercel supports WebSocket connections.
     *
     * Do NOT start with Socket.IO polling here.
     *
     * The previous configuration used:
     *
     *   transports: ['polling', 'websocket']
     *
     * which caused the production deployment to create
     * an Engine.IO polling session and then return HTTP
     * 400 errors when the session was reused/upgraded.
     *
     * Hinter now connects directly through WebSocket.
     */
    const socket = io(BACKEND, {
      transports: ['websocket'],
      upgrade: false,

      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,

      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (cancelled) return;

      console.log(
        '[socket] connected:',
        socket.id
      );

      setConnectionState('connected');

      setStatus((current) => {
        if (
          current.kind === 'error' &&
          current.label === 'backend offline'
        ) {
          return {
            label: 'ready',
            kind: 'ready',
          };
        }

        return current;
      });

      socket.emit('start_session');
    });

    socket.on('disconnect', (reason) => {
      if (cancelled) return;

      console.log(
        '[socket] disconnected:',
        reason
      );

      setConnectionState('disconnected');

      setStatus({
        label: 'backend offline',
        kind: 'error',
      });

      setBackendOk(false);
    });

    socket.on('connect_error', (error) => {
      if (cancelled) return;

      console.error(
        '[socket] connection error:',
        error
      );

      setConnectionState('disconnected');

      setStatus({
        label: 'backend offline',
        kind: 'error',
      });

      setBackendOk(false);
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

      console.error(
        '[backend] error:',
        payload
      );

      setStatus({
        label:
          payload?.message ||
          'Suggestion error',
        kind: 'error',
      });
    });

    socket.on('status', (payload) => {
      if (cancelled) return;

      if (
        payload?.message === 'session_started'
      ) {
        console.log(
          '[socket] session started:',
          payload.session_id
        );
      }
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
      const response = await fetch(
        `${BACKEND}/api/transcript`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Transcript request failed: ${response.status}`
        );
      }
    } catch (error) {
      console.warn(
        '[backend] push transcript failed:',
        error
      );
    }
  };

  const startSession = () => {
    socketRef.current?.emit(
      'start_session'
    );
  };

  const endSession = () => {
    socketRef.current?.emit(
      'end_session'
    );
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
