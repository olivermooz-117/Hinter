import { useCallback, useEffect, useRef, useState } from 'react';

const SYSTEM_AUDIO_LABEL = 'Hinter-System-Audio';
const TARGET_SAMPLE_RATE = 16000;

function getHinterAPI() {
  if (typeof window === 'undefined') return null;
  return window.hinter || null;
}

async function findSystemAudioDevice() {
  if (!navigator.mediaDevices?.enumerateDevices) return null;

  const devices = await navigator.mediaDevices.enumerateDevices();
  return (
    devices.find(
      (device) =>
        device.kind === 'audioinput' &&
        (device.label === SYSTEM_AUDIO_LABEL ||
          device.label.toLowerCase().includes('hinter-system-audio'))
    ) || null
  );
}

/**
 * Resample Float32 mono audio to 16 kHz and convert to signed 16-bit PCM.
 */
function floatTo16BitPCM(input, sourceRate = 48000) {
  if (!input || input.length === 0) {
    return new ArrayBuffer(0);
  }

  let samples = input;

  if (sourceRate !== TARGET_SAMPLE_RATE && sourceRate > 0) {
    const ratio = sourceRate / TARGET_SAMPLE_RATE;
    const newLength = Math.max(1, Math.round(input.length / ratio));
    const resampled = new Float32Array(newLength);

    for (let i = 0; i < newLength; i += 1) {
      const srcIndex = i * ratio;
      const left = Math.floor(srcIndex);
      const right = Math.min(left + 1, input.length - 1);
      const frac = srcIndex - left;
      resampled[i] = input[left] * (1 - frac) + input[right] * frac;
    }

    samples = resampled;
  }

  const output = new ArrayBuffer(samples.length * 2);
  const view = new DataView(output);

  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return output;
}

