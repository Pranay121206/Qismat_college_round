import { SpeechEngineManager } from './voice';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type {
  HandsfreeMessage,
  ISpeechRecognition,
  ISpeechRecognitionErrorEvent,
  ISpeechRecognitionEvent,
  SpeechRecognitionConstructor,
  SpeechSpikePayload,
  StatusUpdate,
} from '../shared/messages';
import { OneEuroFilter } from '../shared/oneEuro';
import {
  DEFAULT_SETTINGS,
  getSettings,
  type HandsfreeSettings,
  type TrackingMode,
} from '../shared/settings';

console.log('[Handsfree Offscreen] Document loaded and initializing pipeline listener');

let currentStream: MediaStream | null = null;
let recognition: ISpeechRecognition | null = null;
let isPipelineRunning = false;

// MediaPipe vision pipeline
let faceLandmarker: FaceLandmarker | null = null;
let isLandmarkerLoading = false;
let isLandmarkerReady = false;

let visionResolverPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
function getVisionResolver() {
  if (!visionResolverPromise) {
    const wasmPath = chrome.runtime.getURL('mediapipe/wasm');
    console.log('[Handsfree Offscreen] Initializing FilesetResolver from:', wasmPath);
    visionResolverPromise = FilesetResolver.forVisionTasks(wasmPath);
  }
  return visionResolverPromise;
}

// Filter and settings
let currentSettings: HandsfreeSettings = { ...DEFAULT_SETTINGS };
const filterX = new OneEuroFilter(currentSettings.filter);
const filterY = new OneEuroFilter(currentSettings.filter);

// Head tracking coordinates and pose state
let neutralPose: { x: number; y: number } | null = null;
let lastFilteredPose: { x: number; y: number } | null = null;
let lastFaceDetectedTime = 0;

// Cursor accumulator
let cursorX = 0.5; // Normalized [0, 1], starts centered
let cursorY = 0.5;
let lastTrackingTimestamp = 0;
let isTrackingPaused = false;
let hasAutoPaused = false;

// FPS counter
let frameCount = 0;
let fpsLastTime = performance.now();
let currentFps = 30;

const offscreenVideo = document.getElementById('offscreenVideo') as HTMLVideoElement;

// Load stored settings on startup
getSettings().then((settings) => {
  currentSettings = settings;
  filterX.updateConfig(settings.filter);
  filterY.updateConfig(settings.filter);
});

function sendStatus(update: Partial<StatusUpdate>): void {
  const msg: HandsfreeMessage = {
    type: 'STATUS_UPDATE',
    payload: {
      running: isPipelineRunning,
      paused: isTrackingPaused,
      mode: update.mode ?? (currentSettings.mode || 'head'),
      cameraStatus: update.cameraStatus ?? (isPipelineRunning ? 'running' : 'idle'),
      micStatus: update.micStatus ?? (isPipelineRunning ? 'running' : 'idle'),
      speechStatus: update.speechStatus ?? 'idle',
      speechEngine: update.speechEngine ?? 'offscreen-webspeech',
      errorMessage: update.errorMessage,
      speechError: update.speechError,
      fps: update.fps ?? currentFps,
      confidence: update.confidence,
    },
    source: 'offscreen',
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function sendSpikeEvent(payload: Omit<SpeechSpikePayload, 'timestamp'>): void {
  const fullPayload: SpeechSpikePayload = {
    ...payload,
    timestamp: Date.now(),
  };
  const msg: HandsfreeMessage = {
    type: 'SPEECH_SPIKE_EVENT',
    payload: fullPayload,
    source: 'offscreen',
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/**
 * Initialize MediaPipe FaceLandmarker with bundled WASM and model,
 * with GPU delegate and automatic CPU fallback.
 */
async function initFaceLandmarker(): Promise<void> {
  if (faceLandmarker || isLandmarkerLoading) return;
  isLandmarkerLoading = true;
  console.log('[Handsfree Offscreen] Initializing MediaPipe FaceLandmarker...');

  try {
    const modelAssetPath = chrome.runtime.getURL('mediapipe/models/face_landmarker.task');

    console.log('[Handsfree Offscreen] Fetching face model binary from:', modelAssetPath);
    const modelResponse = await fetch(modelAssetPath);
    if (!modelResponse.ok) {
      throw new Error(`Failed to load face_landmarker.task: HTTP ${modelResponse.status}`);
    }
    const modelArrayBuffer = await modelResponse.arrayBuffer();
    const modelAssetBuffer = new Uint8Array(modelArrayBuffer);
    console.log(`[Handsfree Offscreen] Face model loaded: ${modelAssetBuffer.byteLength} bytes`);

    const vision = await getVisionResolver();

    // 1. Attempt GPU delegate
    try {
      console.log('[Handsfree Offscreen] Attempting FaceLandmarker with GPU delegate...');
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      });
      console.log('[Handsfree Offscreen] FaceLandmarker initialized with GPU delegate');
    } catch (gpuError) {
      console.warn('[Handsfree Offscreen] GPU delegate failed, falling back to CPU:', gpuError);
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      });
      console.log('[Handsfree Offscreen] FaceLandmarker initialized with CPU delegate');
    }

    isLandmarkerReady = true;
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Handsfree Offscreen] Fatal: failed to initialize FaceLandmarker:', error);
    sendStatus({
      cameraStatus: 'error',
      errorMessage: error?.message || 'Failed to load MediaPipe FaceLandmarker model',
    });
  } finally {
    isLandmarkerLoading = false;
  }
}

