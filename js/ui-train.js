// The Train screen: clean the data, pick test sessions, train, show honest results.

import { LETTERS, CLASSES, NO_SIGN, labelOf } from './letters.js';
import * as storage from './storage.js';
import { cleanSamples, summarizeSessions, chooseValidationSessions } from './dataset.js';
import { buildModel, trainModel, confusionMatrix, saveToBrowser, exportModelFiles } from './model.js';

const EPOCHS = 80;
const LOW_SAMPLE_THRESHOLD = 150;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const trainBtn = $('train-btn');
const finalBtn = $('final-btn');
const saveBtn = $('save-btn');
const exportBtn = $('export-btn');
const progressEl = $('train-progress');
const epochText = $('epoch-text');
const resultText = $('result-text');

progressEl.max = EPOCHS;

let samples = [];
let currentModel = null;
let training = false;

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function setStatus(text) {
  statusEl.textContent = text;
}

function updateControls() {
  const hasData = samples.length > 0;
  trainBtn.disabled = training || !hasData;
  finalBtn.disabled = training || !hasData;
  saveBtn.disabled = training || !currentModel;
  exportBtn.disabled = training || !currentModel;
  for (const box of document.querySelectorAll('#session-choices input')) box.disabled = training;
}

function renderSummary(report) {
  const sessions = summarizeSessions(samples);
  $('dataset-summary').textContent =
    `${samples.length.toLocaleString()} usable samples from ${sessions.length} recording sessions.`;
  $('clean-report').textContent =
    `Cleaning removed ${report.droppedHand + report.droppedOutlier} of ${report.total.toLocaleString()} recorded frames ` +
    `(${report.droppedHand} with a hand flag that disagreed with its session, ${report.droppedOutlier} that were extreme outliers for their letter).`;

  const counts = {};
  for (const s of samples) counts[s.letter] = (counts[s.letter] || 0) + 1;
  const list = $('letter-counts');
  list.replaceChildren();
  const low = [];
  for (const cls of CLASSES) {
    const n = counts[cls] || 0;
    const li = document.createElement('li');
    li.textContent = `${labelOf(cls)}: ${n}${n < LOW_SAMPLE_THRESHOLD ? ' (low)' : ''}`;
    if (n < LOW_SAMPLE_THRESHOLD) low.push(labelOf(cls));
    list.append(li);
  }
  $('dataset-warning').textContent = low.length
    ? `Warning: too few samples for ${low.join(', ')}. Record more before trusting the results.`
    : '';
}

function renderSessionChoices() {
  const suggested = new Set(chooseValidationSessions(samples, LETTERS));
  const list = $('session-choices');
  list.replaceChildren();
  for (const session of summarizeSessions(samples)) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = session.id;
    box.checked = suggested.has(session.id);
    label.append(box, ` ${session.id}: ${session.count} samples, ${session.letters.size} letters`);
    li.append(label);
    list.append(li);
  }
}

function selectedTestSessions() {
  return new Set([...document.querySelectorAll('#session-choices input:checked')].map((b) => b.value));
}

