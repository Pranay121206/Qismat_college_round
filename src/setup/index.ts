import type { HandsfreeMessage, SpeechSpikePayload, StatusUpdate } from '../shared/messages';
import { createHandsfreeOverlay } from '../shared/overlay';
import { getSettings } from '../shared/settings';

let audioContext: AudioContext | null = null;
let micStream: MediaStream | null = null;
let animFrameId: number | null = null;
let eventLogCount = 0;
let overlay: ReturnType<typeof createHandsfreeOverlay> | null = null;

function formatTime(timestamp: number = Date.now()): string {
  const d = new Date(timestamp);
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function appendLog(
  text: string,
  type: 'system' | 'info' | 'success' | 'error' | 'speech' = 'info',
): void {
  const logEl = document.getElementById('spikeEventLog');
  const countEl = document.getElementById('eventCount');
  if (!logEl) return;

  eventLogCount++;
  if (countEl) countEl.textContent = String(eventLogCount);

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${formatTime()}] ${text}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function updateTranscriptUI(text: string, isFinal: boolean, engine: string): void {
  const display = document.getElementById('transcriptDisplay');
  const liveDot = document.getElementById('transcriptLiveDot');
  const engineBadge = document.getElementById('transcriptEngineBadge');

  if (liveDot) liveDot.className = 'live-dot active';
  if (engineBadge) engineBadge.textContent = `Engine: ${engine}`;

  if (!display) return;

  // Clear placeholder if present
  const placeholder = display.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  if (isFinal) {
    const finalItem = document.createElement('div');
    finalItem.className = 'transcript-entry final';
    finalItem.textContent = `"${text}"`;
    display.appendChild(finalItem);
    display.scrollTop = display.scrollHeight;
  } else {
    // Show interim text
    let interimItem = display.querySelector('.transcript-entry.interim');
    if (!interimItem) {
      interimItem = document.createElement('div');
      interimItem.className = 'transcript-entry interim';
      display.appendChild(interimItem);
    }
    interimItem.textContent = `...${text}`;
    display.scrollTop = display.scrollHeight;
  }
}

async function requestPermissions(): Promise<void> {
  const permStatus = document.getElementById('permStatus');
  const deniedGuidance = document.getElementById('deniedGuidance');
  const videoPreview = document.getElementById('videoPreview') as HTMLVideoElement;
  const camFallback = document.getElementById('camFallback');
  const camBadge = document.getElementById('camBadge');
  const meterFill = document.getElementById('meterFill');
  const meterPercentText = document.getElementById('meterPercentText');
  const micFallback = document.getElementById('micFallback');
  const micBadge = document.getElementById('micBadge');
  const finishBtn = document.getElementById('finishBtn') as HTMLButtonElement;
  const startPipelineBtn = document.getElementById('startPipelineBtn') as HTMLButtonElement;

  try {
    if (permStatus) {
      permStatus.textContent = 'Status: Requesting camera & mic access...';
      permStatus.style.color = '#38bdf8';
    }
    if (deniedGuidance) deniedGuidance.style.display = 'none';

    // Request permissions for camera (640x480 @ 30fps) and mic
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: { ideal: 30 } },
      audio: true,
    });

    // Camera preview
    if (videoPreview && camFallback) {
      videoPreview.srcObject = stream;
      videoPreview.style.display = 'block';
      camFallback.style.display = 'none';
      if (camBadge) {
        camBadge.textContent = 'Active (640x480)';
        camBadge.className = 'indicator-badge active';
      }
    }

    // Audio level meter using Web Audio Analyser
    micStream = stream;
    audioContext = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function updateMeter(): void {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (const val of dataArray) {
        sum += val;
      }
      const avg = sum / bufferLength;
      const percent = Math.min(100, Math.round((avg / 128) * 100));

      if (meterFill) meterFill.style.width = `${percent}%`;
      if (meterPercentText) meterPercentText.textContent = `${percent}%`;

      if (micBadge) {
        micBadge.textContent = percent > 5 ? 'Sound Detected' : 'Active';
        micBadge.className = 'indicator-badge active';
      }
      if (micFallback) micFallback.style.display = 'none';

      animFrameId = requestAnimationFrame(updateMeter);
    }
    updateMeter();

    if (permStatus) {
      permStatus.textContent = 'Status: Camera & Microphone permissions granted!';
      permStatus.style.color = '#10b981';
    }

    // Persist permissionsGranted flag in chrome.storage.local
    await chrome.storage.local.set({ permissionsGranted: true });
    appendLog('Permissions granted by user and saved to local storage.', 'success');

    // Notify background that camera access is granted and start the pipeline
    chrome.runtime
      .sendMessage({
        type: 'COMMAND',
        payload: { command: 'permissions-granted', source: 'setup' },
      })
      .catch(() => {});

    if (finishBtn) finishBtn.disabled = false;
    if (startPipelineBtn) startPipelineBtn.disabled = false;

    // Mark onboarding as ready
    await chrome.storage.local.set({ handsfree_onboarding_completed: true });
    appendLog(
      'Setup complete! Head tracking is active. You can close this tab or test controls.',
      'success',
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Handsfree Setup] Permission error:', error);
    appendLog(`Permission denied: ${error?.message || String(error)}`, 'error');

    if (permStatus) {
      permStatus.textContent = `Status: Permission denied (${error?.name || 'Error'}). Follow steps below.`;
      permStatus.style.color = '#ef4444';
    }
    if (deniedGuidance) {
      deniedGuidance.style.display = 'flex';
    }
    if (camBadge) {
      camBadge.textContent = 'Blocked';
      camBadge.className = 'indicator-badge inactive';
    }
    if (micBadge) {
      micBadge.textContent = 'Blocked';
      micBadge.className = 'indicator-badge inactive';
    }
  }
}