/**
 * Reset neutral pose and center cursor.
 */
function resetNeutralPose(): void {
  neutralPose = null;
  filterX.reset();
  filterY.reset();
  cursorX = 0.5;
  cursorY = 0.5;
  lastTrackingTimestamp = 0;
  console.log('[Handsfree Offscreen] Neutral pose reset. Next detected pose will set center.');
}

/**
 * Re-center neutral pose to current head position in under a second.
 */
function recenterPose(): void {
  if (lastFilteredPose) {
    neutralPose = { x: lastFilteredPose.x, y: lastFilteredPose.y };
  } else {
    neutralPose = null;
  }
  cursorX = 0.5;
  cursorY = 0.5;
  lastTrackingTimestamp = performance.now();
  console.log('[Handsfree Offscreen] Neutral pose re-centered for head tracking');
}

/**
 * Ensure head tracking mode is active.
 */
function switchMode(_newMode?: TrackingMode): void {
  currentSettings.mode = 'head';
  neutralPose = null;
  filterX.reset();
  filterY.reset();
  lastTrackingTimestamp = performance.now();

  if (!isLandmarkerReady) {
    initFaceLandmarker();
  }

  sendStatus({ mode: 'head' });
}

/**
 * Process a single video frame for face landmarks (head mode).
 */
