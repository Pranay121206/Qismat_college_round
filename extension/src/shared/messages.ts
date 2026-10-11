export type TrackingMode = 'head' | 'hand';

/** One tracking sample from the offscreen vision pipeline. */
export interface PoseFrame {
  type: 'POSE_FRAME';
  /**
   * Raw feature values (not screen coordinates).
   * head: rawX = nose position between the cheek edges (yaw), rawY = nose position between forehead and chin (pitch).
   * hand: rawX = mirrored index-fingertip x in the camera image, rawY = fingertip y. Both 0..1.
   */
  rawX: number;
  rawY: number;
  confidence: number;
  timestamp: number;
  mode: TrackingMode;
  faceLost?: boolean;
  lightingWarning?: string;
  pinch?: boolean;
  /** Pointer should stay put (mouth open / head tilted) so gestures never move the cursor. */
  hold?: boolean;
}

export interface SpeechResult {
  type: 'SPEECH_RESULT';
  text: string;
  confidence: number;
  isFinal: boolean;
  /** Other recognition guesses for the same phrase; the parser tries these if the best guess is not a command. */
  alts?: string[];
  /** Stable id for one spoken phrase, so interim and final results of it can be matched. */
  utteranceId: string;
  timestamp: number;
}

export interface CommandAction {
  type: 'COMMAND_ACTION';
  action: string;
  payload?: any;
  timestamp: number;
  rawTranscript?: string;
}

export interface OffscreenStatus {
  type: 'OFFSCREEN_STATUS';
  cameraActive: boolean;
  micActive: boolean;
  fps: number;
  confidence: number;
  modelReady: boolean;
  warning?: string;
  /** Human readable problem, shown in the popup and HUD. */
  error?: string;
  voiceError?: string;
}

export interface EngineStatus {
  type: 'ENGINE_STATUS';
  running: boolean;
  /** Tracking is on but the user said "sleep" / pressed pause. */
  asleep: boolean;
  mode: TrackingMode;
  cameraActive: boolean;
  micActive: boolean;
  modelReady: boolean;
  confidence: number;
  fps: number;
  lastCommand?: string;
  lastCommandSuccess?: boolean;
  error?: string;
  voiceError?: string;
  speechTranscript?: string;
  isDictating?: boolean;
}

export type ExtensionMessage =
  | PoseFrame
  | SpeechResult
  | CommandAction
  | EngineStatus
  | OffscreenStatus
  | { type: 'START_ENGINE'; mode?: TrackingMode }
  | { type: 'STOP_ENGINE' }
  | { type: 'TOGGLE_ENGINE' }
  | { type: 'SET_MODE'; mode: TrackingMode }
  | { type: 'RECENTER' }
  | { type: 'GET_STATUS' }
  | { type: 'START_TYPING' }
  | { type: 'STOP_TYPING' }
  | { type: 'START_OFFSCREEN_CAPTURE'; mode: TrackingMode; lang?: string }
  | { type: 'STOP_OFFSCREEN_CAPTURE' }
  | { type: 'SET_SPEECH_LANG'; lang: string };
