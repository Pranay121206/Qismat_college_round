import type {
  ISpeechRecognition,
  ISpeechRecognitionErrorEvent,
  ISpeechRecognitionEvent,
  SpeechRecognitionConstructor,
} from '../shared/messages';
import type { VoiceEngine } from '../shared/settings';

export interface SpeechTranscriptEvent {
  text: string;
  isFinal: boolean;
  confidence: number;
  engine: VoiceEngine;
}

export interface SpeechErrorEvent {
  error: string;
  message: string;
  engine: VoiceEngine;
  fatal?: boolean;
}

export type SpeechStatus = 'idle' | 'starting' | 'listening' | 'error' | 'unsupported';

export interface SpeechEngineCallbacks {
  onTranscript: (event: SpeechTranscriptEvent) => void;
  onError: (event: SpeechErrorEvent) => void;
  onStatusChange?: (status: SpeechStatus, engine: VoiceEngine) => void;
  onSpeechOnset?: () => void;
}

export interface ISpeechEngine {
  readonly name: VoiceEngine;
  start(stream?: MediaStream | null): Promise<void> | void;
  stop(): void;
  isListening(): boolean;
}

/**
 * Native Web Speech API implementation (webkitSpeechRecognition)
 * with robust auto-restart for continuous listening and Chromium offscreen error handling.
 */
export class WebSpeechEngine implements ISpeechEngine {
  readonly name: VoiceEngine = 'webspeech';
  private recognition: ISpeechRecognition | null = null;
  private isRunning = false;
  private restartTimer: number | null = null;
  private consecutiveErrors = 0;
  private callbacks: SpeechEngineCallbacks;
  private customConstructor?: SpeechRecognitionConstructor;
  private hasNotifiedOnset = false;

  constructor(callbacks: SpeechEngineCallbacks, customConstructor?: SpeechRecognitionConstructor) {
    this.callbacks = callbacks;
    this.customConstructor = customConstructor;
  }

  start(): void {
    this.isRunning = true;
    this.consecutiveErrors = 0;
    this.initAndStart();
  }

  private initAndStart(): void {
    if (!this.isRunning) return;

    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    const windowWithSpeech =
      typeof window !== 'undefined'
        ? (window as unknown as {
            webkitSpeechRecognition?: SpeechRecognitionConstructor;
            SpeechRecognition?: SpeechRecognitionConstructor;
          })
        : {};
    const SpeechRecognition =
      this.customConstructor ||
      windowWithSpeech.webkitSpeechRecognition ||
      windowWithSpeech.SpeechRecognition;

    if (!SpeechRecognition) {
      this.callbacks.onStatusChange?.('unsupported', this.name);
      this.callbacks.onError({
        error: 'api_unsupported',
        message: 'Web Speech API is not supported in this browser context.',
        engine: this.name,
        fatal: true,
      });
      return;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore abort errors
      }
      this.recognition = null;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.consecutiveErrors = 0;
        this.hasNotifiedOnset = false;
        this.callbacks.onStatusChange?.('listening', this.name);
        console.log('[Handsfree WebSpeech] Engine listening actively');
      };

      this.recognition.onspeechstart = () => {
        if (!this.hasNotifiedOnset) {
          this.hasNotifiedOnset = true;
          this.callbacks.onSpeechOnset?.();
        }
      };
      this.recognition.onaudiostart = () => {
        if (!this.hasNotifiedOnset) {
          this.hasNotifiedOnset = true;
          this.callbacks.onSpeechOnset?.();
        }
      };
      this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
        if (!this.hasNotifiedOnset) {
          this.hasNotifiedOnset = true;
          this.callbacks.onSpeechOnset?.();
        }
        let interim = '';
        let final = '';
        let maxConfidence = 0.95;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (!item) continue;
          const transcript = item[0]?.transcript || '';
          if (item[0]?.confidence) {
            maxConfidence = item[0].confidence;
          }
          if (item.isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        const activeText = (final || interim).trim();
        const isFinal = Boolean(final);

        if (isFinal) {
          this.hasNotifiedOnset = false;
        }
        if (activeText) {
          this.callbacks.onTranscript({
            text: activeText,
            isFinal,
            confidence: maxConfidence,
            engine: this.name,
          });
        }
      };

