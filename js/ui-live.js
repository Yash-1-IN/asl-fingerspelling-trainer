// Home page: live camera + letter recognition with smoothing.

import { startCamera } from './camera.js';
import { startTracking } from './landmarks.js';
import { LETTERS } from './letters.js';
import { loadModel, predict } from './model.js';
import { createSmoother } from './smoothing.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const heldBig = $('held-big');
const heldText = $('held-text');
const nowText = $('now-text');
const meter = $('confidence-meter');
const meterText = $('confidence-text');
const modelSource = $('model-source');

const smoother = createSmoother();
let model = null;

const pct = (x) => `${Math.round(x * 100)}%`;

function topTwo(probs) {
  const order = probs.map((p, i) => i).sort((a, b) => probs[b] - probs[a]);
  return [order[0], order[1]];
}

function showNoHand() {
  heldBig.textContent = '–';
  heldText.textContent = 'Held: none (no hand in view)';
  nowText.textContent = 'Right now: no hand in view';
  meter.value = 0;
  meterText.textContent = '0%';
}

function onFrame(frame) {
  if (!model) return;
  if (!frame) {
    smoother.reset();
    showNoHand();
    return;
  }

  const probs = predict(model, frame.features);
  const result = smoother.push(probs);
  const [first, second] = topTwo(probs);

  meter.value = probs[first];
  meterText.textContent = pct(probs[first]);

  if (probs[first] < smoother.settings.minConfidence && probs[second] >= 0.2) {
    nowText.textContent =
      `Right now: not sure. ${LETTERS[first]} (${pct(probs[first])}) or ${LETTERS[second]} (${pct(probs[second])})`;
  } else {
    nowText.textContent = `Right now: ${LETTERS[first]} (${pct(probs[first])})`;
  }

  if (result.held) {
    heldBig.textContent = LETTERS[result.index];
    heldText.textContent = `Held: ${LETTERS[result.index]} ✓`;
  } else {
    heldBig.textContent = '–';
    heldText.textContent = 'Held: none yet';
  }
}

function wireTuning() {
  const fields = [
    ['tune-window', 'windowSize', 1],
    ['tune-agree', 'minAgree', 1],
    ['tune-confidence', 'minConfidence', 0],
  ];
  for (const [id, key] of fields) {
    const input = $(id);
    input.value = smoother.settings[key];
    input.addEventListener('input', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      smoother.settings[key] = value;
      smoother.settings.minAgree = Math.min(smoother.settings.minAgree, smoother.settings.windowSize);
    });
  }
}

async function init() {
  wireTuning();
  showNoHand();
  try {
    statusEl.textContent = 'Loading the letter model…';
    const preferShipped = new URLSearchParams(location.search).get('model') === 'shipped';
    const loaded = await loadModel({ preferShipped });
    model = loaded.model;
    modelSource.textContent = `Model: ${loaded.source}`;
  } catch (error) {
    statusEl.textContent = 'No trained model found. Train one on the Train page, then reload.';
    console.error(error);
    return;
  }

  try {
    await startCamera($('camera-feed'));
    statusEl.textContent = 'Camera on. Loading hand tracking…';
    await startTracking($('camera-feed'), $('landmarks-overlay'), onFrame);
    statusEl.textContent = 'Ready. Show a letter to the camera.';
  } catch (error) {
    statusEl.textContent = `Could not start: ${error.name}: ${error.message}`;
    console.error(error);
  }
}

init();
