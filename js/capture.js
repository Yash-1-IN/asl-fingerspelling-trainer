// The recording rules, shared by the Record screen and the Contribute page so
// the two can never drift apart: countdown, then one frame every 100 ms.

export const TARGET_SAMPLES = 100;
export const CAPTURE_INTERVAL_MS = 100;
export const MAX_CAPTURE_MS = 20000;
export const COUNTDOWN_SECONDS = 3;

// One id per page load. Training uses it to hold out whole sessions.
export function newSessionId() {
  return `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Callbacks (all optional):
//   onCountdown(secondsLeft)  during the countdown
//   onCaptureStart()          when capturing begins
//   onProgress(count)         after each captured frame
//   onFinish(samples, cls)    when done (may be an empty array)
export function createRecorder({ sessionId, onCountdown, onCaptureStart, onProgress, onFinish }) {
  let state = 'idle'; // idle | countdown | capturing
  let cls = null;
  let captured = [];
  let startedAt = 0;
  let lastAt = 0;
  let timer = null;

  function start(className) {
    cls = className;
    captured = [];
    state = 'countdown';
    let remaining = COUNTDOWN_SECONDS;
    onCountdown?.(remaining);
    timer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        onCountdown?.(remaining);
        return;
      }
      clearInterval(timer);
      state = 'capturing';
      startedAt = performance.now();
      lastAt = 0;
      onCaptureStart?.();
    }, 1000);
  }

  function cancel() {
    clearInterval(timer);
    state = 'idle';
    captured = [];
  }

  function finish() {
    const samples = captured;
    const finished = cls;
    state = 'idle';
    captured = [];
    onFinish?.(samples, finished);
  }

  // Call this with every frame from the tracker (null when no hand is visible).
  function handleFrame(frame) {
    if (state !== 'capturing') return;
    const now = performance.now();
    if (frame && now - lastAt >= CAPTURE_INTERVAL_MS) {
      lastAt = now;
      captured.push({
        letter: cls,
        features: frame.features,
        sessionId,
        timestamp: Date.now(),
        handedness: frame.handedness,
      });
      onProgress?.(captured.length);
    }
    if (captured.length >= TARGET_SAMPLES || now - startedAt > MAX_CAPTURE_MS) finish();
  }

  return { start, cancel, handleFrame, get state() { return state; } };
}