      this.recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        const errCode = event.error || 'unknown_error';
        this.consecutiveErrors++;

        let friendlyMessage = `Speech recognition error: ${errCode}`;
        if (errCode === 'not-allowed') {
          // As documented in docs/decisions.md (ADR-001): Chromium offscreen lacks WebContents
          friendlyMessage =
            'Microphone access restricted in offscreen window. Auto-failing over to voice host tab.';
          this.isRunning = false;
        } else if (errCode === 'no-speech') {
          // Normal silence timeout; ignore and let onend auto-restart
          return;
        } else if (errCode === 'audio-capture') {
          friendlyMessage =
            'Audio capture failed. Ensure your microphone is connected and allowed.';
        }

        this.callbacks.onStatusChange?.('error', this.name);
        this.callbacks.onError({
          error: errCode,
          message: friendlyMessage,
          engine: this.name,
          fatal: errCode === 'not-allowed',
        });
      };

      this.recognition.onend = () => {
        this.hasNotifiedOnset = false;
        // Continuous listening: automatically restart recognition when it ends
        if (this.isRunning) {
          const delay = this.consecutiveErrors > 3 ? 1500 : 250;
          this.restartTimer = window.setTimeout(() => {
            if (this.isRunning) {
              this.initAndStart();
            }
          }, delay);
        } else {
          this.callbacks.onStatusChange?.('idle', this.name);
        }
      };

      this.recognition.start();
    } catch (err: unknown) {
      const error = err as Error;
      console.warn('[Handsfree WebSpeech] Exception during recognition start:', error);
      this.callbacks.onError({
        error: 'start_failed',
        message: error.message || 'Failed to start Web Speech recognition',
        engine: this.name,
      });
      this.callbacks.onStatusChange?.('error', this.name);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
    this.callbacks.onStatusChange?.('idle', this.name);
  }

  isListening(): boolean {
    return this.isRunning;
  }
}

export interface VoskRecognizer {
  acceptWaveform: (data: Float32Array) => boolean;
  result: () => { text: string };
  partialResult: () => { partial: string };
}

/**
 * Offline Vosk Speech Engine (Kaldi WASM pipeline)
 * Conforming to architecture documented in docs/decisions.md (ADR-001)
 * Extracts microphone audio stream via Web Audio API, supports continuous listening
 * and emits interim/final transcripts.
 */
export class VoskEngine implements ISpeechEngine {
  readonly name: VoiceEngine = 'vosk';
  private isRunning = false;
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private callbacks: SpeechEngineCallbacks;
  private stream: MediaStream | null = null;
  private recognizer: VoskRecognizer | null = null;
  private hasNotifiedOnset = false;

  constructor(callbacks: SpeechEngineCallbacks, recognizer?: VoskRecognizer | null) {
    this.callbacks = callbacks;
    if (recognizer) {
      this.recognizer = recognizer;
    }
  }

  setRecognizer(recognizer: VoskRecognizer | null): void {
    this.recognizer = recognizer;
  }

  async start(stream?: MediaStream | null): Promise<void> {
    this.isRunning = true;
    this.stream = stream || null;
    this.callbacks.onStatusChange?.('starting', this.name);

    try {
      // Connect to microphone media stream
      if (!this.stream) {
        try {
          if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
            this.stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: 1,
                sampleRate: { ideal: 16000 },
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
          }
        } catch {
          throw new Error('Microphone permission or capture failed for Vosk engine');
        }
      }

      if (!this.stream) {
        throw new Error('Microphone permission or capture failed for Vosk engine');
      }

      const windowAudio =
        typeof window !== 'undefined'
          ? (window as unknown as {
              AudioContext?: typeof AudioContext;
              webkitAudioContext?: typeof AudioContext;
            })
          : {};
      const AudioCtx = windowAudio.AudioContext || windowAudio.webkitAudioContext;

      if (AudioCtx && this.stream) {
        this.audioContext = new AudioCtx({ sampleRate: 16000 });
        this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.stream);
        // Process 4096-sample audio buffers (16kHz PCM mono)
        this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
          if (!this.isRunning) return;
          const inputData = event.inputBuffer.getChannelData(0);
          this.processPcmChunk(inputData);
        };

