// MediaPipe wrapper. Loads the HandLandmarker model, runs it on every new
// video frame, draws the 21-point skeleton on a canvas, and reports each
// frame to the caller.

import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { landmarksToFeatures } from './features.js';

// Which landmark indices connect to which (0 = wrist).
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function drawSkeleton(ctx, canvas, landmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height);
    ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height);
    ctx.stroke();
  }

  ctx.fillStyle = '#facc15';
  for (const point of landmarks) {
    ctx.beginPath();
    ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// onFrame(frame) is called for every new video frame.
// frame is null when no hand is visible, otherwise { features, handedness }.
export async function startTracking(videoElement, canvasElement, onFrame) {
  const ctx = canvasElement.getContext('2d');
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });

  let lastVideoTime = -1;

  function loop() {
    if (videoElement.readyState >= 2 && videoElement.currentTime !== lastVideoTime) {
      lastVideoTime = videoElement.currentTime;
      const result = handLandmarker.detectForVideo(videoElement, performance.now());

      if (result.landmarks.length > 0) {
        drawSkeleton(ctx, canvasElement, result.landmarks[0]);
        const handedness = result.handedness[0][0].categoryName;
        const features = landmarksToFeatures(result.worldLandmarks[0], handedness);
        onFrame({ features, handedness });
      } else {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        onFrame(null);
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}