function processFaceFrame(now: number): void {
  if (!faceLandmarker || !offscreenVideo || !isPipelineRunning) return;

  try {
    const results = faceLandmarker.detectForVideo(offscreenVideo, now);

    const firstFace = results.faceLandmarks?.[0];
    if (firstFace && firstFace.length > 1 && firstFace[1]) {
      const noseTip = firstFace[1];
      lastFaceDetectedTime = Date.now();

      // Auto-resume if tracking was auto-paused due to face loss
      if (hasAutoPaused) {
        console.log('[Handsfree Offscreen] Face re-acquired! Auto-resuming tracking.');
        hasAutoPaused = false;
        isTrackingPaused = false;
        resetNeutralPose();
        chrome.runtime
          .sendMessage({
            type: 'COMMAND',
            payload: { command: 'resume', source: 'ui' },
            source: 'offscreen',
          })
          .catch(() => {});
        sendStatus({ cameraStatus: 'running' });
      }

      // Extract yaw and pitch from facial transformation matrix
      let yawRad = 0;
      let pitchRad = 0;
      const matrix = results.facialTransformationMatrixes?.[0];
      if (matrix && matrix.data && matrix.data.length >= 16) {
        const m = matrix.data;
        const r02 = m[8] ?? 0;
        const r12 = m[9] ?? 0;
        const r22 = m[10] ?? 1;

        pitchRad = Math.atan2(-r12, Math.sqrt(r02 * r02 + r22 * r22));
        yawRad = Math.atan2(-r02, r22);
      }

      const normYaw = Math.max(-1, Math.min(1, yawRad / 0.5));
      const normPitch = Math.max(-1, Math.min(1, pitchRad / 0.4));

      const normNoseX = Math.max(-1, Math.min(1, (0.5 - noseTip.x) * 2.5));
      const normNoseY = Math.max(-1, Math.min(1, (noseTip.y - 0.5) * 2.5));

      const rawPoseX = Math.max(-1, Math.min(1, 0.65 * normYaw + 0.35 * normNoseX));
      const rawPoseY = Math.max(-1, Math.min(1, 0.65 * normPitch + 0.35 * normNoseY));

      const filteredPoseX = filterX.filter(rawPoseX, now);
      const filteredPoseY = filterY.filter(rawPoseY, now);
      lastFilteredPose = { x: filteredPoseX, y: filteredPoseY };

      if (!neutralPose) {
        neutralPose = { x: filteredPoseX, y: filteredPoseY };
        console.log('[Handsfree Offscreen] Stored neutralPose:', neutralPose);
      }

      if (!isTrackingPaused) {
        const diffX = filteredPoseX - neutralPose.x;
        const diffY = filteredPoseY - neutralPose.y;

        const DEAD_ZONE = 0.025;

        let curvedX = 0;
        const absDiffX = Math.abs(diffX);
        if (absDiffX > DEAD_ZONE) {
          const usableRangeX = 0.32;
          const normDeflectionX = (absDiffX - DEAD_ZONE) / usableRangeX;
          const responseX = Math.min(1.3, Math.pow(normDeflectionX, 1.2));
          curvedX = Math.sign(diffX) * responseX;
        }

        let curvedY = 0;
        const absDiffY = Math.abs(diffY);
        if (absDiffY > DEAD_ZONE) {
          const usableRangeY = 0.24;
          const normDeflectionY = (absDiffY - DEAD_ZONE) / usableRangeY;
          const responseY = Math.min(1.3, Math.pow(normDeflectionY, 1.2));
          curvedY = Math.sign(diffY) * responseY;
        }

        const dtSec =
          lastTrackingTimestamp > 0
            ? Math.min((now - lastTrackingTimestamp) / 1000.0, 0.066)
            : 0.033;
        lastTrackingTimestamp = now;

        const baseSpeed = 0.6;
        const userSensitivity = currentSettings.sensitivity;
        const cursorDeltaX = curvedX * baseSpeed * userSensitivity * dtSec;
        const cursorDeltaY = curvedY * baseSpeed * userSensitivity * dtSec;

        cursorX = Math.max(0, Math.min(1, cursorX + cursorDeltaX));
        cursorY = Math.max(0, Math.min(1, cursorY + cursorDeltaY));
      }

      chrome.runtime
        .sendMessage({
          type: 'POSE_FRAME',
          payload: {
            x: cursorX,
            y: cursorY,
            confidence: 0.95,
            timestamp: now,
            mode: 'head',
            fps: currentFps,
            rawPose: { x: filteredPoseX, y: filteredPoseY },
          },
          source: 'offscreen',
        })
        .catch(() => {});
    } else {
      const nowMs = Date.now();
      const timeSinceFace = nowMs - lastFaceDetectedTime;

      chrome.runtime
        .sendMessage({
          type: 'POSE_FRAME',
          payload: {
            x: cursorX,
            y: cursorY,
            confidence: 0,
            timestamp: now,
            mode: 'head',
            fps: currentFps,
          },
          source: 'offscreen',
        })
        .catch(() => {});

      if (
        lastFaceDetectedTime > 0 &&
        timeSinceFace >= 3000 &&
        !hasAutoPaused &&
        !isTrackingPaused
      ) {
        console.warn('[Handsfree Offscreen] No face detected for 3s. Auto-pausing tracking.');
        hasAutoPaused = true;
        isTrackingPaused = true;
        chrome.runtime
          .sendMessage({
            type: 'COMMAND',
            payload: { command: 'pause', source: 'ui' },
            source: 'offscreen',
          })
          .catch(() => {});
        sendStatus({
          cameraStatus: 'running',
          confidence: 0,
          errorMessage: 'Face lost: auto-paused',
        });
      }
    }
  } catch (err) {
    console.error('[Handsfree Offscreen] Face frame processing error:', err);
  }
}

/**
 * Process a single video frame for head tracking.
 */
