// Saves recorded samples in IndexedDB (the browser's built-in database), and
// exports/imports them as JSON so the dataset can live in the repo.
//
// A sample looks like:
//   { letter, features: [63 numbers], sessionId, timestamp, handedness }

const DB_NAME = 'asl-trainer';
const STORE = 'samples';
const FEATURE_COUNT = 63;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addSamples(samples) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  for (const sample of samples) tx.objectStore(STORE).add(sample);
  await finished(tx);
  db.close();
}

export async function getAllSamples() {
  const db = await openDb();
  const samples = await requestResult(db.transaction(STORE).objectStore(STORE).getAll());
  db.close();
  return samples;
}

async function deleteWhere(predicate) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  store.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    if (predicate(cursor.value)) cursor.delete();
    cursor.continue();
  };
  await finished(tx);
  db.close();
}

export function deleteLetter(letter) {
  return deleteWhere((sample) => sample.letter === letter);
}

export function deleteSession(sessionId) {
  return deleteWhere((sample) => sample.sessionId === sessionId);
}

// Pass a sessionId to export only that session (used by the Contribute page).
export async function exportJson(onlySessionId) {
  const samples = (await getAllSamples())
    .filter((s) => !onlySessionId || s.sessionId === onlySessionId)
    .map(({ id, ...rest }) => rest);
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), samples });
}

function isValidSample(s) {
  return (
    s && typeof s.letter === 'string' &&
    Array.isArray(s.features) && s.features.length === FEATURE_COUNT &&
    s.features.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    typeof s.sessionId === 'string' &&
    typeof s.timestamp === 'number' &&
    typeof s.handedness === 'string'
  );
}

// Adds samples from an exported file, skipping ones we already have.
export async function importJson(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.samples)) {
    throw new Error('This file does not look like an exported dataset.');
  }

  const keyOf = (s) => `${s.sessionId}|${s.timestamp}|${s.letter}`;
  const existing = new Set((await getAllSamples()).map(keyOf));

  const toAdd = [];
  let skipped = 0;
  for (const s of data.samples) {
    if (!isValidSample(s) || existing.has(keyOf(s))) {
      skipped++;
      continue;
    }
    existing.add(keyOf(s));
    toAdd.push({
      letter: s.letter,
      features: s.features,
      sessionId: s.sessionId,
      timestamp: s.timestamp,
      handedness: s.handedness,
    });
  }

  await addSamples(toAdd);
  return { added: toAdd.length, skipped };
}
