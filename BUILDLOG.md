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
- Live test on a real hand: individual letters work well; ambiguous A positions get "not sure: L or A"; and the model shows a "held" letter when NOT signing anything (relaxed hand). Cause: the model only knows 24 classes, so every hand shape gets forced into one of them. Fix chosen: a 25th "no sign" class.
- Browser cached old pages (Opera GX), so `start.bat` showed the old home page. Added `serve.py` (adds `Cache-Control: no-store`) and pointed `start.bat` at it. `?model=shipped` on the home page forces the model from `/model`.
- Pushed Phases 5-7 to GitHub (commit c8928b9).

## 2026-09-20 (later)

- Added a 6th dataset (`asl-dataset-2026-09-20-ayuhka.json`, 1 session, 2,500 samples, I has 200).
- Added the `none` class: `CLASSES` in `js/letters.js`, a "No sign" button on the Record screen with its own instructions, 25 outputs in the model, "none" row/column in the confusion matrix, and cleaning skips outlier removal for it (its point is variety). The live page treats a held "none" as no letter. Verified with synthetic data: 25 outputs, matrix 25x25, all 40 fake "none" frames kept by cleaning. The shipped model in `/model` still has 24 outputs and must be retrained and re-exported.
- Recorded "no sign" (600 frames in 2 sessions: 500 + 100). Full export saved as `data/asl-dataset-2026-09-20-bleh-full-export.json` (15,277 samples, 9 sessions). Trained a 25-class model on everything except session 5xp75i and tested on 5xp75i: about 99% overall, "no sign" about 94% (6 of ~100 wrong, 3 as P). Top confusions: P->Q (2), G->Q (1), S->M (1). Caveat: the test session is the same person/room as much of the training data, so this is the optimistic number; and "no sign" was tested on only ~100 frames.
- Installed the new 25-class model into `model/` (28,004 bytes). Windows had renamed the weights download to `model.weights (1).bin`; it must be named `model.weights.bin` to match the manifest. This model was trained WITHOUT the test session, so a final retrain on all data is still to do.
- Design pass (plan approved, dark only): palette Ink / Slate / Chalk / Mist / Ice (interface) / Held (green, only ever means "held correctly"); Geist + Geist Mono self-hosted in `fonts/` (OFL licenses included); one radius rule (12px surfaces, 8px controls); camera as hero with a two-column readout; held state is a green ring plus corner brackets and a "Held" line, not colour alone. Skeleton colours come from CSS variables. Audited against the Vercel web-interface-guidelines: added skip links, theme-color, preconnect and font preload, autocomplete/name on inputs, curly quotes, tabular numbers, touch-action, text-wrap balance. No em dashes in visible copy. No sideways scroll at 375px on any page.
- Dev pages (Record, Train) are unlisted: their nav links show only after opening any page with `?dev` (off with `?dev=off`). This hides links, it is not security; the pages only touch the visitor's own browser data.
- Added the Contribute page (`contribute.html`, `js/ui-contribute.js`): guided recording of all 25 classes, then the visitor saves/shares a JSON file themselves (Web Share where available, download otherwise). Nothing is uploaded, so the privacy line stays true. The export includes only that session, so it can never include someone else's data stored in the same browser. Recording rules moved to shared `js/capture.js` (tested with a fake clock: 100 frames, cap, cancel). Owner contact goes in `js/config.js` (still empty).
- Next up: fill in `js/config.js`, final retrain on all data, commit and push, then Phase 8 (Learn and Drill).

- Record page can now import several JSON files at once (multi-select with Ctrl or Shift). Tested with 3 real files plus a deliberately broken one: 7,377 samples imported, the broken file was named in the status message and did not stop the rest.
- Added README.md (what it is and is not, how recognition works, honest accuracy range, privacy, running locally, layout, credits). Verified the GitHub Pages site is live. Phase 8 (Learn and Drill) postponed until more data arrives.

## 2026-09-20 (evening)

- Dataset grew to 22,877 unique samples across 11 sessions (~900 per class; "no sign" 900 frames from 3 sessions; 84 frames flagged Left). New files were "Double trouble" (5,100) and the 2026-09-20 ayuhka session (2,500). Import de-duplicates overlapping exports (`asl-dataset-2026-09-20.json` and the older ones were entirely repeats).
- Installed a newly trained 25-class model into `model/` (28,004 bytes, matched pair saved 17:01) and pushed it. Accuracy for this exact model was not re-measured here; README numbers are from earlier runs and say so.
