const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const listenBtn = document.getElementById('listen-btn');
const levelBar = document.getElementById('level-bar');

let mediaStream = null;
let audioContext = null;
let analyser = null;
let rafId = null;
let isListening = false;
let mediaRecorder = null;
let chunkTimer = null;

const CHUNK_MS = 4000; // send ~4s chunks to Whisper
let transcriptLines = [];

// --- Bridge check ---

async function checkBridge() {
  try {
    const reply = await window.hinter.ping();
    if (reply === 'pong from main process') {
      const hasKey = await window.hinter.hasApiKey();
      statusEl.textContent = hasKey ? 'ready' : 'ready (no API key)';
      statusEl.style.color = hasKey ? '#7ddea0' : '#e6c07b';
      if (!hasKey) {
        transcriptEl.innerHTML =
          '<span class="hint">Add OPENAI_API_KEY to a .env file in the project root, then restart. Capture still works without it.</span>';
      }
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

// --- Transcript UI ---

function appendTranscript(text) {
  const cleaned = (text || '').trim();
  if (!cleaned) return;
  transcriptLines.push(cleaned);
  // Keep last ~40 lines so the panel stays readable
  if (transcriptLines.length > 40) transcriptLines = transcriptLines.slice(-40);
  transcriptEl.innerHTML = transcriptLines
    .map((line) => `<div class="line">${escapeHtml(line)}</div>`)
    .join('');
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Chunked recording → Whisper ---

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function startChunkedRecording(stream) {
  const mimeType = pickMimeType();
  const options = mimeType ? { mimeType } : undefined;
  mediaRecorder = new MediaRecorder(stream, options);

  mediaRecorder.ondataavailable = async (event) => {
    if (!event.data || event.data.size < 1000) return; // skip tiny/empty chunks
    try {
      statusEl.textContent = 'transcribing…';
      statusEl.style.color = '#9d9dff';
      const buffer = await event.data.arrayBuffer();
      const text = await window.hinter.transcribe(buffer, event.data.type || mimeType);
      appendTranscript(text);
      if (isListening) {
        statusEl.textContent = 'listening';
        statusEl.style.color = '#7ddea0';
      }
    } catch (err) {
      console.error('Transcribe error:', err);
      statusEl.textContent = 'STT error';
      statusEl.style.color = '#ff8a8a';
      // Don't stop listening — next chunk may succeed
    }
  };

  mediaRecorder.start(); // collect into one blob until we call stop()

  // Every CHUNK_MS: stop → fires ondataavailable → restart
  chunkTimer = setInterval(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      mediaRecorder.start();
    }
  }, CHUNK_MS);
}

function stopChunkedRecording() {
  if (chunkTimer) {
    clearInterval(chunkTimer);
    chunkTimer = null;
  }
  if (mediaRecorder) {
    try {
      if (mediaRecorder.state === 'recording') mediaRecorder.stop();
    } catch (_) {}
    mediaRecorder = null;
  }
}

// --- Capture ---

async function startCapture() {
  let stream = null;
  let mode = 'mic';

  try {
    const sources = await window.hinter.getDesktopSources();
    if (sources && sources.length > 0) {
      const sourceId = sources[0].id;
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
      stream.getVideoTracks().forEach((t) => t.stop());
      mode = 'system';
    }
  } catch (err) {
    console.warn('System audio unavailable, falling back to mic:', err.message);
    stream = null;
  }

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
  startChunkedRecording(stream);

  statusEl.textContent = mode === 'system' ? 'listening (system)' : 'listening (mic)';
  statusEl.style.color = '#7ddea0';
  if (transcriptLines.length === 0) {
    transcriptEl.innerHTML =
      '<span class="hint">Listening… speech will appear here every few seconds.</span>';
  }

  return mode;
}

function stopCapture() {
  stopChunkedRecording();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  stopLevelMeter();
  statusEl.textContent = 'ready';
  statusEl.style.color = '#7ddea0';
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
    transcriptEl.innerHTML = `<span class="hint">Could not access audio: ${escapeHtml(err.message)}</span>`;
    listenBtn.textContent = 'Start listening';
  } finally {
    listenBtn.disabled = false;
  }
});

checkBridge();