function processDetectionFrame(now: number): void {
  if (!offscreenVideo || !isPipelineRunning) return;
  if (offscreenVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  // Track FPS dynamically
  frameCount++;
  const fpsElapsed = now - fpsLastTime;
  if (fpsElapsed >= 1000) {
    currentFps = Math.max(1, Math.round((frameCount * 1000) / fpsElapsed));
    frameCount = 0;
    fpsLastTime = now;
  }

  if (!faceLandmarker) {
    if (!isLandmarkerLoading) {
      initFaceLandmarker();
    }
    return;
  }
  processFaceFrame(now);
}

let trackingTimerId: number | null = null;
let isProcessingFrame = false;

/**
 * Start 30fps detection loop using high-precision timer
 */
function startTrackingLoop(): void {
  stopTrackingLoop();
  console.log('[Handsfree Offscreen] Starting continuous 30fps tracking loop');

  const onTick = () => {
    if (!isPipelineRunning || isProcessingFrame) return;
    isProcessingFrame = true;
    try {
      processDetectionFrame(performance.now());
    } finally {
      isProcessingFrame = false;
    }
  };

  // Run at steady 30fps (every 33ms)
  trackingTimerId = window.setInterval(onTick, 33);
}

/**
 * Stop tracking loop
 */
function stopTrackingLoop(): void {
  if (trackingTimerId !== null) {
    clearInterval(trackingTimerId);
    trackingTimerId = null;
  }
  isProcessingFrame = false;
}

// Speech Engine Manager abstraction (WebSpeech and Vosk engines)
const speechManager = new SpeechEngineManager(currentSettings.voiceEngine, {
  onTranscript: (event) => {
    chrome.runtime
      .sendMessage({
        type: 'SPEECH_RESULT',
        payload: {
          text: event.text,
          confidence: event.confidence,
          isFinal: event.isFinal,
        },
        source: 'offscreen',
      } as HandsfreeMessage)
      .catch(() => {});

    sendSpikeEvent({
      event: 'result',
      engine: 'offscreen',
      transcript: event.text,
      isFinal: event.isFinal,
      details: `[${event.engine}] "${event.text}" (final=${event.isFinal})`,
    });
  },
  onSpeechOnset: () => {
    chrome.runtime
      .sendMessage({
        type: 'SPEECH_ONSET',
        payload: { timestamp: Date.now(), engine: 'offscreen' },
        source: 'offscreen',
      } as HandsfreeMessage)
      .catch(() => {});
  },
  onError: (event) => {
    console.warn(`[Handsfree Offscreen] Speech error (${event.engine}):`, event.error);
    sendSpikeEvent({
      event: 'error',
      engine: 'offscreen',
      error: event.error,
      details: event.message,
    });
    sendStatus({
      speechStatus: 'error',
      speechError: event.message,
    });
  },
  onStatusChange: (status, engine) => {
    sendStatus({
      speechStatus: status,
      speechEngine: engine === 'vosk' ? 'offscreen-vosk' : 'offscreen-webspeech',
    });
  },
});
/**
 * Feasibility Spike Test: Attempt Web Speech API inside Chrome Offscreen Document
 */
function runWebSpeechSpike(): void {
  const windowWithSpeech = window as unknown as {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  };
  const SpeechRecognition =
    windowWithSpeech.webkitSpeechRecognition || windowWithSpeech.SpeechRecognition;

  if (!SpeechRecognition) {
    console.warn(
      '[Handsfree Offscreen Spike] Web Speech API (webkitSpeechRecognition) is undefined',
    );
    sendSpikeEvent({
      event: 'error',
      engine: 'offscreen',
      error: 'api_undefined',
      details: 'webkitSpeechRecognition is not defined in this offscreen window context.',
    });
    sendStatus({
      speechStatus: 'unsupported',
      speechError: 'SpeechRecognition not defined in offscreen context',
    });
    return;
  }

  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Ignore abort errors
    }
    recognition = null;
  }

  try {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      sendSpikeEvent({
        event: 'start',
        engine: 'offscreen',
        details: 'Speech recognition engine started in offscreen document.',
      });
      sendStatus({ speechStatus: 'listening', speechEngine: 'offscreen-webspeech' });
    };

    recognition.onaudiostart = () => {
      sendSpikeEvent({
        event: 'audiostart',
        engine: 'offscreen',
        details: 'Audio capture started in offscreen document.',
      });
    };

    recognition.onspeechstart = () => {
      sendSpikeEvent({
        event: 'speechstart',
        engine: 'offscreen',
        details: 'Sound/speech detected in offscreen audio stream.',
      });
    };

    recognition.onspeechend = () => {
      sendSpikeEvent({
        event: 'speechend',
        engine: 'offscreen',
        details: 'Speech sound ended in offscreen document.',
      });
    };

    recognition.onaudioend = () => {
      sendSpikeEvent({
        event: 'audioend',
        engine: 'offscreen',
        details: 'Audio stream ended in offscreen document.',
      });
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (!item) continue;
        const text = item[0]?.transcript || '';
        if (item.isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      const activeText = (finalTranscript || interimTranscript).trim();
      const isFinal = Boolean(finalTranscript);

      sendSpikeEvent({
        event: 'result',
        engine: 'offscreen',
        transcript: activeText,
        isFinal,
        details: `Transcript received from offscreen Web Speech API: "${activeText}"`,
      });

      const speechMsg: HandsfreeMessage = {
        type: 'SPEECH_RESULT',
        payload: {
          text: activeText,
          confidence: event.results[0]?.[0]?.confidence ?? 0.95,
          isFinal,
        },
        source: 'offscreen',
      };
      chrome.runtime.sendMessage(speechMsg).catch(() => {});
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      const errCode = event.error || 'unknown_error';
      const errMsg = event.message || `Speech recognition error event: ${errCode}`;
      console.error('[Handsfree Offscreen Spike] onerror received:', errCode, errMsg);

      sendSpikeEvent({
        event: 'error',
        engine: 'offscreen',
        error: errCode,
        details: `Offscreen recognition failed with error "${errCode}". Reason: ${errMsg}.`,
      });

      sendStatus({
        speechStatus: 'error',
        speechError: `Offscreen error: ${errCode}`,
      });
    };

    recognition.onend = () => {
      sendSpikeEvent({
        event: 'end',
        engine: 'offscreen',
        details: 'Speech recognition service disconnected or ended.',
      });
    };

    recognition.start();
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Handsfree Offscreen Spike] Exception during recognition.start():', error);
    sendSpikeEvent({
      event: 'error',
      engine: 'offscreen',
      error: 'start_exception',
      details: `Exception invoking recognition.start(): ${error?.message || String(error)}`,
    });
    sendStatus({
      speechStatus: 'error',
      speechError: error?.message || 'Failed to start offscreen speech recognition',
    });
  }
}

