const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const suggestionsEl = document.getElementById('suggestions');
const listenBtn = document.getElementById('listen-btn');
const levelBar = document.getElementById('level-bar');

const BACKEND = 'http://127.0.0.1:5000';
const CHUNK_MS = 4000;

let mediaStream = null;
let audioContext = null;
let analyser = null;
let rafId = null;
let isListening = false;
let mediaRecorder = null;
let chunkTimer = null;
let transcriptLines = [];
let socket = null;
let backendOk = false;

// --- Backend / Socket.IO ---

function connectBackend() {
  fetch(`${BACKEND}/api/health`)
    .then((r) => r.json())
    .then((data) => {
      backendOk = !!data.ok;
      statusEl.textContent = backendOk
        ? data.openai_key
          ? 'ready'
          : 'ready (backend, no API key)'
        : 'backend error';
      statusEl.style.color = backendOk ? (data.openai_key ? '#7ddea0' : '#e6c07b') : '#ff8a8a';
    })
    .catch(() => {
      backendOk = false;
      statusEl.textContent = 'backend offline';
      statusEl.style.color = '#ff8a8a';
      transcriptEl.innerHTML =
        '<span class="hint">Start the backend: <code>cd backend && python app.py</code></span>';
    });

  if (typeof io === 'undefined') {
    console.warn('socket.io client not loaded');
    return;
  }

  socket = io(BACKEND, { transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    console.log('socket connected');
    socket.emit('start_session');
  });
  socket.on('transcript', (payload) => {
    if (payload && payload.text) appendTranscript(payload.text);
  });
  socket.on('suggestion', (payload) => {
    if (payload && payload.text) {
      suggestionsEl.textContent = payload.text;
    }
  });
  socket.on('error', (payload) => {
    console.error('backend error', payload);
    statusEl.textContent = 'STT/LLM error';
    statusEl.style.color = '#ff8a8a';
  });
  socket.on('disconnect', () => {
    statusEl.textContent = 'backend offline';
    statusEl.style.color = '#ff8a8a';
  });
}

// --- Level meter ---

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
    const pct = Math.min(100, Math.round((sum / data.length / 80) * 100));
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

// --- Send chunk to Flask (server-side Whisper) ---

async function sendChunkToBackend(blob) {
  const form = new FormData();
  form.append('file', blob, 'chunk.webm');

  statusEl.textContent = 'transcribing…';
  statusEl.style.color = '#9d9dff';

  const res = await fetch(`${BACKEND}/api/transcribe`, {
    method: 'POST',
    body: form,
  });

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`Backend HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  if (data.text) appendTranscript(data.text);

  if (isListening) {
    statusEl.textContent = 'listening';
    statusEl.style.color = '#7ddea0';
  }
}

function pickMimeType() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function startChunkedRecording(stream) {
  const mimeType = pickMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  mediaRecorder.ondataavailable = async (event) => {
    if (!event.data || event.data.size < 1000) return;
    try {
      await sendChunkToBackend(event.data);
    } catch (err) {
      console.error('Transcribe error:', err);
      statusEl.textContent = 'STT error';
      statusEl.style.color = '#ff8a8a';
      transcriptEl.innerHTML =
        `<span class="hint">STT: ${escapeHtml(err.message || String(err))}</span>`;
    }
  };

  mediaRecorder.start();
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

// --- Capture (mic first for reliability; system audio later) ---

async function startCapture() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  mediaStream = stream;
  startLevelMeter(stream);
  startChunkedRecording(stream);

  statusEl.textContent = 'listening (mic)';
  statusEl.style.color = '#7ddea0';
  if (transcriptLines.length === 0) {
    transcriptEl.innerHTML =
      '<span class="hint">Listening… transcript appears every few seconds.</span>';
  }
}

function stopCapture() {
  stopChunkedRecording();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  stopLevelMeter();
  if (socket) socket.emit('end_session');
  statusEl.textContent = backendOk ? 'ready' : 'backend offline';
  statusEl.style.color = backendOk ? '#7ddea0' : '#ff8a8a';
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

  if (!backendOk) {
    transcriptEl.innerHTML =
      '<span class="hint">Backend offline. Run: <code>cd backend && python app.py</code></span>';
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
    transcriptEl.innerHTML = `<span class="hint">Could not access mic: ${escapeHtml(err.message)}</span>`;
    listenBtn.textContent = 'Start listening';
  } finally {
    listenBtn.disabled = false;
  }
});

// Boot
window.hinter.ping().then(() => connectBackend()).catch(() => connectBackend());