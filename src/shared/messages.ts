import type { HandsfreeSettings, TrackingMode } from './settings';

export type MessageSource =
  'offscreen' | 'background' | 'content' | 'popup' | 'options' | 'setup' | 'voice-host';

export interface PoseFrame {
  x: number;
  y: number;
  confidence: number;
  timestamp: number;
  mode: TrackingMode;
  fps?: number;
  rawPose?: { x: number; y: number };
}

export interface SpeechResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

export type HandsfreeState = 'Active' | 'Paused' | 'Dictating';

export type HandsfreeCommand =
  | 'toggle'
  | 'start'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'toggle-pause'
  | 'toggle-mode'
  | 'set-mode-head'
  | 'set-mode-hand'
  | 'set-mode-eye'
  | 'set-state'
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'drag'
  | 'drop'
  | 'scroll-up'
  | 'scroll-down'
  | 'page-up'
  | 'page-down'
  | 'scroll-top'
  | 'scroll-bottom'
  | 'scroll-stop'
  | 'recalibrate'
  | 'recenter'
  | 'open-setup'
  | 'show-help'
  | 'show-hints'
  | 'hide-hints'
  | 'click-hint'
  | 'open-hint-link'
  | 'dwell-on'
  | 'dwell-off'
  | 'start-typing'
  | 'stop-typing'
  | 'submit'
  | 'search-page'
  | 'zoom-in'
  | 'zoom-out'
  | 'confirm'
  | 'cancel'
  | 'select'
  | 'open'
  | 'open-new-tab'
  | 'scroll-here'
  | 'zoom-here'
  | 'copy-link'
  | 'read-this'
  | 'permissions-granted'
  | 'offscreen-ready'
  | 'test-speech-spike';

export interface StatusUpdate {
  running: boolean;
  paused: boolean;
  state?: HandsfreeState;
  mode: TrackingMode;
  cameraStatus: 'idle' | 'starting' | 'running' | 'error' | 'denied';
  micStatus: 'idle' | 'starting' | 'running' | 'error' | 'denied';
  speechStatus?: 'idle' | 'starting' | 'listening' | 'error' | 'unsupported';
  speechEngine?: 'offscreen-webspeech' | 'offscreen-vosk' | 'voice-host' | 'none';
  errorMessage?: string;
  speechError?: string;
  fps?: number;
  confidence?: number;
}

export interface SpeechSpikePayload {
  event:
    'start' | 'audiostart' | 'speechstart' | 'speechend' | 'audioend' | 'result' | 'error' | 'end';
  engine: 'offscreen' | 'voice-host';
  details?: string;
  error?: string;
  transcript?: string;
  isFinal?: boolean;
  timestamp: number;
}

export interface VoiceFeedbackPayload {
  rawText: string;
  recognized: boolean;
  command?: string;
  message: string;
  confidence?: number;
  playTone?: boolean;
}

export interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

export interface ISpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudioend: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => ISpeechRecognition;

// Discriminated union of messages exchanged across extension components
export type HandsfreeMessage =
  | {
      type: 'POSE_FRAME';
      payload: PoseFrame;
      source?: MessageSource;
    }
  | {
      type: 'SPEECH_RESULT';
      payload: SpeechResult;
      source?: MessageSource;
    }
  | {
      type: 'COMMAND';
      payload: {
        command: HandsfreeCommand | string;
        source?: 'voice' | 'keyboard' | 'ui' | 'setup';
        args?: Record<string, any>;
        rawText?: string;
      };
      source?: MessageSource;
    }
  | {
      type: 'STATUS_UPDATE';
      payload: StatusUpdate;
      source?: MessageSource;
    }
  | {
      type: 'GET_STATUS';
      source?: MessageSource;
    }
  | {
      type: 'SPEECH_ONSET';
      payload: {
        timestamp: number;
        engine?: string;
      };
      source?: MessageSource;
    }
  | {
      type: 'SETTINGS_UPDATE';
      payload: Partial<HandsfreeSettings>;
      source?: MessageSource;
    }
  | {
      type: 'GET_SETTINGS';
      source?: MessageSource;
    }
  | {
      type: 'SPEECH_SPIKE_EVENT';
      payload: SpeechSpikePayload;
      source?: MessageSource;
    }
  | {
      type: 'VOICE_FEEDBACK';
      payload: VoiceFeedbackPayload;
      source?: MessageSource;
    }
  | {
      type: 'EXECUTE_CONTENT_COMMAND';
      payload: {
        action: string;
        args?: Record<string, any>;
      };
      source?: MessageSource;
    };