function handleStatusUpdate(status: StatusUpdate): void {
  const offscreenStatusVal = document.getElementById('offscreenStatusVal');
  const webcamStatusVal = document.getElementById('webcamStatusVal');
  const speechEngineVal = document.getElementById('speechEngineVal');
  const speechStatusVal = document.getElementById('speechStatusVal');
  const startPipelineBtn = document.getElementById('startPipelineBtn') as HTMLButtonElement;
  const stopPipelineBtn = document.getElementById('stopPipelineBtn') as HTMLButtonElement;

  if (offscreenStatusVal) {
    offscreenStatusVal.textContent = status.running ? 'Running' : 'Idle';
    offscreenStatusVal.style.color = status.running ? '#10b981' : '#9ca3af';
  }
  if (webcamStatusVal) {
    webcamStatusVal.textContent = status.cameraStatus;
    webcamStatusVal.style.color =
      status.cameraStatus === 'running'
        ? '#10b981'
        : status.cameraStatus === 'error'
          ? '#ef4444'
          : '#9ca3af';
  }
  if (speechEngineVal) {
    speechEngineVal.textContent = status.speechEngine || 'none';
  }
  if (speechStatusVal) {
    speechStatusVal.textContent = status.speechStatus || 'idle';
    speechStatusVal.style.color =
      status.speechStatus === 'listening'
        ? '#10b981'
        : status.speechStatus === 'error'
          ? '#f59e0b'
          : '#9ca3af';
  }

  if (startPipelineBtn) startPipelineBtn.disabled = status.running;
  if (stopPipelineBtn) stopPipelineBtn.disabled = !status.running;
}

function handleSpikeEvent(payload: SpeechSpikePayload): void {
  const spikeResultTag = document.getElementById('spikeResultTag');
  const spikeResultSummary = document.getElementById('spikeResultSummary');
  const spikeResultDetails = document.getElementById('spikeResultDetails');

  appendLog(
    `[${payload.engine}] ${payload.event.toUpperCase()}: ${payload.transcript ? '"' + payload.transcript + '"' : payload.details || payload.error || ''}`,
    payload.event === 'error' ? 'error' : payload.event === 'result' ? 'speech' : 'info',
  );

  if (payload.event === 'result' && payload.transcript) {
    updateTranscriptUI(payload.transcript, Boolean(payload.isFinal), payload.engine);
  }

  if (payload.engine === 'offscreen' && payload.event === 'error') {
    if (spikeResultTag) {
      spikeResultTag.textContent = 'OFFSCREEN LIMITATION SPIKE RESULT';
      spikeResultTag.style.background = '#ef4444';
    }
    if (spikeResultSummary) {
      spikeResultSummary.textContent = `Offscreen Speech Error: "${payload.error || 'restricted'}"`;
      spikeResultSummary.style.color = '#fca5a5';
    }
    if (spikeResultDetails) {
      spikeResultDetails.textContent =
        'Spike Finding: webkitSpeechRecognition in Chrome MV3 offscreen documents lacks SpeechRecognitionDispatcherHost backend binding and fails with "' +
        (payload.error || 'not-allowed') +
        '". Handsfree automatically fails over to the pinned Voice Host tab.';
    }
  } else if (payload.engine === 'offscreen' && payload.event === 'start') {
    if (spikeResultTag) {
      spikeResultTag.textContent = 'OFFSCREEN RUNNING';
      spikeResultTag.style.background = '#10b981';
    }
    if (spikeResultSummary) {
      spikeResultSummary.textContent =
        'Speech recognition successfully started in offscreen document!';
    }
  } else if (payload.engine === 'voice-host' && payload.event === 'start') {
    if (spikeResultTag) {
      spikeResultTag.textContent = 'VOICE HOST FALLBACK ACTIVE';
      spikeResultTag.style.background = '#6366f1';
    }
    if (spikeResultSummary) {
      spikeResultSummary.textContent = 'Voice Host (pinned tab) is listening for speech commands.';
    }
  }
}

