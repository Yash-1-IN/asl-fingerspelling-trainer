// Build, train, evaluate, save, load and use the letter-recognition network.
// TensorFlow.js is loaded by a <script> tag in the page and appears as `tf`.

import { CLASSES } from './letters.js';

const MODEL_DB_URL = 'indexeddb://asl-fingerspelling-model';
const SHIPPED_MODEL_URL = 'model/model.json';

export function buildModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [63], units: 64, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: CLASSES.length, activation: 'softmax' }));
  model.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  return model;
}

function toTensors(samples) {
  const xs = tf.tensor2d(samples.map((s) => s.features));
  const labels = tf.tensor1d(samples.map((s) => CLASSES.indexOf(s.letter)), 'int32');
  const ys = tf.oneHot(labels, CLASSES.length).toFloat();
  labels.dispose();
  return [xs, ys];
}

// onEpoch(epochNumber, totalEpochs, logs) is called after every epoch.
export async function trainModel(model, trainSamples, valSamples, { epochs = 80, batchSize = 32, onEpoch } = {}) {
  const [xs, ys] = toTensors(trainSamples);
  const validation = valSamples.length > 0 ? toTensors(valSamples) : null;
  try {
    await model.fit(xs, ys, {
      epochs,
      batchSize,
      shuffle: true,
      yieldEvery: 'never',
      validationData: validation || undefined,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          if (onEpoch) onEpoch(epoch + 1, epochs, logs);
          // A timer, not tf.nextFrame(): animation frames stop in hidden tabs.
          await new Promise((resolve) => setTimeout(resolve, 0));
        },
      },
    });
  } finally {
    xs.dispose();
    ys.dispose();
    if (validation) validation.forEach((t) => t.dispose());
  }
}

// Probabilities (one per class, in CLASSES order) for one 63-number feature vector.
export function predict(model, features) {
  return tf.tidy(() => Array.from(model.predict(tf.tensor2d([features])).dataSync()));
}

// matrix[trueIndex][predictedIndex] = how many samples.
export function confusionMatrix(model, samples) {
  const size = CLASSES.length;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  const predicted = tf.tidy(() => Array.from(model.predict(tf.tensor2d(samples.map((s) => s.features))).argMax(1).dataSync()));
  samples.forEach((s, i) => {
    matrix[CLASSES.indexOf(s.letter)][predicted[i]]++;
  });
  return matrix;
}

export function saveToBrowser(model) {
  return model.save(MODEL_DB_URL);
}

// Downloads model.json and model.weights.bin, to be placed in the /model folder.
export function exportModelFiles(model) {
  return model.save('downloads://model');
}

// Prefers a model saved in this browser, then falls back to the one shipped in /model.
// Returns { model, source } so the page can say which one it is using.
export async function loadModel({ preferShipped = false } = {}) {
  let model;
  let source;
  try {
    if (preferShipped) throw new Error('skip browser copy');
    model = await tf.loadLayersModel(MODEL_DB_URL);
    source = 'saved in this browser';
  } catch {
    model = await tf.loadLayersModel(SHIPPED_MODEL_URL);
    source = 'shipped with the app (model folder)';
  }
  predict(model, new Array(63).fill(0)); // warm-up so the first live frame isn't slow
  return { model, source };
}
