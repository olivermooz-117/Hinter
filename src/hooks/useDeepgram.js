import { useCallback, useRef, useState } from 'react';

const BACKEND = 'http://127.0.0.1:5000';

/**
 * Streaming STT via Deepgram WebSocket.
 * Audio: mic → AudioContext (16kHz mono) → linear16 → Deepgram.
 */
export function useDeepgram({ onTranscript, onInterim, onError }) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);

  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const processorRef = useRef(null);
  const wsRef = useRef(null);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (_) {}
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
          wsRef.current.close();
        }
      } catch (_) {}
      wsRef.current = null;
    }
    analyserRef.current = null;
    setLevel(0);
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    stop();

    const cfgRes = await fetch(`${BACKEND}/api/stt-config`);
    const cfg = await cfgRes.json();
    if (!cfg.deepgram_key) {
      throw new Error(
        cfg.error ||
          'DEEPGRAM_API_KEY not set. Add it to .env and restart the backend.'
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
      video: false,
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: 16000 });
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

    const params = new URLSearchParams({
      model: cfg.model || 'nova-2',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      endpointing: '300',
    });
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params}`,
      ['token', cfg.deepgram_key]
    );
    wsRef.current = ws;

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('Deepgram WebSocket failed to open'));
      setTimeout(() => reject(new Error('Deepgram connection timeout')), 10000);
    });

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const alt = msg?.channel?.alternatives?.[0];
        const text = alt?.transcript?.trim();
        if (!text) return;
        if (msg.is_final) {
          onTranscript?.(text);
        } else {
          onInterim?.(text);
        }
      } catch (e) {
        console.warn('Deepgram parse error', e);
      }
    };
    ws.onerror = () => onError?.('Deepgram socket error');
    ws.onclose = () => {};

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm = floatTo16BitPCM(input);
      wsRef.current.send(pcm);
    };
    source.connect(processor);
    processor.connect(ctx.destination);

    setListening(true);
  }, [stop, onTranscript, onInterim, onError]);

  return { listening, level, start, stop };
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}