async function initSetup(): Promise<void> {
  const requestPermsBtn = document.getElementById('requestPermsBtn');
  const retryPermsBtn = document.getElementById('retryPermsBtn');
  const startPipelineBtn = document.getElementById('startPipelineBtn');
  const stopPipelineBtn = document.getElementById('stopPipelineBtn');
  const testSpikeBtn = document.getElementById('testSpikeBtn');
  const finishBtn = document.getElementById('finishBtn');

  requestPermsBtn?.addEventListener('click', requestPermissions);
  retryPermsBtn?.addEventListener('click', requestPermissions);

  startPipelineBtn?.addEventListener('click', () => {
    appendLog('Sending start command to background pipeline...', 'info');
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      payload: { command: 'start', source: 'setup' },
      source: 'setup',
    } as HandsfreeMessage);
  });

  stopPipelineBtn?.addEventListener('click', () => {
    appendLog('Sending stop command to background pipeline...', 'info');
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      payload: { command: 'stop', source: 'setup' },
      source: 'setup',
    } as HandsfreeMessage);
  });

  testSpikeBtn?.addEventListener('click', () => {
    appendLog('Triggering re-test of offscreen speech recognition spike...', 'info');
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      payload: { command: 'test-speech-spike', source: 'setup' },
      source: 'setup',
    } as HandsfreeMessage);
  });

  finishBtn?.addEventListener('click', () => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (audioContext) audioContext.close();
    if (micStream) micStream.getTracks().forEach((track) => track.stop());
    chrome.runtime
      .sendMessage({
        type: 'COMMAND',
        payload: { command: 'permissions-granted', source: 'setup' },
      })
      .catch(() => {});
    window.close();
  });

  // Mount virtual cursor and HUD directly in setup page for immediate verification
  overlay = createHandsfreeOverlay();

  // Listen for Alt+Shift+C recenter shortcut in setup page
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.shiftKey && (e.code === 'KeyC' || e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        overlay?.recenter();
      }
    },
    true,
  );

  // Listen to message bus for status and speech events
  chrome.runtime.onMessage.addListener((message: HandsfreeMessage) => {
    if (!message || !message.type) return;

    if (message.type === 'STATUS_UPDATE') {
      handleStatusUpdate(message.payload);
      overlay?.handleStatusUpdate(message.payload);
    } else if (message.type === 'POSE_FRAME') {
      overlay?.handlePoseFrame(message.payload);
      const { x, y, confidence, fps } = message.payload;
      const statusBox = document.getElementById('pipelineStatusBox');
      if (statusBox) {
        if (confidence >= 0.5) {
          statusBox.textContent = `Head Tracking Active: ${(x * 100).toFixed(0)}% X, ${(y * 100).toFixed(0)}% Y (${Math.round(confidence * 100)}% conf, ${fps || 30} FPS)`;
          statusBox.style.color = '#10b981';
        } else {
          statusBox.textContent = 'Head Tracking: Face lost (look at camera)';
          statusBox.style.color = '#f59e0b';
        }
      }
    } else if (message.type === 'SETTINGS_UPDATE') {
      getSettings().then((s) => overlay?.updateSettings(s));
    } else if (message.type === 'SPEECH_SPIKE_EVENT') {
      handleSpikeEvent(message.payload);
    } else if (message.type === 'SPEECH_RESULT') {
      const text = message.payload.text?.trim().toLowerCase();
      if (text && /\b(center|recenter|re-center)\b/i.test(text)) {
        overlay?.recenter();
      }
      updateTranscriptUI(
        message.payload.text,
        message.payload.isFinal,
        message.source || 'speech-stream',
      );
    }
  });

  // Fetch initial status from background
  try {
    const status = await chrome.runtime.sendMessage({
      type: 'GET_STATUS',
      source: 'setup',
    } as HandsfreeMessage);
    if (status) {
      handleStatusUpdate(status);
    }
  } catch {
    // Background may still be spinning up
  }

  // Check if permissions were previously granted
  const { permissionsGranted } = await chrome.storage.local.get('permissionsGranted');
  if (permissionsGranted) {
    appendLog('Existing permission grant detected in storage. Testing devices...', 'info');
    requestPermissions();
  }
}

document.addEventListener('DOMContentLoaded', initSetup);
