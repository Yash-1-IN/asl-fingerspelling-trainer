// Turns 21 raw 3D hand landmarks into a 63-number description of the hand's
// SHAPE only — independent of which hand it is, where it is in frame, and how
// close it is to the camera. Used identically by the recording path (Phase 4)
// and the live-prediction path (Phase 7). Do not fork this into two versions —
// a mismatch between how training data and live data are processed is the
// most common way this kind of model silently fails.

export function landmarksToFeatures(worldLandmarks, handedness) {
  const points = worldLandmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }));

  // 1. Mirror left hands so one model serves both hands.
  if (handedness === 'Left') {
    for (const point of points) {
      point.x = -point.x;
    }
  }

  // 2. Translate: wrist (landmark 0) becomes the origin.
  const wrist = points[0];
  for (const point of points) {
    point.x -= wrist.x;
    point.y -= wrist.y;
    point.z -= wrist.z;
  }

  // 3. Scale by the wrist-to-middle-knuckle (landmark 9) distance, so hand
  // size and camera distance stop mattering.
  const middleKnuckle = points[9];
  const scale = Math.sqrt(
    middleKnuckle.x ** 2 + middleKnuckle.y ** 2 + middleKnuckle.z ** 2
  );
  for (const point of points) {
    point.x /= scale;
    point.y /= scale;
    point.z /= scale;
  }

  // 4. Flatten to 63 floats, rounded to 4 decimal places (keeps exported
  // datasets small later; makes no meaningful difference to accuracy).
  const features = [];
  for (const point of points) {
    features.push(
      Math.round(point.x * 10000) / 10000,
      Math.round(point.y * 10000) / 10000,
      Math.round(point.z * 10000) / 10000
    );
  }
  return features;
}
