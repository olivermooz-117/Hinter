import { useCallback, useEffect, useRef, useState } from "react";

const SYSTEM_AUDIO_LABEL = "Hinter-System-Audio";
const TARGET_SAMPLE_RATE = 16000;

function getHinterAPI() {
  if (typeof window !== "undefined" && window.hinter) {
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
    (device) => device.kind === "audioinput"
  );

  return (
    audioInputs.find(
      (device) =>
        device.label === SYSTEM_AUDIO_LABEL ||
        device.label.toLowerCase().includes("hinter-system-audio")
    ) || null
  );
}

/**
 * Resample Float32 audio to 16 kHz and convert it to signed 16-bit PCM.
 */
function floatToPcm16(input, sourceRate) {
  if (!input || input.length === 0) {
    return new ArrayBuffer(0);
  }

  if (!sourceRate || sourceRate <= 0) {
    sourceRate = 48000;
  }

  if (sourceRate === TARGET_SAMPLE_RATE) {
    const output = new ArrayBuffer(input.length * 2);
    const view = new DataView(output);

    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i] || 0));

      view.setInt16(
        i * 2,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
    }

    return output;
  }

  const ratio = sourceRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(
    1,
    Math.floor(input.length / ratio)
  );

  const output = new ArrayBuffer(outputLength * 2);
  const view = new DataView(output);

  for (let i = 0; i < outputLength; i += 1) {
    const sourcePosition = i * ratio;

    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(
      leftIndex + 1,
      input.length - 1
    );

    const fraction = sourcePosition - leftIndex;

    const leftSample = input[leftIndex] || 0;
    const rightSample = input[rightIndex] || 0;

    const interpolated =
      leftSample +
      (rightSample - leftSample) * fraction;

    const sample = Math.max(
      -1,
      Math.min(1, interpolated)
    );

    view.setInt16(
      i * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    );
  }

  return output;
}

