import { VisionPipeline, VisionStatus } from './vision';
import { OffscreenStatus, TrackingMode } from '../shared/messages';

const video = document.getElementById('webcam') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const vision = new VisionPipeline(video, canvas);
vision.onGesture = (g) => send({ type: 'GESTURE', gesture: g });
// keep the background worker alive
setInterval(() => send({ type: 'KEEPALIVE' }), 20000);

let cameraActive = false;
let starting = false;
let cameraError: string | undefined;
let lastVision: VisionStatus = { fps: 0, confidence: 0, modelReady: false };

function send(msg: unknown): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function publish(): void {
  const status: OffscreenStatus = {
    type: 'OFFSCREEN_STATUS',
    cameraActive,
    micActive: false,
    fps: lastVision.fps,
    confidence: lastVision.confidence,
    modelReady: lastVision.modelReady,
    warning: lastVision.warning,
    error: cameraError || lastVision.error
  };
  send(status);
}

async function startCapture(mode: TrackingMode, lang?: string): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    vision.setMode(mode);

    if (!cameraActive) {
      const res = await vision.start(
        (pose) => send(pose),
        (status) => {
          lastVision = status;
          publish();
        }
      );
      cameraActive = res.ok;
      cameraError = res.error;
    }

  } finally {
    starting = false;
    publish();
  }
}

function stopCapture(): void {
  vision.stop();
  cameraActive = false;
  lastVision = { fps: 0, confidence: 0, modelReady: false };
  publish();
}

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  switch (message?.type) {
    case 'START_OFFSCREEN_CAPTURE':
      startCapture(message.mode || 'head', message.lang).then(() => sendResponse({ success: true }));
      return true;
    case 'STOP_OFFSCREEN_CAPTURE':
      stopCapture();
      sendResponse({ success: true });
      return true;
    case 'SET_MODE':
      vision.setMode(message.mode);
      return false;
    default:
      return false;
  }
});

// The background worker starts capture explicitly once this page has loaded.
send({ type: 'OFFSCREEN_READY' });
