import { useCallback, useRef, useState, useEffect } from 'react';
const SYSTEM_AUDIO_LABEL = 'Hinter-System-Audio';

function getHinterAPI() {
  if (typeof window !== 'undefined' && window.hinter) {
    return window.hinter;
  }

  return null;
}

async function findSystemAudioDevice() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  const audioInputs = devices.filter(
    (device) => device.kind === 'audioinput'
  );

  const systemDevice = audioInputs.find(
    (device) =>
      device.label === SYSTEM_AUDIO_LABEL ||
      device.label.toLowerCase().includes('hinter-system-audio')
  );

  return systemDevice || null;
}

function floatToPcm16(input, sourceRate) {
  const ratio = sourceRate / 16000;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new ArrayBuffer(outputLength * 2);
  const view = new DataView(output);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = Math.min(input.length - 1, Math.floor(index * ratio));
    const sample = Math.max(-1, Math.min(1, input[sourceIndex] || 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return output;
}

export function useWhisper({ onTranscript, onError, socket }) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [systemAudioState, setSystemAudioState] = useState('idle');

  const streamRef = useRef(null);
  const systemStreamRef = useRef(null);
  const mixCtxRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recorderRef = useRef(null);
  const processorRef = useRef(null);
  const socketHandlersRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function checkSystemAudio() {
      try {
        const api = getHinterAPI();

        if (!api?.systemAudio?.listMonitors) {
          if (!cancelled) {
            setSystemAudioState('unavailable');
          }
          return;
        }

        const monitors = await api.systemAudio.listMonitors();

        if (cancelled) return;

        if (!monitors || monitors.length === 0) {
          setSystemAudioState('unavailable');
          return;
        }

        const device = await findSystemAudioDevice();

        if (!cancelled) {
          setSystemAudioState(device ? 'ready' : 'unavailable');
        }
      } catch (error) {
        console.warn(
          '[system-audio] device detection failed:',
          error
        );

        if (!cancelled) {
          setSystemAudioState('unavailable');
        }
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
    }

    rafRef.current = null;

    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }

    if (mixCtxRef.current) {
      mixCtxRef.current.close().catch(() => {});
      mixCtxRef.current = null;
    }

    analyserRef.current = null;
    setLevel(0);
  }, []);

  const startLevelMeter = useCallback((stream) => {
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();

      analyser.fftSize = 256;

      source.connect(analyser);

      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) {
          return;
        }

        analyser.getByteFrequencyData(data);

        let sum = 0;

        for (let i = 0; i < data.length; i += 1) {
          sum += data[i];
        }

        const average = data.length
          ? sum / data.length
          : 0;

        setLevel(
          Math.min(
            100,
            Math.round((average / 80) * 100)
          )
        );

        rafRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch (error) {
      console.warn(
        '[audio] level meter unavailable:',
        error
      );
    }
  }, []);

  const stop = useCallback(() => {
    if (socket && socketHandlersRef.current) {
      socket.off('transcript', socketHandlersRef.current.transcript);
      socket.off('transcription_interim', socketHandlersRef.current.interim);
      socket.off('transcription_error', socketHandlersRef.current.error);
      socket.emit('transcription:stop');
      socketHandlersRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect?.();
      processorRef.current = null;
    }

    if (recorderRef.current) {
      try {
        if (
          recorderRef.current.state === 'recording'
        ) {
          recorderRef.current.stop();
        }
      } catch (_) {}

      recorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      streamRef.current = null;
    }

    if (systemStreamRef.current) {
      systemStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      systemStreamRef.current = null;
    }

    stopLevelMeter();

    setListening(false);

    setSystemAudioState((current) =>
      current === 'capturing'
        ? 'ready'
        : current
    );
  }, [stopLevelMeter]);

  const start = useCallback(async () => {
    stop();

    let micStream;

    /*
     * ---------------------------------------------------------
     * 1. Capture physical microphone
     * ---------------------------------------------------------
     */

    try {
      micStream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
    } catch (error) {
      onError?.(
        error.message ||
          'Microphone access denied'
      );

      throw error;
    }

    streamRef.current = micStream;

    /*
     * ---------------------------------------------------------
     * 2. Find Hinter's PipeWire system-audio device
     * ---------------------------------------------------------
     */

    let combinedStream = micStream;

    try {
      const systemDevice =
        await findSystemAudioDevice();

      if (!systemDevice) {
        console.warn(
          '[system-audio] Hinter-System-Audio device not found'
        );

        setSystemAudioState('unavailable');

        startLevelMeter(micStream);
      } else {
        console.info(
          '[system-audio] Using device:',
          systemDevice.label,
          systemDevice.deviceId
        );

        setSystemAudioState('capturing');

        /*
         * -----------------------------------------------------
         * 3. Capture the PipeWire virtual system-audio source
         * -----------------------------------------------------
         */

        const systemStream =
          await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: {
                exact: systemDevice.deviceId,
              },
              channelCount: 2,
              sampleRate: 48000,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            video: false,
          });

        if (
          !systemStream.getAudioTracks().length
        ) {
          throw new Error(
            'Hinter-System-Audio returned no audio track'
          );
        }

        systemStreamRef.current =
          systemStream;

        /*
         * -----------------------------------------------------
         * 4. Mix microphone + system audio
         * -----------------------------------------------------
         */

        const audioCtx =
          new AudioContext();

        mixCtxRef.current = audioCtx;

        const micSource =
          audioCtx.createMediaStreamSource(
            micStream
          );

        const systemSource =
          audioCtx.createMediaStreamSource(
            systemStream
          );

        const destination =
          audioCtx.createMediaStreamDestination();

        micSource.connect(destination);
        systemSource.connect(destination);

        combinedStream =
          destination.stream;

        startLevelMeter(
          combinedStream
        );

        console.info(
          '[system-audio] Microphone + system audio mixed successfully'
        );
      }
    } catch (error) {
      console.warn(
        '[system-audio] Capture failed; falling back to microphone:',
        error
      );

      setSystemAudioState('error');

      if (systemStreamRef.current) {
        systemStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());

        systemStreamRef.current = null;
      }

      startLevelMeter(micStream);
    }

    if (socket) {
      const handleTranscript = (payload) => onTranscript?.(payload?.text || '');
      const handleInterim = () => {};
      const handleError = (payload) => onError?.(payload?.message || 'Live transcription error');
      socketHandlersRef.current = {
        transcript: handleTranscript,
        interim: handleInterim,
        error: handleError,
      };
      socket.on('transcript', handleTranscript);
      socket.on('transcription_interim', handleInterim);
      socket.on('transcription_error', handleError);
      socket.emit('transcription:start');

      const pcmCtx = mixCtxRef.current || new AudioContext();
      if (!mixCtxRef.current) {
        mixCtxRef.current = pcmCtx;
      }
      const audioSource = pcmCtx.createMediaStreamSource(combinedStream);
      const processor = pcmCtx.createScriptProcessor?.(4096, 1, 1);
      if (!processor) {
        stop();
        throw new Error('PCM audio processing is unavailable in this Electron environment');
      }
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const pcm = floatToPcm16(input, pcmCtx.sampleRate || 48000);
        socket.emit('transcription:audio', pcm);
      };
      audioSource.connect(processor);
      processor.connect(pcmCtx.destination);
      processorRef.current = processor;
    } else if (typeof MediaRecorder !== 'undefined') {
      // Keep isolated hook consumers from failing before Socket.IO is ready.
      recorderRef.current = new MediaRecorder(combinedStream);
      recorderRef.current.start();
    }

    setListening(true);
  }, [
    stop,
    startLevelMeter,
    onError,
    onTranscript,
    socket,
  ]);

  return {
    listening,
    level,
    start,
    stop,
    systemAudioState,
  };
}