export function useWhisper({
  onTranscript,
  onError,
  socket,
}) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [systemAudioState, setSystemAudioState] =
    useState("idle");

  const streamRef = useRef(null);
  const systemStreamRef = useRef(null);

  const mixCtxRef = useRef(null);
  const ctxRef = useRef(null);

  const analyserRef = useRef(null);
  const rafRef = useRef(null);

  const recorderRef = useRef(null);
  const processorRef = useRef(null);

  const socketHandlersRef = useRef(null);

  /**
   * Check whether the Electron/PipeWire system-audio
   * source is available.
   */
  useEffect(() => {
    let cancelled = false;

    async function checkSystemAudio() {
      try {
        const api = getHinterAPI();

        if (!api?.systemAudio?.listMonitors) {
          if (!cancelled) {
            setSystemAudioState("unavailable");
          }

          return;
        }

        const monitors =
          await api.systemAudio.listMonitors();

        if (cancelled) {
          return;
        }

        if (!monitors || monitors.length === 0) {
          setSystemAudioState("unavailable");
          return;
        }

        const device =
          await findSystemAudioDevice();

        if (!cancelled) {
          setSystemAudioState(
            device ? "ready" : "unavailable"
          );
        }
      } catch (error) {
        console.warn(
          "[system-audio] device detection failed:",
          error
        );

        if (!cancelled) {
          setSystemAudioState("unavailable");
        }
      }
    }

    checkSystemAudio();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Stop the audio level meter.
   */
  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current = null;
    }

    setLevel(0);
  }, []);

  /**
   * Start the audio level meter.
   */
  const startLevelMeter = useCallback((stream) => {
    try {
      if (
        typeof AudioContext === "undefined" ||
        !stream
      ) {
        return;
      }

      const ctx = new AudioContext();

      ctxRef.current = ctx;

      const source =
        ctx.createMediaStreamSource(stream);

      const analyser =
        ctx.createAnalyser();

      analyser.fftSize = 256;

      source.connect(analyser);

      analyserRef.current = analyser;

      const data =
        new Uint8Array(
          analyser.frequencyBinCount
        );

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

        rafRef.current =
          requestAnimationFrame(tick);
      };

      tick();
    } catch (error) {
      console.warn(
        "[audio] level meter unavailable:",
        error
      );
    }
  }, []);

  /**
   * Stop everything.
   */
  const stop = useCallback(() => {
    const handlers =
      socketHandlersRef.current;

    if (socket && handlers) {
      try {
        if (
          typeof socket.off === "function"
        ) {
          socket.off(
            "transcript",
            handlers.transcript
          );

          socket.off(
            "transcription_interim",
            handlers.interim
          );

          socket.off(
            "transcription_error",
            handlers.error
          );
        }

        if (
          typeof socket.emit === "function"
        ) {
          socket.emit("transcription:stop");
        }
      } catch (error) {
        console.warn(
          "[socket] cleanup failed:",
          error
        );
      }

      socketHandlersRef.current = null;
    }

    /**
     * Stop PCM processor.
     */
    if (processorRef.current) {
      try {
        processorRef.current.onaudioprocess =
          null;

        processorRef.current.disconnect?.();
      } catch (_) {}

      processorRef.current = null;
    }

    /**
     * Stop MediaRecorder fallback.
     */
    if (recorderRef.current) {
      try {
        if (
          recorderRef.current.state ===
          "recording"
        ) {
          recorderRef.current.stop();
        }
      } catch (_) {}

      recorderRef.current = null;
    }

    /**
     * Stop microphone tracks.
     */
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => {
          try {
            track.stop();
          } catch (_) {}
        });

      streamRef.current = null;
    }

    /**
     * Stop system-audio tracks.
     */
    if (systemStreamRef.current) {
      systemStreamRef.current
        .getTracks()
        .forEach((track) => {
          try {
            track.stop();
          } catch (_) {}
        });

      systemStreamRef.current = null;
    }

    /**
     * Close mixing AudioContext.
     */
    if (mixCtxRef.current) {
      try {
        mixCtxRef.current.close().catch(() => {});
      } catch (_) {}

      mixCtxRef.current = null;
    }

    stopLevelMeter();

    setListening(false);

    setSystemAudioState((current) =>
      current === "capturing"
        ? "ready"
        : current
    );
  }, [socket, stopLevelMeter]);

  /**
   * Start microphone + optional system audio.
   */
  const start = useCallback(async () => {
    /**
     * Always clean up an existing session first.
     */
    stop();

    let micStream;

    /**
     * ---------------------------------------------------------
     * 1. Capture physical microphone
     * ---------------------------------------------------------
     *
     * IMPORTANT:
     * We do NOT require Socket.IO here.
     *
     * This allows the hook to work independently during
     * testing and while the backend connection is starting.
     */
    try {
      if (
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error(
          "Microphone capture is not supported in this environment."
        );
      }

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
      console.error(
        "[microphone] capture failed:",
        error
      );

      onError?.(
        error?.message ||
          "Microphone access denied"
      );

      throw error;
    }

    streamRef.current = micStream;

    /**
     * ---------------------------------------------------------
     * 2. Find system audio device
     * ---------------------------------------------------------
     */
    let combinedStream = micStream;

    try {
      const systemDevice =
        await findSystemAudioDevice();

      if (!systemDevice) {
        console.warn(
          "[system-audio] Hinter-System-Audio device not found"
        );

        setSystemAudioState(
          "unavailable"
        );

        startLevelMeter(micStream);
      } else {
        console.info(
          "[system-audio] Using device:",
          systemDevice.label,
          systemDevice.deviceId
        );

        setSystemAudioState(
          "capturing"
        );

        /**
         * -----------------------------------------------------
         * 3. Capture system audio
         * -----------------------------------------------------
         */
        const systemStream =
          await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: {
                exact:
                  systemDevice.deviceId,
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
          !systemStream.getAudioTracks()
            .length
        ) {
          throw new Error(
            "Hinter-System-Audio returned no audio track"
          );
        }

        systemStreamRef.current =
          systemStream;

        /**
         * -----------------------------------------------------
         * 4. Mix microphone + system audio
         * -----------------------------------------------------
         */
        if (
          typeof AudioContext ===
          "undefined"
        ) {
          throw new Error(
            "AudioContext is unavailable."
          );
        }

        const audioCtx =
          new AudioContext();

        mixCtxRef.current =
          audioCtx;

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
          "[system-audio] Microphone + system audio mixed successfully"
        );
      }
    } catch (error) {
      console.warn(
        "[system-audio] Capture failed; falling back to microphone:",
        error
      );

      setSystemAudioState("error");

      if (systemStreamRef.current) {
        systemStreamRef.current
          .getTracks()
          .forEach((track) => {
            try {
              track.stop();
            } catch (_) {}
          });

        systemStreamRef.current =
          null;
      }

      startLevelMeter(micStream);
    }

    /**
     * ---------------------------------------------------------
     * 5. Connect to Socket.IO if available
     * ---------------------------------------------------------
     *
     * Socket.IO is optional here so the hook can still be
     * tested and microphone capture can still work when the
     * backend has not connected yet.
     */
    if (
      socket &&
      typeof socket.emit === "function"
    ) {
      /**
       * Final transcript.
       */
      const handleTranscript = (payload) => {
        const text =
          typeof payload === "string"
            ? payload
            : payload?.text || "";

        if (text) {
          onTranscript?.(text);
        }
      };

      /**
       * Interim/live transcript.
       *
       * We pass this through to onTranscript as well so
       * the UI can display the live text.
       */
      const handleInterim = (payload) => {
        const text =
          typeof payload === "string"
            ? payload
            : payload?.text || "";

        if (text) {
          onTranscript?.(text);
        }
      };

      /**
       * Backend transcription error.
       */
      const handleError = (payload) => {
        const message =
          typeof payload === "string"
            ? payload
            : payload?.message ||
              "Live transcription error";

        onError?.(message);
      };

      socketHandlersRef.current = {
        transcript: handleTranscript,
        interim: handleInterim,
        error: handleError,
      };

      if (
        typeof socket.on === "function"
      ) {
        socket.on(
          "transcript",
          handleTranscript
        );

        socket.on(
          "transcription_interim",
          handleInterim
        );

        socket.on(
          "transcription_error",
          handleError
        );
      }

      /**
       * Tell Flask/Gemini to start a new
       * transcription session.
       */
      socket.emit(
        "transcription:start"
      );

      /**
       * -----------------------------------------------------
       * 6. Convert microphone/system audio to PCM
       * -----------------------------------------------------
       */
      let pcmCtx = mixCtxRef.current;

      if (!pcmCtx) {
        if (
          typeof AudioContext ===
          "undefined"
        ) {
          throw new Error(
            "AudioContext is unavailable."
          );
        }

        pcmCtx = new AudioContext();

        mixCtxRef.current =
          pcmCtx;
      }

      const audioSource =
        pcmCtx.createMediaStreamSource(
          combinedStream
        );

      if (
        typeof pcmCtx.createScriptProcessor !==
        "function"
      ) {
        throw new Error(
          "PCM audio processing is unavailable in this Electron environment."
        );
      }

      const processor =
        pcmCtx.createScriptProcessor(
          4096,
          1,
          1
        );

      processor.onaudioprocess = (
        event
      ) => {
        if (
          !socket ||
          typeof socket.emit !==
            "function"
        ) {
          return;
        }

        try {
          const input =
            event.inputBuffer.getChannelData(
              0
            );

          const pcm =
            floatToPcm16(
              input,
              pcmCtx.sampleRate ||
                48000
            );

          if (pcm.byteLength > 0) {
            socket.emit(
              "transcription:audio",
              pcm
            );
          }
        } catch (error) {
          console.warn(
            "[audio] PCM processing failed:",
            error
          );
        }
      };

      audioSource.connect(processor);

      /**
       * Keep the ScriptProcessor alive.
       */
      processor.connect(
        pcmCtx.destination
      );

      processorRef.current =
        processor;

      console.info(
        "[whisper] PCM streaming started"
      );
    } else {
      /**
       * No Socket.IO connection.
       *
       * We intentionally do not throw here.
       * This keeps the hook usable in isolation/tests.
       */
      console.warn(
        "[whisper] Socket.IO connection is not available; audio capture started without backend streaming."
      );

      /**
       * Provide a MediaRecorder fallback if
       * the browser/Electron environment supports it.
       */
      if (
        typeof MediaRecorder !==
        "undefined"
      ) {
        try {
          recorderRef.current =
            new MediaRecorder(
              combinedStream
            );

          recorderRef.current.start();
        } catch (error) {
          console.warn(
            "[whisper] MediaRecorder fallback unavailable:",
            error
          );

          recorderRef.current =
            null;
        }
      }
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