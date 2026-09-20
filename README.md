# ASL Fingerspelling Trainer

A web app that helps you practise **ASL fingerspelling** with your webcam. Make a handshape, and the app shows you, live, which letter it sees and whether you are holding it steadily.

**Try it:** https://yash-1-in.github.io/asl-fingerspelling-trainer/


## What this is not

- **It is not a sign language translator.** ASL is a full language with its own grammar, facial expression and body movement. Fingerspelling is one small part of it.
- **It does not recognise J or Z.** Those two letters are drawn in the air, and this version only looks at a single still frame. It covers the 24 static letters.
- **It is a practice aid, not a substitute for a Deaf instructor.**

## Privacy

Your camera feed stays on your device. Nothing is uploaded, nothing is stored on a server, and there is no account. There is no analytics and no tracking. The only things fetched from other servers are the two libraries below (from the jsDelivr CDN) and MediaPipe's pre-trained hand-finding model file (from Google's storage). Those are downloads to your browser; none of your data is sent back.

The **Contribute** page lets you help train the recogniser, but it never uploads anything itself. It records your handshapes as numbers (no video, no photos, no name), gives you a small file, and you choose whether to send it.

## How the recognition works

1. **Find the hand.** Google's MediaPipe `HandLandmarker` runs in your browser and returns 21 3D points on the hand for every video frame.
2. **Describe the shape, not the position.** `js/features.js` turns those points into 63 numbers. It mirrors left hands, moves the wrist to the origin, and scales by the wrist-to-knuckle distance, so the numbers describe the *shape* and not where the hand is, how big it is, or how close it is to the camera. Recording and live prediction use the same function, so training data and live data are always processed identically.
3. **Classify.** A small neural network (63 inputs, two hidden layers of 64 and 32 units, 25 outputs) built with TensorFlow.js runs on every frame. The 25 outputs are the 24 letters plus a **"no sign"** class, so the app can say "that is not a letter" instead of forcing a guess.
4. **Smooth it.** A raw guess flickers from frame to frame. A letter counts as *held* only when at least 8 of the last 12 frames agree and their average confidence is above 0.85. When the model is torn between two letters, the page shows both.

The model was trained on hand data recorded for this project (see below), not downloaded pre-trained.

## How well does it work?

Honest numbers, measured by holding out **whole recording sessions** the model never trained on (a random split would leak near-identical frames and inflate the score):

| Test | Accuracy |
|---|---|
| Held-out session in conditions similar to training (24 letters) | about 95% |
| Held-out low-light session, a much harder test (24 letters) | about 77% |
| Held-out session, same person as most training data (25 classes) | about 99% |

These were measured on earlier, smaller versions of the dataset and will be re-measured after each retrain. Read them as a range, not one number. The high figures come from conditions the model has seen, and the low one from a genuinely new setting. More people and more varied rooms are what improve it.

**Known weak spots.** The letters that are variations on a closed fist (A, M, N, S, T) are hard to tell apart from hand landmarks alone, as are U, V and R. This is a real limit of the approach. When the model is unsure it shows both candidates.

## The dataset

The training data was recorded by me and by friends, across multiple sessions, rooms, lighting conditions and hands. At the time of writing it is about 22,900 frames from 11 sessions, roughly 900 per letter plus 900 "no sign" frames. It is kept private for now, because contributors have not agreed to publish it. Each sample is a letter label plus 63 numbers, with a random session code, a timestamp and a hand label. No images or video were ever stored.

## Run it yourself

The page must be served over `http://localhost` (opening the file directly breaks the camera and the library loader).

```
python serve.py
```

Then open http://localhost:8000. On Windows you can double-click `start.bat` instead, which starts the server and opens the page.

`serve.py` is a tiny static server that also tells the browser not to cache files, so edits show up on a normal refresh.

### Developer tools

The **Record** and **Train** pages are used to build the dataset and the model. Their links are hidden from visitors. Open any page with `?dev` on the end (for example `index.html?dev`) to show them in your own browser, and `?dev=off` to hide them again. This only hides links; the pages work on the visitor's own browser data and nothing else.

To retrain: import JSON files on **Record**, then on **Train** choose test sessions, press **Train and test** for an honest score, **Retrain on all data** for the final model, and **Download model files** into the `model/` folder.

## Accessibility

Every piece of feedback is visual, and no sound is ever the only signal. The interface works with a keyboard alone and has a visible focus ring and a skip link. Colour is never the only carrier of meaning: a held letter is shown with a ring, corner brackets and text as well as green. Contrast meets WCAG AA, and motion respects `prefers-reduced-motion`. The site is dark only, on purpose.

Feedback from Deaf and hard-of-hearing users and from ASL club members is the most valuable input this project can get.

## Project layout

```
index.html          live recogniser
contribute.html     guided recording for visitors, no upload
record.html         developer: build the dataset
train.html          developer: train and test the model
css/styles.css      design tokens and styles
fonts/              Geist and Geist Mono (self-hosted, OFL licensed)
js/
  camera.js         webcam setup
  landmarks.js      MediaPipe wrapper and skeleton drawing
  features.js       landmarksToFeatures(), shared by recording and prediction
  capture.js        recording rules shared by Record and Contribute
  storage.js        IndexedDB, JSON export and import
  dataset.js        cleaning and test-session selection
  model.js          build, train, save, load, predict
  smoothing.js      the held-letter logic
  letters.js        the 24 letters plus "no sign"
  nav.js, config.js top bar and contribution contact
  ui-*.js           one file per screen
model/              the trained model that ships with the app
BUILDLOG.md         what was built, what broke, what was learned
```

## Built with

- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (Apache 2.0) for hand landmarks
- [TensorFlow.js](https://www.tensorflow.org/js) (Apache 2.0) for the model
- [Geist](https://github.com/vercel/geist-font) (SIL Open Font License 1.1)
- Plain HTML, CSS and JavaScript. No framework, no build step, no backend.

## Credits

Thank you to my school's ASL club, and to the friends and classmates who recorded samples and tested the app.

## Status

Version 1 is in progress. Still to come: Learn, Drill, Spell and Progress screens, reference images for each letter (drawn or photographed by me, and checked by someone from the ASL club), and testing with people who did not build it.
