const statusEl = document.getElementById('status');

async function checkBridge() {
  try {
    const reply = await window.hinter.ping();
    statusEl.textContent = reply === 'pong from main process' ? 'window ready' : 'unexpected reply';
  } catch (err) {
    statusEl.textContent = 'bridge error';
    console.error(err);
  }
}

checkBridge();