let isPipelineStarting = false;

/**
 * Start Webcam (640x480 @ ideal 30fps) and Microphone
 */
async function startMediaPipeline(): Promise<void> {
  if (isPipelineRunning) {
    console.log('[Handsfree Offscreen] Pipeline already running, ignoring start request');
    return;
  }
  if (isPipelineStarting) {
    console.log('[Handsfree Offscreen] Pipeline currently starting, ignoring duplicate call');
    return;
  }
  isPipelineStarting = true;

  try {
    console.log('[Handsfree Offscreen] Requesting getUserMedia at 640x480 @ 30fps...');
    sendStatus({ cameraStatus: 'starting', micStatus: 'starting' });

    try {
      currentStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });
    } catch (audioErr) {
      console.warn(
        '[Handsfree Offscreen] Audio capture failed, falling back to video only:',
        audioErr,
      );
      currentStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
    }

    if (offscreenVideo) {
      if (offscreenVideo.srcObject !== currentStream) {
        offscreenVideo.srcObject = currentStream;
      }
      try {
        await offscreenVideo.play();
      } catch (playErr: unknown) {
        const pErr = playErr as Error;
        if (pErr.name !== 'AbortError') {
          console.warn('[Handsfree Offscreen] video.play() error:', pErr);
        }
      }
    }

    isPipelineRunning = true;
    isTrackingPaused = false;
    hasAutoPaused = false;
    lastFaceDetectedTime = Date.now();
    resetNeutralPose();

    console.log('[Handsfree Offscreen] Webcam stream acquired');

    // Ensure active face model is initialized
    if (!isLandmarkerReady) {
      await initFaceLandmarker();
    }

    startTrackingLoop();

    sendStatus({
      cameraStatus: 'running',
      micStatus: currentStream.getAudioTracks().length > 0 ? 'running' : 'idle',
      fps: 30,
    });

    // Start speech recognition engine abstraction (WebSpeech / Vosk)
    speechManager.start(currentStream);
  } catch (err: unknown) {
    const error = err as Error;
    const errorDetails = error?.name ? `${error.name}: ${error.message}` : String(error);
    console.warn('[Handsfree Offscreen] getUserMedia failed:', errorDetails);
    isPipelineRunning = false;
    const isPermissionError =
      error?.name === 'NotAllowedError' ||
      (error?.message && error.message.toLowerCase().includes('permission'));
    sendStatus({
      cameraStatus: isPermissionError ? 'denied' : 'error',
      micStatus: isPermissionError ? 'denied' : 'error',
      errorMessage: isPermissionError
        ? 'Camera permission denied. Click to open setup page.'
        : errorDetails,
    });
  } finally {
    isPipelineStarting = false;
  }
}

