// Asks the browser for the webcam and connects it to a <video> element.
// Resolves once the first frame is ready. Throws if permission is denied.

export async function startCamera(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });

  videoElement.srcObject = stream;

  if (videoElement.readyState < 2) {
    await new Promise((resolve) => {
      videoElement.addEventListener('loadeddata', resolve, { once: true });
    });
  }
}