function stopTracks(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Live audio capture → 16 kHz PCM → Socket.IO transcription:audio
 *
 * Paths:
 * - Mic only (always)
 * - Electron Linux: mic + Hinter-System-Audio monitor (mixed)
 * - Browser: optional getDisplayMedia tab/screen audio (mixed)
 */
export function useWhisper({ onTranscript, onInterim, onError, socket }) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [systemAudioState, setSystemAudioState] = useState('idle');
  const [audioSource, setAudioSource] = useState('mic');

  const streamRef = useRef(null);
  const systemStreamRef = useRef(null);
  const displayStreamRef = useRef(null);
  const mixCtxRef = useRef(null);
  const meterCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const processorRef = useRef(null);
  const socketHandlersRef = useRef(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSystemAudio() {
      try {
        const api = getHinterAPI();

        if (!api?.systemAudio?.listMonitors) {
          if (!cancelled) setSystemAudioState('browser');
          return;
        }

        const monitors = await api.systemAudio.listMonitors();
        if (cancelled) return;

        if (!monitors || monitors.length === 0) {
          setSystemAudioState('unavailable');
          return;
        }

        const preferred = monitors[0];

        try {
          await api.systemAudio.startCapture(preferred);
        } catch (err) {
          console.warn('[system-audio] startCapture probe failed:', err);
        }

        const device = await findSystemAudioDevice();
        if (!cancelled) {
          setSystemAudioState(device ? 'ready' : 'unavailable');
        }
      } catch (error) {
        console.warn('[system-audio] device detection failed:', error);
        if (!cancelled) setSystemAudioState('unavailable');
      }
    }

    checkSystemAudio();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (meterCtxRef.current) {
      meterCtxRef.current.close().catch(() => {});
      meterCtxRef.current = null;
    }
    analyserRef.current = null;
    setLevel(0);
  }, []);

  const startLevelMeter = useCallback((stream) => {
    try {
      if (typeof AudioContext === 'undefined' || !stream) return;

      const ctx = new AudioContext();
      meterCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        setLevel(
          Math.min(100, Math.round((sum / data.length / 80) * 100))
        );
        rafRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch (error) {
      console.warn('[audio] level meter failed:', error);
    }
  }, []);

  const detachSocketHandlers = useCallback(() => {
    const handlers = socketHandlersRef.current;
    if (socket && handlers) {
      try {
        if (typeof socket.off === 'function') {
          socket.off('transcript', handlers.transcript);
          socket.off('transcription:final', handlers.final);
          socket.off('transcription:interim', handlers.interim);
          socket.off('transcription_error', handlers.error);
        }
        if (typeof socket.emit === 'function') {
          socket.emit('transcription:stop');
        }
      } catch (error) {
        console.warn('[socket] cleanup failed:', error);
      }
    }
    socketHandlersRef.current = null;
  }, [socket]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    detachSocketHandlers();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      } catch (_) {
        /* ignore */
      }
      processorRef.current = null;
    }

    if (mixCtxRef.current) {
      mixCtxRef.current.close().catch(() => {});
      mixCtxRef.current = null;
    }

    stopTracks(streamRef.current);
    streamRef.current = null;
    stopTracks(systemStreamRef.current);
    systemStreamRef.current = null;
    stopTracks(displayStreamRef.current);
    displayStreamRef.current = null;

    stopLevelMeter();
    setListening(false);
    setAudioSource('mic');
  }, [detachSocketHandlers, stopLevelMeter]);

  /**
   * Browser: share a tab/window/screen with audio.
   * Chrome often requires video:true; we keep audio tracks only.
   */
  const captureDisplayAudio = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('getDisplayMedia is not supported in this browser');
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 1,
        height: 1,
        frameRate: 1,
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    displayStream.getVideoTracks().forEach((track) => {
      track.stop();
      displayStream.removeTrack(track);
    });

    const audioTracks = displayStream.getAudioTracks();
    if (!audioTracks.length) {
      stopTracks(displayStream);
      throw new Error(
        'No tab/system audio track. In the share dialog, enable “Share audio”.'
      );
    }

    audioTracks.forEach((track) => {
      track.onended = () => {
        if (listeningRef.current) {
          onError?.(
            'Tab/screen share ended. Stop and start listening again if needed.'
          );
        }
      };
    });

    return displayStream;
  }, [onError]);

  const mixStreams = useCallback(async (micStream, secondaryStream) => {
    const audioCtx = new AudioContext();
    mixCtxRef.current = audioCtx;

    const destination = audioCtx.createMediaStreamDestination();
    const micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(destination);

    if (secondaryStream?.getAudioTracks?.().length) {
      const secondarySource =
        audioCtx.createMediaStreamSource(secondaryStream);
      secondarySource.connect(destination);
    }

    return destination.stream;
  }, []);

  const startPcmStreaming = useCallback(
    (combinedStream) => {
      if (!socket || typeof socket.emit !== 'function') {
        throw new Error('Socket is not connected');
      }

      const handleFinal = (payload) => {
        const text =
          typeof payload === 'string' ? payload : payload?.text || '';
        if (text) onTranscript?.(text);
      };

      const handleInterim = (payload) => {
        const text =
          typeof payload === 'string' ? payload : payload?.text || '';
        if (text) onInterim?.(text);
      };

      const handleError = (payload) => {
        const message =
          typeof payload === 'string'
            ? payload
            : payload?.message || 'Live transcription error';
        onError?.(message);
      };

      socketHandlersRef.current = {
        transcript: handleFinal,
        final: handleFinal,
        interim: handleInterim,
        error: handleError,
      };

      // Match backend emits: transcription:interim | transcription:final | transcript
      socket.on('transcription:final', handleFinal);
      socket.on('transcript', handleFinal);
      socket.on('transcription:interim', handleInterim);
      socket.on('transcription_error', handleError);

      socket.emit('transcription:start');

      let pcmCtx = mixCtxRef.current;
      if (!pcmCtx) {
        pcmCtx = new AudioContext();
        mixCtxRef.current = pcmCtx;
      }

      const audioSourceNode = pcmCtx.createMediaStreamSource(combinedStream);

      if (typeof pcmCtx.createScriptProcessor !== 'function') {
        throw new Error('PCM audio processing is unavailable');
      }

      const processor = pcmCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!listeningRef.current) return;
        if (!socket || typeof socket.emit !== 'function') return;

        try {
          const input = event.inputBuffer.getChannelData(0);
          const rate = pcmCtx.sampleRate || 48000;
          const pcm = floatTo16BitPCM(input, rate);
          if (pcm.byteLength > 0) {
            socket.emit('transcription:audio', pcm);
          }
        } catch (error) {
          console.warn('[audio] PCM processing failed:', error);
        }
      };

      audioSourceNode.connect(processor);
      processor.connect(pcmCtx.destination);
    },
    [socket, onTranscript, onInterim, onError]
  );

  const start = useCallback(
    async ({ shareDisplayAudio = false } = {}) => {
      stop();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia is not available');
      }

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });

      streamRef.current = micStream;
      let combinedStream = micStream;
      let sourceLabel = 'mic';

      // Electron Linux system audio
      try {
        const api = getHinterAPI();
        if (api?.systemAudio?.listMonitors) {
          const monitors = await api.systemAudio.listMonitors();
          if (monitors?.length) {
            await api.systemAudio.startCapture(monitors[0]);
            await navigator.mediaDevices.enumerateDevices();

            const systemDevice = await findSystemAudioDevice();
            if (systemDevice) {
              const systemStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: { exact: systemDevice.deviceId },
                  channelCount: 2,
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false,
                },
                video: false,
              });

              if (systemStream.getAudioTracks().length) {
                systemStreamRef.current = systemStream;
                combinedStream = await mixStreams(micStream, systemStream);
                sourceLabel = 'mic+system';
                setSystemAudioState('active');
                console.info('[system-audio] mic + system mixed');
              }
            } else {
              setSystemAudioState('unavailable');
            }
          }
        }
      } catch (error) {
        console.warn(
          '[system-audio] Capture failed; falling back to microphone:',
          error
        );
        setSystemAudioState('error');
        stopTracks(systemStreamRef.current);
        systemStreamRef.current = null;
        combinedStream = micStream;
        sourceLabel = 'mic';
      }

      // Browser tab/screen audio (explicit opt-in)
      if (shareDisplayAudio && sourceLabel === 'mic') {
        try {
          const displayStream = await captureDisplayAudio();
          displayStreamRef.current = displayStream;
          combinedStream = await mixStreams(micStream, displayStream);
          sourceLabel = 'mic+display';
          setSystemAudioState('display');
          console.info('[display-audio] mic + tab/screen audio mixed');
        } catch (error) {
          console.warn('[display-audio] failed:', error);
          setSystemAudioState('error');
          onError?.(error.message || String(error));
          combinedStream = micStream;
          sourceLabel = 'mic';
        }
      }

      startLevelMeter(combinedStream);
      startPcmStreaming(combinedStream);

      listeningRef.current = true;
      setAudioSource(sourceLabel);
      setListening(true);
      console.info('[whisper] PCM streaming started:', sourceLabel);
    },
    [
      stop,
      mixStreams,
      captureDisplayAudio,
      startLevelMeter,
      startPcmStreaming,
      onError,
    ]
  );

  return {
    listening,
    level,
    systemAudioState,
    audioSource,
    start,
    stop,
  };
}
