// The Record screen: pick a letter, count down, capture frames, save them.

import { startCamera } from './camera.js';
import { startTracking } from './landmarks.js';
import { LETTERS } from './letters.js';
import * as storage from './storage.js';

// Easy-to-tune recording settings.
const TARGET_SAMPLES = 100;        // frames to capture per recording
const CAPTURE_INTERVAL_MS = 100;   // one frame every 0.1 s, so ~10 s in total
const MAX_CAPTURE_MS = 20000;      // give up if the hand keeps disappearing
const COUNTDOWN_SECONDS = 3;
const LOW_SAMPLE_THRESHOLD = 150;  // letters below this get a "low" marker

// One id per page load. Phase 6 uses it to hold out whole sessions.
const SESSION_ID = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;

const $ = (id) => document.getElementById(id);
const video = $('camera-feed');
const canvas = $('landmarks-overlay');
const overlay = $('overlay-message');
const statusEl = $('status');
const handStatusEl = $('hand-status');
const progressEl = $('progress');
const progressTextEl = $('progress-text');
const gridEl = $('letter-grid');
const startBtn = $('start-btn');
const cancelBtn = $('cancel-btn');
const deleteLetterBtn = $('delete-letter-btn');
const totalEl = $('total-count');
const sessionListEl = $('session-list');

let state = 'idle'; // idle | countdown | capturing
let trackerReady = false;
let selectedLetter = null;
let counts = {};
let captured = [];
let captureStartedAt = 0;
let lastCaptureAt = 0;
let countdownTimer = null;
let handVisible = null;

progressEl.max = TARGET_SAMPLES;

function setStatus(text) {
  statusEl.textContent = text;
}

function updateControls() {
  const busy = state !== 'idle';
  startBtn.disabled = busy || !trackerReady || !selectedLetter;
  cancelBtn.hidden = !busy;
  deleteLetterBtn.disabled = busy || !selectedLetter || !counts[selectedLetter];
  for (const btn of gridEl.children) btn.disabled = busy;
}

function renderGrid() {
  gridEl.replaceChildren();
  for (const letter of LETTERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'letter-btn';
    btn.dataset.letter = letter;
    btn.addEventListener('click', () => selectLetter(letter));
    gridEl.append(btn);
  }
}

function paintGrid() {
  for (const btn of gridEl.children) {
    const letter = btn.dataset.letter;
    const count = counts[letter] || 0;
    const low = count < LOW_SAMPLE_THRESHOLD;
    btn.classList.toggle('low', low);
    btn.setAttribute('aria-pressed', String(letter === selectedLetter));
    btn.setAttribute('aria-label', `${letter}, ${count} samples${low ? ', needs more' : ''}`);
    btn.replaceChildren();
    const big = document.createElement('span');
    big.className = 'letter';
    big.textContent = letter;
    const small = document.createElement('span');
    small.className = 'count';
    small.textContent = low ? `${count} (low)` : String(count);
    btn.append(big, small);
  }
}

function paintSessions(samples) {
  const bySession = new Map();
  for (const s of samples) bySession.set(s.sessionId, (bySession.get(s.sessionId) || 0) + 1);

  sessionListEl.replaceChildren();
  if (bySession.size === 0) {
    const li = document.createElement('li');
    li.textContent = 'No sessions yet.';
    sessionListEl.append(li);
    return;
  }
  for (const [id, count] of bySession) {
    const li = document.createElement('li');
    li.append(`${id}${id === SESSION_ID ? ' (this session)' : ''}: ${count} samples `);
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete session';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete all ${count} samples from session ${id}? This cannot be undone.`)) return;
      await storage.deleteSession(id);
      setStatus(`Deleted session ${id}.`);
      await refresh();
    });
    li.append(del);
    sessionListEl.append(li);
  }
}

async function refresh() {
  const samples = await storage.getAllSamples();
  counts = {};
  for (const s of samples) counts[s.letter] = (counts[s.letter] || 0) + 1;
  totalEl.textContent = String(samples.length);
  paintGrid();
  paintSessions(samples);
  updateControls();
}

