import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import { useBackend } from '../hooks/useBackend';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  })),
}));

global.fetch = vi.fn();

describe('useBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, openai_key: true }),
    });
  });

  it('initializes with connecting status', () => {
    const { result } = renderHook(() => useBackend({ onSuggestion: vi.fn() }));
    expect(result.current.status.label).toBe('connecting…');
    expect(result.current.status.kind).toBe('info');
  });

  it('sets backendOk to true on successful health check', async () => {
    const { result } = renderHook(() => useBackend({ onSuggestion: vi.fn() }));

    await waitFor(() => {
      expect(result.current.backendOk).toBe(true);
    });
  });

  it('sets backendOk to false on health check failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useBackend({ onSuggestion: vi.fn() }));

    await waitFor(() => {
      expect(result.current.backendOk).toBe(false);
    });
  });

  it('exposes connectionState', () => {
    const { result } = renderHook(() => useBackend({ onSuggestion: vi.fn() }));
    expect(result.current.connectionState).toBeDefined();
    expect(['connecting', 'connected', 'disconnected']).toContain(result.current.connectionState);
  });
});