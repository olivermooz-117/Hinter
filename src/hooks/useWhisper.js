import { useCallback, useRef, useState } from 'react';

const BACKEND = 'http://127.0.0.1:5000';
const CHUNK_MS = 4000;

export function useWhisper({ onTranscript, onError }) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);

  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);

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
    stopLevelMeter();
    setListening(false);
  }, [stopLevelMeter]);

  const start = useCallback(async () => {
    stop();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    streamRef.current = stream;
    startLevelMeter(stream);

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
      stream,
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
  }, [stop, startLevelMeter, sendChunk, onError]);

  return { listening, level, start, stop };
}