const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const listenBtn = document.getElementById('listen-btn');
const levelBar = document.getElementById('level-bar');

let mediaStream = null;
let audioContext = null;
let analyser = null;
let rafId = null;
let isListening = false;

// --- Bridge check ---

async function checkBridge() {
  try {
    const reply = await window.hinter.ping();
    if (reply === 'pong from main process') {
      statusEl.textContent = 'ready';
      statusEl.style.color = '#7ddea0';
    } else {
      statusEl.textContent = 'unexpected reply';
    }
  } catch (err) {
    statusEl.textContent = 'bridge error';
    statusEl.style.color = '#ff8a8a';
    console.error(err);
  }
}

// --- Audio level meter ---

function startLevelMeter(stream) {
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function tick() {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    // Map 0–128-ish to 0–100%
    const pct = Math.min(100, Math.round((avg / 80) * 100));
    levelBar.style.width = pct + '%';
    rafId = requestAnimationFrame(tick);
  }
  tick();
}

function stopLevelMeter() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
  levelBar.style.width = '0%';
}

// --- Capture ---

/**
 * Try system audio via desktopCapturer first; fall back to mic-only.
 * System audio support varies by OS:
 *   - Windows / macOS: often works with chromeMediaSource: 'desktop'
 *   - Linux: frequently mic-only unless PulseAudio monitor is set up
 */
async function startCapture() {
  let stream = null;
  let mode = 'mic';

  // 1. Attempt system audio (desktop + optional audio track)
  try {
    const sources = await window.hinter.getDesktopSources();
    if (sources && sources.length > 0) {
      const sourceId = sources[0].id; // primary screen
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
          },
        },
      });
      // We only need audio — drop the video track immediately
      stream.getVideoTracks().forEach((t) => t.stop());
      mode = 'system';
    }
  } catch (err) {
    console.warn('System audio unavailable, falling back to mic:', err.message);
    stream = null;
  }

  // 2. Fallback: microphone only
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    mode = 'mic';
  }

  mediaStream = stream;
  startLevelMeter(stream);

  statusEl.textContent = mode === 'system' ? 'listening (system)' : 'listening (mic)';
  statusEl.style.color = '#7ddea0';
  transcriptEl.innerHTML =
    mode === 'system'
      ? '<span class="hint">Capturing system audio. Level meter should move with meeting sound.</span>'
      : '<span class="hint">Capturing microphone. Speak to see the level meter move. System audio was unavailable on this platform.</span>';

  return mode;
}

function stopCapture() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  stopLevelMeter();
  statusEl.textContent = 'ready';
  statusEl.style.color = '#7ddea0';
  transcriptEl.innerHTML =
    '<span class="hint">Listening stopped. Click “Start listening” again when ready.</span>';
}

// --- UI ---

listenBtn.addEventListener('click', async () => {
  if (isListening) {
    stopCapture();
    isListening = false;
    listenBtn.textContent = 'Start listening';
    listenBtn.classList.remove('listening');
    return;
  }

  listenBtn.disabled = true;
  listenBtn.textContent = 'Starting…';
  try {
    await startCapture();
    isListening = true;
    listenBtn.textContent = 'Stop listening';
    listenBtn.classList.add('listening');
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'mic error';
    statusEl.style.color = '#ff8a8a';
    transcriptEl.innerHTML = `<span class="hint">Could not access audio: ${err.message}</span>`;
    listenBtn.textContent = 'Start listening';
  } finally {
    listenBtn.disabled = false;
  }
});

checkBridge();