/**
 * Stop media pipeline and release all hardware tracks
 */
function stopMediaPipeline(): void {
  console.log('[Handsfree Offscreen] Stopping media pipeline...');
  isPipelineRunning = false;
  stopTrackingLoop();
  speechManager.stop();

  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }

  if (offscreenVideo) {
    offscreenVideo.srcObject = null;
  }

  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Ignore
    }
    recognition = null;
  }

  sendStatus({
    cameraStatus: 'idle',
    micStatus: 'idle',
    speechStatus: 'idle',
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message: HandsfreeMessage, _sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'COMMAND') {
    const cmd = message.payload.command;
    console.log('[Handsfree Offscreen] Command received:', cmd);

    if (cmd === 'start') {
      isTrackingPaused = false;
      hasAutoPaused = false;
      startMediaPipeline();
      sendResponse?.({ status: 'starting' });
    } else if (cmd === 'resume') {
      isTrackingPaused = false;
      hasAutoPaused = false;
      lastFaceDetectedTime = Date.now();
      resetNeutralPose();
      sendStatus({ cameraStatus: 'running' });
      sendResponse?.({ status: 'resumed' });
    } else if (cmd === 'pause') {
      isTrackingPaused = true;
      sendStatus({ cameraStatus: 'running' });
      sendResponse?.({ status: 'paused' });
    } else if (cmd === 'toggle-pause') {
      isTrackingPaused = !isTrackingPaused;
      hasAutoPaused = false;
      lastFaceDetectedTime = Date.now();
      if (!isTrackingPaused) {
        resetNeutralPose();
      }
      sendStatus({ cameraStatus: 'running' });
      sendResponse?.({ status: isTrackingPaused ? 'paused' : 'resumed' });
    } else if (cmd === 'toggle-mode' || cmd === 'set-mode-head') {
      switchMode('head');
      sendResponse?.({ status: 'mode_switched', mode: 'head' });
    } else if (cmd === 'stop') {
      stopMediaPipeline();
      sendResponse?.({ status: 'stopped' });
    } else if (cmd === 'recalibrate') {
      resetNeutralPose();
      sendResponse?.({ status: 'recalibrated' });
    } else if (cmd === 'recenter') {
      recenterPose();
      sendResponse?.({ status: 'recentered' });
    } else if (cmd === 'test-speech-spike') {
      runWebSpeechSpike();
      sendResponse?.({ status: 'spike_triggered' });
    }
  } else if (message.type === 'SETTINGS_UPDATE') {
    getSettings().then((settings) => {
      const modeChanged = settings.mode !== currentSettings.mode;
      const engineChanged = settings.voiceEngine !== currentSettings.voiceEngine;
      currentSettings = settings;
      if (engineChanged) {
        speechManager.setEngine(settings.voiceEngine);
      }
      filterX.updateConfig(settings.filter);
      filterY.updateConfig(settings.filter);
      if (modeChanged) {
        switchMode(settings.mode);
      }
      console.log('[Handsfree Offscreen] Settings updated in tracking loop:', currentSettings);
    });
  } else if (message.type === 'GET_STATUS') {
    sendStatus({});
    sendResponse?.({ running: isPipelineRunning });
  }
});

// Pre-initialize face landmarker upon offscreen creation
initFaceLandmarker().catch(() => {});

// Announce offscreen readiness to background to eliminate lifecycle race conditions
chrome.runtime
  .sendMessage({
    type: 'COMMAND',
    payload: { command: 'offscreen-ready', source: 'ui' },
    source: 'offscreen',
  } as HandsfreeMessage)
  .catch(() => {});
