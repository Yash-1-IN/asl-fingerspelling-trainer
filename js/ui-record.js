// The Record screen: pick a letter, count down, capture frames, save them.

import { startCamera } from './camera.js';
import { startTracking } from './landmarks.js';
import { CLASSES, NO_SIGN, labelOf } from './letters.js';
import { TARGET_SAMPLES, newSessionId, createRecorder } from './capture.js';
import * as storage from './storage.js';

const LOW_SAMPLE_THRESHOLD = 150; // letters below this get a "low" marker
const SESSION_ID = newSessionId();

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

let trackerReady = false;
let selectedLetter = null;
let counts = {};
let handVisible = null;

progressEl.max = TARGET_SAMPLES;

const recorder = createRecorder({
  sessionId: SESSION_ID,
  onCountdown(remaining) {
    overlay.textContent = String(remaining);
    setStatus(`Get ready: ${labelOf(selectedLetter)}. Recording starts in ${remaining}.`);
  },
  onCaptureStart() {
    overlay.textContent = 'Recording';
    setStatus(
      selectedLetter === NO_SIGN
        ? 'Recording “no sign”. Keep your hand in view and keep changing it. Do not sign a letter.'
        : `Recording ${selectedLetter}. Hold the shape and slowly vary angle and distance.`
    );
  },
  onProgress: showProgress,
  onFinish: finishRecording,
});

function setStatus(text) {
  statusEl.textContent = text;
}

function updateControls() {
  const busy = recorder.state !== 'idle';
  startBtn.disabled = busy || !trackerReady || !selectedLetter;
  cancelBtn.hidden = !busy;
  deleteLetterBtn.disabled = busy || !selectedLetter || !counts[selectedLetter];
  for (const btn of gridEl.children) btn.disabled = busy;
}

function renderGrid() {
  gridEl.replaceChildren();
  for (const letter of CLASSES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = letter === NO_SIGN ? 'letter-btn no-sign' : 'letter-btn';
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
    btn.setAttribute('aria-label', `${labelOf(letter)}, ${count} samples${low ? ', needs more' : ''}`);
    btn.replaceChildren();
    const big = document.createElement('span');
    big.className = 'letter';
    big.textContent = labelOf(letter);
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
  $('record-hint').textContent = letter === NO_SIGN
    ? 'No sign: keep a hand in view but do NOT sign a letter. Relax it, wave, wiggle your fingers, turn it around, move between letters, make half-formed shapes. Keep changing, and record several times.'
    : 'Hold the handshape, then slowly turn your hand, and move it closer and farther. Variety makes a better model.';
  setStatus(`Selected ${labelOf(letter)}. Press “Start recording” when your hand is ready.`);
}

function showProgress(count = 0) {
  progressEl.value = count;
  progressTextEl.textContent = `${count} / ${TARGET_SAMPLES} frames`;
}

function startRecording() {
  showProgress(0);
  recorder.start(selectedLetter);
  updateControls();
}

function cancelRecording() {
  recorder.cancel();
  overlay.textContent = '';
  showProgress(0);
  setStatus('Recording cancelled. Nothing was saved.');
  updateControls();
}

async function finishRecording(frames, letter) {
  overlay.textContent = '';
  updateControls();

  if (frames.length === 0) {
    setStatus('No hand was seen, so nothing was saved. Check the lighting and try again.');
    return;
  }
  await storage.addSamples(frames);
  await refresh();
  const short = frames.length < TARGET_SAMPLES * 0.5;
  setStatus(
    `Saved ${frames.length} samples for ${labelOf(letter)}.` +
    (short ? ' That is fewer than expected because the hand kept dropping out. Consider re-recording.' : '')
  );
}

function onFrame(frame) {
  const visible = frame !== null;
  if (visible !== handVisible) {
    handVisible = visible;
    handStatusEl.textContent = visible ? 'Hand: detected' : 'Hand: not in view';
  }
  recorder.handleFrame(frame);
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
  if (!confirm(`Delete all ${n} samples for ${labelOf(selectedLetter)}? This cannot be undone.`)) return;
  await storage.deleteLetter(selectedLetter);
  setStatus(`Deleted samples for ${labelOf(selectedLetter)}.`);
  await refresh();
});

$('export-btn').addEventListener('click', async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`asl-dataset-${stamp}.json`, await storage.exportJson());
  setStatus('Exported. Check your Downloads folder.');
});

$('import-input').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  if (files.length === 0) return;

  let added = 0;
  let skipped = 0;
  const failed = [];
  for (const [i, file] of files.entries()) {
    setStatus(`Importing file ${i + 1} of ${files.length}: ${file.name}…`);
    try {
      const result = await storage.importJson(await file.text());
      added += result.added;
      skipped += result.skipped;
    } catch (error) {
      failed.push(`${file.name} (${error.message})`);
    }
  }

  await refresh();
  setStatus(
    `Imported ${added} samples from ${files.length - failed.length} of ${files.length} files ` +
    `(${skipped} skipped as duplicates or invalid).` +
    (failed.length ? ` Could not read: ${failed.join('; ')}. Choose JSON files exported from this app.` : '')
  );
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
