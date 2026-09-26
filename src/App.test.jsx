import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import App from './App';
import { useBackend } from './hooks/useBackend';
import { useWhisper } from './hooks/useWhisper';

vi.mock('./hooks/useBackend');
vi.mock('./hooks/useWhisper');

const mockUseBackend = useBackend;
const mockUseWhisper = useWhisper;

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.hinter;
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0',
      configurable: true,
    });
    mockUseBackend.mockReturnValue({
      status: { label: 'ready', kind: 'ready' },
      setStatus: vi.fn(),
      backendOk: true,
      pushTranscript: vi.fn(),
      endSession: vi.fn(),
      connectionState: 'connected',
      socket: null,
    });
    mockUseWhisper.mockReturnValue({
      listening: false,
      level: 0,
      start: vi.fn(),
      stop: vi.fn(),
      systemAudioState: 'unavailable',
      audioSource: 'mic',
    });
  });

  it('renders marketing homepage with live demo in browser', () => {
    render(<App />);
    expect(
      screen.getByText(/Transparent meeting co-pilot/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
    expect(screen.getAllByText('Live demo').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Listen button when not listening', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
  });

  it('shows Stop button when listening', () => {
    mockUseWhisper.mockReturnValue({
      listening: true,
      level: 50,
      start: vi.fn(),
      stop: vi.fn(),
      systemAudioState: 'unavailable',
      audioSource: 'mic',
    });
    render(<App />);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('shows status as ready when backend is ok', () => {
    render(<App />);
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('shows hint when no transcripts', () => {
    render(<App />);
    expect(
      screen.getByText(/Backend online, then hit Listen/i)
    ).toBeInTheDocument();
  });

  it('shows suggestion hint when no suggestions', () => {
    render(<App />);
    expect(
      screen.getByText('Suggestions will appear here.')
    ).toBeInTheDocument();
  });

  it('calls toggle on button click', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    mockUseWhisper.mockReturnValue({
      listening: false,
      level: 0,
      start,
      stop: vi.fn(),
      systemAudioState: 'unavailable',
      audioSource: 'mic',
    });
    render(<App />);
    const button = screen.getByRole('button', { name: 'Listen' });
    await act(async () => {
      button.click();
    });
    expect(start).toHaveBeenCalled();
  });

  it('displays transcripts section', () => {
    render(<App />);
    expect(screen.getByText('Live transcript')).toBeInTheDocument();
  });

  it('displays suggestions section', () => {
    render(<App />);
    expect(screen.getByText('AI suggestion')).toBeInTheDocument();
  });

  it('shows share tab audio checkbox when not listening', () => {
    render(<App />);
    expect(
      screen.getByText(/Share tab\/screen audio/i)
    ).toBeInTheDocument();
  });

  it('renders overlay-only in Electron', () => {
    window.hinter = { systemAudio: {} };
    render(<App />);
    expect(
      screen.queryByText(/Transparent meeting co-pilot/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeInTheDocument();
  });
});