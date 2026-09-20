// Contribute page: a guided recording of all 25 classes, then a file the
// visitor sends themselves. Nothing is ever uploaded by this page.

import { startCamera } from './camera.js';
import { startTracking } from './landmarks.js';
import { CLASSES, NO_SIGN, labelOf } from './letters.js';
import { TARGET_SAMPLES, newSessionId, createRecorder } from './capture.js';
import * as storage from './storage.js';
import { CONTACT_LABEL, CONTACT_MAILTO } from './config.js';

const MIN_FRAMES = 30; // fewer than this and the step is repeated
const SESSION_ID = newSessionId();

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const overlay = $('overlay-message');
const handStatus = $('hand-status');
const intro = $('intro');
const guide = $('guide');
const done = $('done');
const recordBtn = $('record-btn');
const cancelBtn = $('cancel-btn');
const skipBtn = $('skip-btn');
const finishBtn = $('finish-btn');
const framesEl = $('frames');
const framesText = $('frames-text');

let step = 0;
let trackerReady = false;
const recorded = new Map(); // class -> frames saved
const skipped = [];
let handVisible = null;
let saved = false;

// Leaving after recording but before saving the file would lose the contribution.
window.addEventListener('beforeunload', (event) => {
  if (recorded.size > 0 && !saved) event.preventDefault();
});

framesEl.max = TARGET_SAMPLES;
$('steps').max = CLASSES.length;

const recorder = createRecorder({
  sessionId: SESSION_ID,
  onCountdown(remaining) {
    overlay.textContent = String(remaining);
    setStatus(`Get ready: ${labelOf(CLASSES[step])}. Recording starts in ${remaining}.`);
  },
  onCaptureStart() {
    overlay.textContent = 'Recording';
    setStatus(
      CLASSES[step] === NO_SIGN
        ? 'Recording “no sign”. Keep your hand in view and keep changing it. Do not sign a letter.'
        : `Recording ${CLASSES[step]}. Hold the shape and slowly turn your hand.`
    );
  },
  onProgress: showFrames,
  onFinish: finishStep,
});

function setStatus(text) {
  statusEl.textContent = text;
}

function showFrames(count = 0) {
  framesEl.value = count;
  framesText.textContent = `${count} / ${TARGET_SAMPLES} frames`;
}

function updateControls() {
  const busy = recorder.state !== 'idle';
  recordBtn.disabled = busy || !trackerReady;
  cancelBtn.hidden = !busy;
  skipBtn.disabled = busy;
  finishBtn.hidden = busy || recorded.size === 0;
}

function showStep() {
  const cls = CLASSES[step];
  $('step-count').textContent = `Letter ${step + 1} of ${CLASSES.length}`;
  $('steps').value = step;
  $('step-letter').textContent = cls === NO_SIGN ? 'No sign' : cls;
  $('step-hint').textContent = cls === NO_SIGN
    ? 'Keep a hand in view but do not sign a letter. Relax it, wave, wiggle your fingers, turn it around, move between shapes.'
    : 'Make the letter, hold it, and slowly turn your hand and move it closer and farther. Not sure of this one? Skip it.';
  showFrames(0);
  setStatus(`Ready for ${labelOf(cls)}. Press “Start recording” when your hand is in place.`);
  updateControls();
}

function nextStep() {
  step++;
  if (step >= CLASSES.length) {
    showDone();
  } else {
    showStep();
  }
}

async function finishStep(frames, cls) {
  overlay.textContent = '';
  if (frames.length < MIN_FRAMES) {
    setStatus(`Only ${frames.length} frames were captured because the hand kept dropping out. Try ${labelOf(cls)} again.`);
    showFrames(0);
    updateControls();
    return;
  }
  await storage.addSamples(frames);
  recorded.set(cls, frames.length);
  setStatus(`Saved ${frames.length} frames of ${labelOf(cls)}.`);
  nextStep();
}

async function showDone() {
  guide.hidden = true;
  intro.hidden = true;
  done.hidden = false;
  overlay.textContent = '';
  $('done-title').focus();

  if (recorded.size === 0) {
    $('done-title').textContent = 'Nothing was recorded';
    $('done-summary').textContent = 'No letters were saved, so there is no file to send.';
    $('send-note').textContent = 'Reload this page to try again. If the camera was blocked, allow camera access first.';
    $('done-actions').hidden = true;
    $('done-after').hidden = true;
    setStatus('Nothing was recorded.');
    return;
  }

  const frameTotal = [...recorded.values()].reduce((a, b) => a + b, 0);
  $('done-summary').textContent =
    `You recorded ${recorded.size} of ${CLASSES.length} letters (${frameTotal.toLocaleString()} frames).` +
    (skipped.length ? ` Skipped: ${skipped.map(labelOf).join(', ')}.` : '');

  $('send-note').textContent = CONTACT_LABEL
    ? `Send the file to ${CONTACT_LABEL}.`
    : 'Send the file to the person who shared this link with you.';

  if (CONTACT_MAILTO) {
    const link = $('mail-link');
    const subject = encodeURIComponent('ASL trainer contribution');
    const body = encodeURIComponent('Hi, my recording file is attached.');
    link.href = `mailto:${CONTACT_MAILTO}?subject=${subject}&body=${body}`;
    link.hidden = false;
  }
  setStatus('All done. Save your file below.');
}

async function saveFile() {
  const json = await storage.exportJson(SESSION_ID);
  const name = `asl-contribution-${new Date().toISOString().slice(0, 10)}-${SESSION_ID.slice(-6)}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'ASL trainer contribution' });
      saved = true;
      setStatus('Shared. Thank you.');
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  saved = true;
  setStatus(`Saved as ${name}. Now send that file to the person who shared this link.`);
}

async function begin() {
  $('begin-btn').disabled = true;
  intro.hidden = true;
  guide.hidden = false;
  showStep();
  updateControls();
  $('step-letter').focus();
  try {
    setStatus('Turning on the camera…');
    await startCamera($('camera-feed'));
    setStatus('Camera on. Loading hand tracking…');
    await startTracking($('camera-feed'), $('landmarks-overlay'), (frame) => {
      const visible = frame !== null;
      if (visible !== handVisible) {
        handVisible = visible;
        handStatus.textContent = visible ? 'Hand: detected' : 'Hand: not in view';
      }
      recorder.handleFrame(frame);
    });
    trackerReady = true;
    showStep();
  } catch (error) {
    setStatus(`Could not start the camera: ${error.name}. Allow camera access in your browser and reload.`);
    console.error(error);
  }
}

$('begin-btn').addEventListener('click', begin);

recordBtn.addEventListener('click', () => {
  showFrames(0);
  recorder.start(CLASSES[step]);
  updateControls();
});

cancelBtn.addEventListener('click', () => {
  recorder.cancel();
  overlay.textContent = '';
  showFrames(0);
  setStatus('Cancelled. Nothing was saved for this one.');
  updateControls();
});

skipBtn.addEventListener('click', () => {
  skipped.push(CLASSES[step]);
  nextStep();
});

finishBtn.addEventListener('click', showDone);
$('save-btn').addEventListener('click', saveFile);

$('delete-btn').addEventListener('click', async () => {
  if (!confirm('Delete your recording from this browser? Make sure you saved the file first.')) return;
  await storage.deleteSession(SESSION_ID);
  setStatus('Deleted from this browser.');
});
