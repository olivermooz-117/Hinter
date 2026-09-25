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

  it('renders the overlay with title', () => {
    render(<App />);
    expect(screen.getByText('Hinter')).toBeInTheDocument();
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

  it('displays transcripts when available', () => {
    render(<App />);
    expect(screen.getByText('Live transcript')).toBeInTheDocument();
  });

  it('displays suggestions when available', () => {
    render(<App />);
    expect(screen.getByText('AI suggestion')).toBeInTheDocument();
  });

  it('shows share tab audio checkbox when not listening', () => {
    render(<App />);
    expect(
      screen.getByText(/Share tab\/screen audio/i)
    ).toBeInTheDocument();
  });
});