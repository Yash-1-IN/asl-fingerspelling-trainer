// Cleaning and splitting the recorded dataset (used by the Train screen).

import { NO_SIGN } from './letters.js';

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

// Drops two kinds of bad frames:
//  1. Frames whose handedness disagrees with the rest of their session
//     (MediaPipe occasionally flips it for a frame or two).
//  2. Frames very far from the average shape of their letter (tracking glitches).
export function cleanSamples(samples, outlierStdDevs = 3) {
  const tally = new Map();
  for (const s of samples) {
    const t = tally.get(s.sessionId) || { Left: 0, Right: 0 };
    t[s.handedness] = (t[s.handedness] || 0) + 1;
    tally.set(s.sessionId, t);
  }
  const sessionHand = new Map();
  for (const [id, t] of tally) sessionHand.set(id, t.Left > t.Right ? 'Left' : 'Right');

  const sameHand = samples.filter((s) => s.handedness === sessionHand.get(s.sessionId));

  const byLetter = new Map();
  for (const s of sameHand) {
    if (!byLetter.has(s.letter)) byLetter.set(s.letter, []);
    byLetter.get(s.letter).push(s);
  }

  const kept = [];
  for (const group of byLetter.values()) {
    // "No sign" is meant to be wildly varied, so outlier removal would delete the point of it.
    if (group[0].letter === NO_SIGN) {
      kept.push(...group);
      continue;
    }
    const centroid = new Array(63).fill(0);
    for (const s of group) {
      for (let i = 0; i < 63; i++) centroid[i] += s.features[i] / group.length;
    }
    const distances = group.map((s) => Math.hypot(...s.features.map((v, i) => v - centroid[i])));
    const m = mean(distances);
    const sd = Math.sqrt(mean(distances.map((d) => (d - m) ** 2)));
    group.forEach((s, i) => {
      if (distances[i] <= m + outlierStdDevs * sd) kept.push(s);
    });
  }

  return {
    kept,
    report: {
      total: samples.length,
      droppedHand: samples.length - sameHand.length,
      droppedOutlier: sameHand.length - kept.length,
    },
  };
}

export function summarizeSessions(samples) {
  const map = new Map();
  for (const s of samples) {
    if (!map.has(s.sessionId)) map.set(s.sessionId, { id: s.sessionId, count: 0, letters: new Set() });
    const entry = map.get(s.sessionId);
    entry.count++;
    entry.letters.add(s.letter);
  }
  return [...map.values()];
}

function subsets(items, maxSize) {
  const result = [];
  function walk(start, chosen) {
    if (chosen.length > 0) result.push([...chosen]);
    if (chosen.length === maxSize) return;
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]);
      walk(i + 1, chosen);
      chosen.pop();
    }
  }
  walk(0, []);
  return result;
}

// Suggests 1-3 whole sessions to hold out for testing: every letter must appear
// in both the test and training sides, and the test side should be about 25%
// of all samples. Returns an array of session ids (empty if there's no valid choice).
export function chooseValidationSessions(samples, letters) {
  const sessions = summarizeSessions(samples);
  const total = samples.length;
  const letterTotals = {};
  for (const s of samples) letterTotals[s.letter] = (letterTotals[s.letter] || 0) + 1;

  let best = null;
  for (const combo of subsets(sessions, 3)) {
    const ids = new Set(combo.map((c) => c.id));
    const valLetterCounts = {};
    let valCount = 0;
    for (const s of samples) {
      if (ids.has(s.sessionId)) {
        valCount++;
        valLetterCounts[s.letter] = (valLetterCounts[s.letter] || 0) + 1;
      }
    }
    const valid = letters.every(
      (l) => (valLetterCounts[l] || 0) > 0 && (letterTotals[l] || 0) - (valLetterCounts[l] || 0) > 0
    );
    if (!valid) continue;
    const score = Math.abs(valCount / total - 0.25);
    if (!best || score < best.score) best = { ids: [...ids], score };
  }
  return best ? best.ids : [];
}