function renderMatrix(matrix) {
  const table = $('matrix');
  table.replaceChildren();

  const head = table.insertRow();
  head.insertCell().textContent = '';
  for (const cls of CLASSES) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = cls === NO_SIGN ? 'none' : cls;
    th.title = labelOf(cls);
    head.append(th);
  }

  matrix.forEach((row, i) => {
    const total = row.reduce((a, b) => a + b, 0);
    const tr = table.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = CLASSES[i] === NO_SIGN ? 'none' : CLASSES[i];
    th.title = labelOf(CLASSES[i]);
    tr.append(th);
    row.forEach((n, j) => {
      const td = tr.insertCell();
      td.textContent = n === 0 ? '·' : String(n);
      td.title = `Really ${labelOf(CLASSES[i])}, guessed ${labelOf(CLASSES[j])}: ${n}`;
      const share = total ? n / total : 0;
      td.style.background = `rgba(124, 196, 255, ${share.toFixed(2)})`;
      td.style.color = share > 0.5 ? '#0e1114' : '#e8ecef';
      if (i === j) td.classList.add('diagonal');
    });
  });

  const mistakes = [];
  matrix.forEach((row, i) => {
    const total = row.reduce((a, b) => a + b, 0);
    row.forEach((n, j) => {
      if (i !== j && n > 0) mistakes.push({ i, j, n, share: n / total });
    });
  });
  mistakes.sort((a, b) => b.n - a.n);
  const list = $('top-confusions');
  list.replaceChildren();
  if (mistakes.length === 0) {
    list.textContent = 'No mistakes on the test data.';
  }
  for (const m of mistakes.slice(0, 8)) {
    const li = document.createElement('li');
    li.textContent = `${labelOf(CLASSES[m.i])} mistaken for ${labelOf(CLASSES[m.j])}: ${m.n} times (${pct(m.share)} of ${labelOf(CLASSES[m.i])})`;
    list.append(li);
  }
}

async function run(useTestSplit) {
  const testIds = useTestSplit ? selectedTestSessions() : new Set();
  const trainSamples = samples.filter((s) => !testIds.has(s.sessionId));
  const testSamples = samples.filter((s) => testIds.has(s.sessionId));

  if (useTestSplit && testSamples.length === 0) {
    setStatus('Tick at least one test session first.');
    return;
  }
  const trainLetters = new Set(trainSamples.map((s) => s.letter));
  const classesInData = new Set(samples.map((s) => s.letter));
  if (CLASSES.some((c) => classesInData.has(c) && !trainLetters.has(c))) {
    setStatus('The training sessions are missing a letter or “No sign”. Untick a test session.');
    return;
  }

  training = true;
  updateControls();
  resultText.textContent = '';
  setStatus(`Training on ${trainSamples.length.toLocaleString()} samples…`);

  const model = buildModel();
  await trainModel(model, trainSamples, testSamples, {
    epochs: EPOCHS,
    onEpoch: (epoch, total, logs) => {
      progressEl.value = epoch;
      const val = logs.val_acc !== undefined ? `, test accuracy ${pct(logs.val_acc)}` : '';
      epochText.textContent = `Epoch ${epoch}/${total}: loss ${logs.loss.toFixed(3)}, training accuracy ${pct(logs.acc)}${val}`;
    },
  });

  currentModel = model;
  if (useTestSplit) {
    const matrix = confusionMatrix(model, testSamples);
    const correct = matrix.reduce((sum, row, i) => sum + row[i], 0);
    resultText.textContent =
      `Test accuracy: ${pct(correct / testSamples.length)} (${correct.toLocaleString()} of ${testSamples.length.toLocaleString()} ` +
      `frames from ${testIds.size} session${testIds.size === 1 ? '' : 's'} the model never saw while training).`;
    renderMatrix(matrix);
  } else {
    resultText.textContent =
      `Final model trained on all ${samples.length.toLocaleString()} samples. It has no test score of its own; quote the one from “Train and test”.`;
  }

  training = false;
  setStatus('Training finished.');
  updateControls();
}

trainBtn.addEventListener('click', () => run(true));
finalBtn.addEventListener('click', () => run(false));

saveBtn.addEventListener('click', async () => {
  await saveToBrowser(currentModel);
  setStatus('Model saved in this browser.');
});

exportBtn.addEventListener('click', async () => {
  await exportModelFiles(currentModel);
  setStatus('Downloaded model.json and model.weights.bin. Put both in the /model folder of the project.');
});

async function init() {
  const raw = await storage.getAllSamples();
  if (raw.length === 0) {
    setStatus('No samples yet. Go to Record samples and import your JSON files first.');
    return;
  }
  const { kept, report } = cleanSamples(raw);
  samples = kept;
  renderSummary(report);
  renderSessionChoices();
  setStatus('Ready. Check the test sessions, then press “Train and test”.');
  updateControls();
}

init();
