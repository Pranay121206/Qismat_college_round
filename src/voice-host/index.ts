import type {
  HandsfreeMessage,
  ISpeechRecognition,
  ISpeechRecognitionErrorEvent,
  ISpeechRecognitionEvent,
  SpeechRecognitionConstructor,
  SpeechSpikePayload,
} from '../shared/messages';

console.log('[Handsfree VoiceHost] Loaded in pinned extension tab');

const statusText = document.getElementById('statusText');
const transcriptLive = document.getElementById('transcriptLive');

let recognition: ISpeechRecognition | null = null;
let hasSentVoiceHostOnset = false;

function sendSpeechOnset(): void {
  const msg: HandsfreeMessage = {
    type: 'SPEECH_ONSET',
    payload: { timestamp: Date.now(), engine: 'voice-host' },
    source: 'voice-host',
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}
let isListening = true;

function sendSpikeEvent(payload: Omit<SpeechSpikePayload, 'timestamp'>): void {
  const fullPayload: SpeechSpikePayload = {
    ...payload,
    timestamp: Date.now(),
  };
  const msg: HandsfreeMessage = {
    type: 'SPEECH_SPIKE_EVENT',
    payload: fullPayload,
    source: 'voice-host',
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function startListening(): void {
  const windowWithSpeech = window as unknown as {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  };
  const SpeechRecognition =
    windowWithSpeech.webkitSpeechRecognition || windowWithSpeech.SpeechRecognition;

  if (!SpeechRecognition) {
    if (statusText) statusText.textContent = 'Web Speech API not supported in browser';
    sendSpikeEvent({
      event: 'error',
      engine: 'voice-host',
      error: 'api_unsupported',
      details: 'webkitSpeechRecognition is unavailable in window context.',
    });
    return;
  }

  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Ignore
    }
  }

  try {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onspeechstart = () => {
      if (!hasSentVoiceHostOnset) {
        hasSentVoiceHostOnset = true;
        sendSpeechOnset();
      }
    };
    recognition.onstart = () => {
      hasSentVoiceHostOnset = false;
      console.log('[Handsfree VoiceHost] SpeechRecognition started');
      if (statusText) statusText.textContent = 'Listening actively for speech commands';
      sendSpikeEvent({
        event: 'start',
        engine: 'voice-host',
        details: 'Voice host listening actively in pinned tab.',
      });

      chrome.runtime
        .sendMessage({
          type: 'STATUS_UPDATE',
          payload: {
            running: true,
            paused: false,
            mode: 'head',
            cameraStatus: 'running',
            micStatus: 'running',
            speechStatus: 'listening',
            speechEngine: 'voice-host',
          },
          source: 'voice-host',
        } as HandsfreeMessage)
        .catch(() => {});
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (!item) continue;
        const text = item[0]?.transcript || '';
        if (item.isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      const activeText = (final || interim).trim();
      const isFinal = Boolean(final);
      if (!hasSentVoiceHostOnset) {
        hasSentVoiceHostOnset = true;
        sendSpeechOnset();
      }
      if (isFinal) {
        hasSentVoiceHostOnset = false;
      }

      if (transcriptLive && activeText) {
        transcriptLive.textContent = activeText;
        transcriptLive.className = isFinal ? 'transcript-history' : 'transcript-active';
      }

      // Send spike event
      sendSpikeEvent({
        event: 'result',
        engine: 'voice-host',
        transcript: activeText,
        isFinal,
        details: `Voice-host recognized: "${activeText}"`,
      });

      // Relay speech result to message bus
      const speechMsg: HandsfreeMessage = {
        type: 'SPEECH_RESULT',
        payload: {
          text: activeText,
          confidence: event.results[0]?.[0]?.confidence ?? 0.95,
          isFinal,
        },
        source: 'voice-host',
      };
      chrome.runtime.sendMessage(speechMsg).catch(() => {});
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      const err = event.error || 'unknown_error';
      console.warn('[Handsfree VoiceHost] onerror:', err);
      sendSpikeEvent({
        event: 'error',
        engine: 'voice-host',
        error: err,
        details: `Voice host encountered error: ${err}`,
      });
      if (err === 'not-allowed') {
        if (statusText) statusText.textContent = 'Microphone access denied. Allow mic permissions.';
      }
    };

    recognition.onend = () => {
      hasSentVoiceHostOnset = false;
      console.log('[Handsfree VoiceHost] onend triggered');
      sendSpikeEvent({
        event: 'end',
        engine: 'voice-host',
        details: 'Voice host recognition session ended.',
      });

      // Auto-restart if we are still active
      if (isListening) {
        setTimeout(() => {
          if (isListening && recognition) {
            try {
              recognition.start();
            } catch {
              // Ignore
            }
          }
        }, 300);
      }
    };

    recognition.start();
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Handsfree VoiceHost] Failed to start recognition:', error);
    sendSpikeEvent({
      event: 'error',
      engine: 'voice-host',
      error: 'start_failed',
      details: error?.message || 'Failed to start voice-host recognition',
    });
  }
}

function stopListening(): void {
  isListening = false;
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Ignore
    }
    recognition = null;
  }
  if (statusText) statusText.textContent = 'Voice recognition stopped';
}

// Listen for commands
chrome.runtime.onMessage.addListener((message: HandsfreeMessage, _sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'COMMAND') {
    const cmd = message.payload.command;
    if (cmd === 'start' || cmd === 'resume') {
      isListening = true;
      startListening();
      sendResponse?.({ status: 'voice_host_started' });
    } else if (cmd === 'stop' || cmd === 'pause') {
      stopListening();
      sendResponse?.({ status: 'voice_host_stopped' });
    }
  }
});

// Auto-start listening on load
startListening();
