import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import { useWhisper } from '../hooks/useWhisper';

const mockMediaStream = {
  getTracks: () => [{ stop: vi.fn() }],
  getAudioTracks: () => [{ stop: vi.fn() }],
};

const mockSystemAudioStream = {
  getTracks: () => [{ stop: vi.fn() }],
  getAudioTracks: () => [{ stop: vi.fn() }],
};

const mockAudioContext = {
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
  })),
  createAnalyser: vi.fn(() => ({
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
  })),
  createMediaStreamDestination: vi.fn(() => ({
    stream: mockMediaStream,
  })),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockMediaRecorder = {
  state: 'inactive',
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null,
};

function installElectronSystemAudio() {
  window.hinter = {
    systemAudio: {
      listMonitors: vi
        .fn()
        .mockResolvedValue(['alsa_output.test.monitor']),
      startCapture: vi.fn().mockResolvedValue({
        sourceName: 'alsa_output.test.monitor',
      }),
    },
  };

  navigator.mediaDevices.enumerateDevices = vi.fn().mockResolvedValue([
    {
      kind: 'audioinput',
      label: 'Built-in Audio Analog Stereo',
      deviceId: 'mic-device-id',
      groupId: 'mic-group-id',
    },
    {
      kind: 'audioinput',
      label: 'Hinter-System-Audio',
      deviceId: 'system-audio-device-id',
      groupId: 'system-audio-group-id',
    },
  ]);
}

describe('useWhisper', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    };

    delete window.hinter;

    global.AudioContext = vi.fn(() => mockAudioContext);

    global.MediaRecorder = vi.fn(() => mockMediaRecorder);

    global.MediaRecorder.isTypeSupported = vi.fn(() => true);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'test transcript' }),
    });

    global.requestAnimationFrame = vi.fn(() => 1);
    global.cancelAnimationFrame = vi.fn();

    global.setInterval = vi.fn(() => 1);
    global.clearInterval = vi.fn();
  });

  it('initializes with listening=false', () => {
    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError: vi.fn(),
      })
    );

    expect(result.current.listening).toBe(false);
    expect(result.current.level).toBe(0);
  });

  it('start sets listening to true', async () => {
    const onTranscript = vi.fn();

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript,
        onError: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.listening).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('stop sets listening to false', async () => {
    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.listening).toBe(false);
  });

  it('calls onError when getUserMedia fails', async () => {
    const onError = vi.fn();

    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(
      new Error('Permission denied')
    );

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError,
      })
    );

    await act(async () => {
      try {
        await result.current.start();
      } catch (error) {
        // Expected.
      }
    });

    expect(onError).toHaveBeenCalledWith('Permission denied');
  });

  it('captures Hinter-System-Audio and mixes it with the microphone', async () => {
    installElectronSystemAudio();

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
  audio: {
    deviceId: {
      exact: 'system-audio-device-id',
    },
    channelCount: 2,
    sampleRate: 48000,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  video: false,
});

    expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();

    expect(
      mockAudioContext.createMediaStreamDestination
    ).toHaveBeenCalled();

    expect(result.current.listening).toBe(true);
  });

  it('falls back to microphone-only capture when system audio fails', async () => {
    installElectronSystemAudio();

    navigator.mediaDevices.getUserMedia
      .mockResolvedValueOnce(mockMediaStream)
      .mockRejectedValueOnce(new Error('system audio unavailable'));

    const onError = vi.fn();

    const { result } = renderHook(() =>
      useWhisper({
        onTranscript: vi.fn(),
        onError,
      })
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.listening).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(mockMediaRecorder.start).toHaveBeenCalled();
  });
});