        this.mediaStreamSource.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);
      }

      this.callbacks.onStatusChange?.('listening', this.name);
      console.log('[Handsfree Vosk] Offline speech engine listening via AudioContext');
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[Handsfree Vosk] Failed to start Vosk engine:', error);
      this.callbacks.onStatusChange?.('error', this.name);
      this.callbacks.onError({
        error: 'vosk_init_error',
        message: error.message || 'Failed to initialize offline Vosk speech engine',
        engine: this.name,
      });
    }
  }

  processPcmChunk(pcmData: Float32Array): void {
    // Check custom injected recognizer or window.voskRecognizer
    const windowWithVosk =
      typeof window !== 'undefined'
        ? (window as unknown as {
            voskRecognizer?: VoskRecognizer;
          })
        : {};

    const rec = this.recognizer || windowWithVosk.voskRecognizer;

    if (rec) {
      if (rec.acceptWaveform(pcmData)) {
        this.hasNotifiedOnset = false;
        const res = rec.result();
        if (res && res.text) {
          this.callbacks.onTranscript({
            text: res.text.trim(),
            isFinal: true,
            confidence: 0.9,
            engine: this.name,
          });
        }
      } else {
        const partial = rec.partialResult();
        if (partial && partial.partial) {
          if (!this.hasNotifiedOnset) {
            this.hasNotifiedOnset = true;
            this.callbacks.onSpeechOnset?.();
          }
          this.callbacks.onTranscript({
            text: partial.partial.trim(),
            isFinal: false,
            confidence: 0.8,
            engine: this.name,
          });
        }
      }
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.callbacks.onStatusChange?.('idle', this.name);
  }

  isListening(): boolean {
    return this.isRunning;
  }
}

/**
 * Speech Engine Abstraction Manager:
 * Seamlessly selects, switches, and coordinates Speech Recognition engines.
 */
export class SpeechEngineManager {
  private currentEngine: ISpeechEngine;
  private currentEngineType: VoiceEngine;
  private callbacks: SpeechEngineCallbacks;
  private cachedStream: MediaStream | null = null;
  private isStarted = false;
  private customSpeechConstructor?: SpeechRecognitionConstructor;
  private customVoskRecognizer?: VoskRecognizer;

  constructor(
    engineType: VoiceEngine,
    callbacks: SpeechEngineCallbacks,
    options?: {
      speechRecognitionConstructor?: SpeechRecognitionConstructor;
      voskRecognizer?: VoskRecognizer;
    },
  ) {
    this.currentEngineType = engineType;
    this.callbacks = callbacks;
    this.customSpeechConstructor = options?.speechRecognitionConstructor;
    this.customVoskRecognizer = options?.voskRecognizer;
    this.currentEngine = this.createEngine(engineType);
  }

  private createEngine(type: VoiceEngine): ISpeechEngine {
    if (type === 'vosk') {
      return new VoskEngine(this.callbacks, this.customVoskRecognizer);
    }
    return new WebSpeechEngine(this.callbacks, this.customSpeechConstructor);
  }

  get activeEngineType(): VoiceEngine {
    return this.currentEngineType;
  }

  setEngine(type: VoiceEngine): void {
    if (type === this.currentEngineType) return;
    console.log(`[Handsfree Voice] Switching speech engine: ${this.currentEngineType} -> ${type}`);
    const wasRunning = this.isStarted;
    this.stop();
    this.currentEngineType = type;
    this.currentEngine = this.createEngine(type);
    if (wasRunning) {
      this.start(this.cachedStream);
    }
  }

  start(stream?: MediaStream | null): void {
    this.isStarted = true;
    if (stream) {
      this.cachedStream = stream;
    }
    this.currentEngine.start(this.cachedStream);
  }

  stop(): void {
    this.isStarted = false;
    this.currentEngine.stop();
  }

  isListening(): boolean {
    return this.currentEngine.isListening();
  }
}
