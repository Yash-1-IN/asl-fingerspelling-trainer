// Turns flickery frame-by-frame predictions into a steady "held" letter.
// A letter is held when at least `minAgree` of the last `windowSize` frames
// guessed it AND their average confidence is above `minConfidence`.

export const DEFAULT_SETTINGS = { windowSize: 12, minAgree: 8, minConfidence: 0.85 };

export function createSmoother(settings = { ...DEFAULT_SETTINGS }) {
  let history = [];

  // probs: array of 24 probabilities, or null when no hand is visible.
  function push(probs) {
    if (!probs) {
      history = [];
      return null;
    }

    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    history.push({ index: best, prob: probs[best] });
    while (history.length > settings.windowSize) history.shift();

    const votes = new Map();
    for (const h of history) {
      const v = votes.get(h.index) || { count: 0, sum: 0 };
      v.count++;
      v.sum += h.prob;
      votes.set(h.index, v);
    }

    let winner = null;
    for (const [index, v] of votes) {
      if (!winner || v.count > winner.count) winner = { index, count: v.count, mean: v.sum / v.count };
    }

    return {
      index: winner.index,
      votes: winner.count,
      meanConfidence: winner.mean,
      held: winner.count >= settings.minAgree && winner.mean > settings.minConfidence,
    };
  }

  return { settings, push, reset: () => { history = []; } };
}
