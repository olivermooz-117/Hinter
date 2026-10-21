import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import { useWhisper } from './useWhisper';

function makeStream(label = 'mic') {
  const track = {
    stop: vi.fn(),
    kind: 'audio',
    label,
    onended: null,
  };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    removeTrack: vi.fn(),
  };
}

describe('useWhisper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const micStream = makeStream('mic');
    const displayStream = makeStream('display');

    global.AudioContext = vi.fn(() => {
      const destination = { stream: makeStream('mixed') };
      return {
        sampleRate: 48000,
        createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
        createMediaStreamDestination: vi.fn(() => destination),
        createAnalyser: vi.fn(() => ({
          fftSize: 256,
          frequencyBinCount: 128,
          getByteFrequencyData: vi.fn(),
        })),
        createScriptProcessor: vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
          onaudioprocess: null,
        })),
        destination: {},
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

    global.requestAnimationFrame = vi.fn(() => 1);
    global.cancelAnimationFrame = vi.fn();

    navigator.mediaDevices = {
      getUserMedia: vi.fn(async () => micStream),
      getDisplayMedia: vi.fn(async () => displayStream),
      enumerateDevices: vi.fn(async () => [
        { kind: 'audioinput', label: 'Default', deviceId: 'mic-1' },
      ]),
    };

    delete window.hinter;
  });

  it('initializes idle', () => {
    const { result } = renderHook(() =>
      useWhisper({ onTranscript: vi.fn(), onError: vi.fn() })
    );
    expect(result.current.listening).toBe(false);
    expect(result.current.level).toBe(0);
  });

  it('starts mic-only streaming when socket is provided', async () => {
    const handlers = {};
    const socket = {
      on: vi.fn((event, cb) => {
        handlers[event] = cb;
      }),
      off: vi.fn(),
      emit: vi.fn(),
    };

    const onTranscript = vi.fn();
    const onInterim = vi.fn();

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript,
        onInterim,
        onError: vi.fn(),
        socket,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.listening).toBe(true);
    expect(result.current.audioSource).toBe('mic');
    expect(socket.emit).toHaveBeenCalledWith('transcription:start');
    expect(socket.on).toHaveBeenCalledWith(
      'transcription:interim',
      expect.any(Function)
    );
    expect(socket.on).toHaveBeenCalledWith(
      'transcription:final',
      expect.any(Function)
    );

    act(() => {
      handlers['transcription:interim']?.({ text: 'hello' });
      handlers['transcription:final']?.({ text: 'hello world' });
    });

    expect(onInterim).toHaveBeenCalledWith('hello');
    expect(onTranscript).toHaveBeenCalledWith('hello world');
  });

  it('mixes display audio when shareDisplayAudio is true', async () => {
    const socket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError: vi.fn(),
        socket,
      })
    );

    await act(async () => {
      await result.current.start({ shareDisplayAudio: true });
    });

    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
    expect(result.current.listening).toBe(true);
    expect(result.current.audioSource).toBe('mic+display');
    expect(result.current.systemAudioState).toBe('display');
  });

  it('uses Electron system audio when hinter API provides monitors', async () => {
    const systemStream = makeStream('system');
    window.hinter = {
      systemAudio: {
        listMonitors: vi.fn(async () => ['alsa_output.pci.monitor']),
        startCapture: vi.fn(async () => ({
          sourceName: 'alsa_output.pci.monitor',
        })),
      },
    };

    navigator.mediaDevices.enumerateDevices = vi.fn(async () => [
      { kind: 'audioinput', label: 'Default', deviceId: 'mic-1' },
      {
        kind: 'audioinput',
        label: 'Hinter-System-Audio',
        deviceId: 'sys-1',
      },
    ]);

    navigator.mediaDevices.getUserMedia = vi.fn(async (constraints) => {
      const id = constraints?.audio?.deviceId?.exact;
      if (id === 'sys-1') return systemStream;
      return makeStream('mic');
    });

    const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError: vi.fn(),
        socket,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(window.hinter.systemAudio.listMonitors).toHaveBeenCalled();
    expect(window.hinter.systemAudio.startCapture).toHaveBeenCalled();
    expect(result.current.audioSource).toBe('mic+system');
    expect(result.current.systemAudioState).toBe('active');
  });

  it('stop emits transcription:stop and clears listening', async () => {
    const socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError: vi.fn(),
        socket,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.listening).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('transcription:stop');
  });
});