function selectLetter(letter) {
  selectedLetter = letter;
  paintGrid();
  updateControls();
  setStatus(`Selected ${letter}. Press "Start recording" when your hand is ready.`);
}

function showProgress() {
  progressEl.value = captured.length;
  progressTextEl.textContent = `${captured.length} / ${TARGET_SAMPLES} frames`;
}

function startRecording() {
  state = 'countdown';
  captured = [];
  showProgress();
  updateControls();

  let remaining = COUNTDOWN_SECONDS;
  setStatus(`Get ready to sign ${selectedLetter}. Recording starts in ${remaining}.`);
  overlay.textContent = String(remaining);
  countdownTimer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      overlay.textContent = String(remaining);
      return;
    }
    clearInterval(countdownTimer);
    overlay.textContent = 'Recording';
    state = 'capturing';
    captureStartedAt = performance.now();
    lastCaptureAt = 0;
    setStatus(`Recording ${selectedLetter}. Hold the shape and slowly vary angle and distance.`);
  }, 1000);
}

function cancelRecording() {
  clearInterval(countdownTimer);
  state = 'idle';
  captured = [];
  overlay.textContent = '';
  showProgress();
  setStatus('Recording cancelled. Nothing was saved.');
  updateControls();
}

async function finishRecording() {
  state = 'idle';
  overlay.textContent = '';
  const letter = selectedLetter;
  const frames = captured;
  updateControls();

  if (frames.length === 0) {
    setStatus('No hand was seen, so nothing was saved. Check the lighting and try again.');
    return;
  }
  await storage.addSamples(frames);
  await refresh();
  const short = frames.length < TARGET_SAMPLES * 0.5;
  setStatus(
    `Saved ${frames.length} samples for ${letter}.` +
    (short ? ' That is fewer than expected because the hand kept dropping out. Consider re-recording.' : '')
  );
}

function onFrame(frame) {
  const visible = frame !== null;
  if (visible !== handVisible) {
    handVisible = visible;
    handStatusEl.textContent = visible ? '✓ Hand detected' : '✗ No hand in view';
  }

  if (state !== 'capturing') return;

  const now = performance.now();
  if (frame && now - lastCaptureAt >= CAPTURE_INTERVAL_MS) {
    lastCaptureAt = now;
    captured.push({
      letter: selectedLetter,
      features: frame.features,
      sessionId: SESSION_ID,
      timestamp: Date.now(),
      handedness: frame.handedness,
    });
    showProgress();
  }

  if (captured.length >= TARGET_SAMPLES || now - captureStartedAt > MAX_CAPTURE_MS) {
    finishRecording();
  }
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

startBtn.addEventListener('click', startRecording);
cancelBtn.addEventListener('click', cancelRecording);

deleteLetterBtn.addEventListener('click', async () => {
  const n = counts[selectedLetter] || 0;
  if (!confirm(`Delete all ${n} samples for ${selectedLetter}? This cannot be undone.`)) return;
  await storage.deleteLetter(selectedLetter);
  setStatus(`Deleted samples for ${selectedLetter}.`);
  await refresh();
});

$('export-btn').addEventListener('click', async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`asl-dataset-${stamp}.json`, await storage.exportJson());
  setStatus('Exported. Check your Downloads folder.');
});

$('import-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const { added, skipped } = await storage.importJson(await file.text());
    setStatus(`Imported ${added} samples (${skipped} skipped as duplicates or invalid).`);
    await refresh();
  } catch (error) {
    setStatus(`Import failed: ${error.message}`);
  }
});

async function init() {
  renderGrid();
  try {
    await navigator.storage?.persist?.();
  } catch { /* not critical */ }
  await refresh();

  try {
    await startCamera(video);
    setStatus('Camera on. Loading hand tracking…');
    await startTracking(video, canvas, onFrame);
    trackerReady = true;
    setStatus('Ready. Pick a letter to begin.');
    updateControls();
  } catch (error) {
    setStatus(`Could not start: ${error.name}: ${error.message}`);
    console.error(error);
  }
}

init();
