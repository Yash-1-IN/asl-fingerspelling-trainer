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
- Next up: Phase 5 (collect at least 2 more sessions on different days, lighting and backgrounds; aim for 150+ per letter).
