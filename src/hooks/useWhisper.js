import { useCallback, useRef, useState, useEffect } from 'react';

const BACKEND = 'http://127.0.0.1:5000';
const CHUNK_MS = 4000;

function getHinterAPI() {
  if (typeof window !== 'undefined' && window.hinter) {
    return window.hinter;
  }
  return null;
}

export function useWhisper({ onTranscript, onError }) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [systemAudioState, setSystemAudioState] = useState('idle');

  const streamRef = useRef(null);
  const systemStreamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const api = getHinterAPI();
    if (api?.systemAudio?.listMonitors) {
      api.systemAudio.listMonitors().then((monitors) => {
        if (!monitors || monitors.length === 0) {
          setSystemAudioState('unavailable');
        }
      }).catch(() => {
        setSystemAudioState('unavailable');
      });
    } else {
      setSystemAudioState('unavailable');
    }
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    analyserRef.current = null;
    setLevel(0);
  }, []);

  const startLevelMeter = useCallback((stream) => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      setLevel(Math.min(100, Math.round((sum / data.length / 80) * 100)));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const sendChunk = useCallback(
    async (blob) => {
      const form = new FormData();
      form.append('file', blob, 'chunk.webm');
      const res = await fetch(`${BACKEND}/api/transcribe`, {
        method: 'POST',
        body: form,
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        throw new Error(`Backend HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.text) onTranscript?.(data.text);
    },
    [onTranscript]
  );

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state === 'recording') recorderRef.current.stop();
      } catch (_) {}
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((t) => t.stop());
      systemStreamRef.current = null;
    }
    stopLevelMeter();
    setListening(false);
    if (systemAudioState === 'capturing') {
      setSystemAudioState('idle');
    }
  }, [stopLevelMeter, systemAudioState]);

  const start = useCallback(async () => {
    stop();

    let micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (err) {
      onError?.(err.message || 'Microphone access denied');
      throw err;
    }
    streamRef.current = micStream;

    let combinedStream = micStream;
    const api = getHinterAPI();
    if (api?.systemAudio?.getSourceId && systemAudioState !== 'unavailable') {
      try {
        setSystemAudioState('capturing');
        const monitors = await api.systemAudio.listMonitors();
        if (monitors && monitors.length > 0) {
          const { sourceId } = await api.systemAudio.getSourceId(monitors[0]);
          const systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
              },
            },
            video: false,
          });
          systemStreamRef.current = systemStream;
          const audioCtx = new AudioContext();
          const micSource = audioCtx.createMediaStreamSource(micStream);
          const systemSource = audioCtx.createMediaStreamSource(systemStream);
          const destination = audioCtx.createMediaStreamDestination();
          micSource.connect(destination);
          systemSource.connect(destination);
          combinedStream = destination.stream;
          startLevelMeter(combinedStream);
        } else {
          setSystemAudioState('unavailable');
          startLevelMeter(micStream);
        }
      } catch (err) {
        console.error('System audio capture failed:', err);
        setSystemAudioState('error');
        startLevelMeter(micStream);
      }
    } else {
      startLevelMeter(micStream);
    }

    const mimeCandidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ];
    let mimeType = '';
    for (const t of mimeCandidates) {
      if (MediaRecorder.isTypeSupported(t)) {
        mimeType = t;
        break;
      }
    }

    const recorder = new MediaRecorder(
      combinedStream,
      mimeType ? { mimeType } : undefined
    );
    recorderRef.current = recorder;

    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size < 1000) return;
      try {
        await sendChunk(event.data);
      } catch (err) {
        console.error('Whisper error:', err);
        onError?.(err.message || String(err));
      }
    };

    recorder.start();
    timerRef.current = setInterval(() => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
        recorderRef.current.start();
      }
    }, CHUNK_MS);

    setListening(true);
  }, [stop, startLevelMeter, sendChunk, onError, systemAudioState]);

  return { listening, level, start, stop, systemAudioState };
}