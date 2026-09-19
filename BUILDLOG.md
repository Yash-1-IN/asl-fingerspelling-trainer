# Build Log

One entry per session: what was built, what broke, what fixed it, what was learned.

---

## 2026-09-13

- Set up the project folder structure (`css/`, `js/`, `data/`, `model/`, `images/letters/`).
- Built Phase 1: a bare page that asks for webcam permission and shows the live feed in a `<video>` element (`index.html`, `js/camera.js`, `css/styles.css`).
- This machine had neither Python nor Node.js installed, so there was no way yet to serve the page over `http://localhost` (required — `file://` breaks webcam access and the MediaPipe loader in later phases). Installed both via `winget`.
- Confirmed Phase 1 checkpoint: camera feed visible at `http://localhost:8000` (served via `python -m http.server 8000`).
- Built Phase 2: MediaPipe `HandLandmarker` loaded from CDN, drawing the 21-point hand skeleton over the video on a transparent `<canvas>` (`js/landmarks.js`). Checkpoint confirmed — skeleton tracks the hand cleanly.
- Built Phase 3: `landmarksToFeatures()` (`js/features.js`) — mirrors left hands, recenters on the wrist, rescales by wrist-to-middle-knuckle distance, flattens to 63 numbers. Temporarily logged output to the console to check stability. Checkpoint confirmed: numbers stay roughly stable when the hand moves/changes distance from camera, and shift clearly when the handshape changes.
- Added `start.bat` (double-click to start the server and open the browser).

## 2026-09-19

- Built Phase 4: Record screen (`record.html`, `js/ui-record.js`). Split the old single-page code into reusable modules (`camera.js`, `landmarks.js`), plus new `storage.js` (IndexedDB, JSON export/import, delete by letter/session) and `letters.js` (the 24 static letters; J and Z excluded because they need motion).
- Decision: recording captures 1 frame per 100 ms up to 100 frames, after a 3 s countdown. Each sample stores `sessionId` (one per page load) so Phase 6 can split validation by session.
- Checked without a camera: page loads, 24 letter buttons render, storage add/export/import/delete round-trip works, duplicate and invalid imports are rejected. Still to confirm by hand: real recording with the webcam.
- Phase 4 checkpoint confirmed with the webcam: counter climbs, JSON exports.
- First real dataset (session 1, 2026-09-19): 2500 samples, all 24 letters at 100 each (W has 200), 1.3 MB. Saved to `data/asl-dataset-2026-09-19.json`. Handedness was flagged Right on 2497 frames and Left on 3 (probably MediaPipe flicker, not a real switch).
- Phase 5 done (stopped waiting for more): 4 more files from friends/other setups, saved in `data/` (gitignored). The "switches" file contained 2,400 samples identical to the low-light file; import dedupes them. Real total: 12,277 unique samples, 7 sessions, ~500-700 per letter.

## 2026-09-20

- Built Phase 6: `js/dataset.js` (cleaning + suggested test sessions), `js/model.js` (TF.js network from the spec), `train.html` + `js/ui-train.js` (Train screen with per-epoch readout, confusion matrix, top confusions, save/export).
- Cleaning: dropped 376 of 12,277 frames (68 handedness disagreements, 308 outliers beyond 3 std devs). Most outliers came from the low-light session (2,400 -> 2,129 kept).
- Bug: training froze before epoch 1 when the tab was hidden, because TF.js waits on animation frames between batches. Fixed with `yieldEvery: 'never'` and a `setTimeout` yield per epoch.
- First honest result: 76.9% on held-out sessions (2,250 / 2,926 frames from 2 sessions), versus 99.3% on training data. Below the 85% target. Biggest confusions: V->U (48% of V), R->U, N->T, I->E, M->N, Y->E. The held-out sessions were the low-light session plus a small 8-letter one, so this is probably a hard test. Tested on the CPU backend only, in a hidden test browser.
- Different test splits gave very different scores: ~95% when the held-out session resembled the training ones (likely same person/room), ~77% when it included the low-light session. Report both, not one flattering number. Recurring confusions: fist family (T/S/N/A/M), V/U/R, and Y mistaken for I (13 frames in both runs, probably the tracker missing the thumb).
- Trained a final model on all data, downloaded `model.json` + `model.weights.bin` into `model/` (27,872 bytes of weights = 6,968 parameters x 4 bytes).
- Built Phase 7: `js/smoothing.js` (12-frame window, 8 must agree, mean confidence > 0.85, all adjustable in a Tuning panel), `js/ui-live.js`, and rebuilt `index.html` as the live recogniser. Shows both candidates when unsure. Verified without a camera: shipped model loads, 250/250 training samples correct, smoother ignores a one-frame flicker and never holds a low-confidence guess. Live webcam test still to be done by hand.
- Next up: live test on a real hand, tune the smoothing numbers by feel, then Phase 8 (Learn and Drill).
