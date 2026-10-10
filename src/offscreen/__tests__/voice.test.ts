/* eslint-disable @typescript-eslint/no-this-alias */
import { describe, expect, it, vi } from 'vitest';
import {
  SpeechEngineManager,
  VoskEngine,
  WebSpeechEngine,
  type SpeechErrorEvent,
  type SpeechStatus,
  type SpeechTranscriptEvent,
  type VoskRecognizer,
} from '../voice';
import type {
  ISpeechRecognition,
  ISpeechRecognitionEvent,
  SpeechRecognitionConstructor,
} from '../../shared/messages';

class MockSpeechRecognition implements ISpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onaudioend: (() => void) | null = null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  start = vi.fn(() => {
    if (this.onstart) this.onstart();
  });
  stop = vi.fn(() => {
    if (this.onend) this.onend();
  });
  abort = vi.fn();
}

describe('Speech Engine - WebSpeechEngine', () => {
  it('initializes and reports unsupported if SpeechRecognition API is missing', () => {
    let capturedError: SpeechErrorEvent | undefined;
    let capturedStatus: SpeechStatus | undefined;

    const engine = new WebSpeechEngine({
      onTranscript: vi.fn(),
      onError: (err) => {
        capturedError = err;
      },
      onStatusChange: (status) => {
        capturedStatus = status;
      },
    });

    engine.start();
    expect(capturedStatus).toBe('unsupported');
    expect(capturedError).toBeDefined();
    expect(capturedError?.error).toBe('api_unsupported');
    expect(capturedError?.fatal).toBe(true);
  });

  it('starts recognition using custom/mock SpeechRecognition constructor', () => {
    let capturedStatus: SpeechStatus | null = null;

    const engine = new WebSpeechEngine(
      {
        onTranscript: vi.fn(),
        onError: vi.fn(),
        onStatusChange: (status) => {
          capturedStatus = status;
        },
      },
      MockSpeechRecognition as unknown as SpeechRecognitionConstructor,
    );

    engine.start();
    expect(engine.isListening()).toBe(true);
    expect(capturedStatus).toBe('listening');
  });

  it('emits interim and final transcripts with confidence scores', () => {
    const transcripts: SpeechTranscriptEvent[] = [];
    let mockInstance: MockSpeechRecognition | null = null;

    class TestConstructor extends MockSpeechRecognition {
      constructor() {
        super();
        mockInstance = this;
      }
    }

    const engine = new WebSpeechEngine(
      {
        onTranscript: (evt) => transcripts.push(evt),
        onError: vi.fn(),
        onStatusChange: vi.fn(),
      },
      TestConstructor as unknown as SpeechRecognitionConstructor,
    );

    engine.start();
    expect(mockInstance).not.toBeNull();

    // 1. Interim transcript
    mockInstance!.onresult!({
      resultIndex: 0,
      results: [
        {
          isFinal: false,
          length: 1,
          0: { transcript: 'scroll', confidence: 0.8 },
        },
      ] as any,
    });

    expect(transcripts.length).toBe(1);
    expect(transcripts[0]?.text).toBe('scroll');
    expect(transcripts[0]?.isFinal).toBe(false);
    expect(transcripts[0]?.engine).toBe('webspeech');

    // 2. Final transcript
    mockInstance!.onresult!({
      resultIndex: 0,
      results: [
        {
          isFinal: true,
          length: 1,
          0: { transcript: 'scroll down', confidence: 0.95 },
        },
      ] as any,
    });

    expect(transcripts.length).toBe(2);
    expect(transcripts[1]?.text).toBe('scroll down');
    expect(transcripts[1]?.isFinal).toBe(true);
  });

  it('handles errors including not-allowed and audio-capture with friendly messages', () => {
    const errors: SpeechErrorEvent[] = [];
    let mockInstance: MockSpeechRecognition | null = null;

    class TestConstructor extends MockSpeechRecognition {
      constructor() {
        super();
        mockInstance = this;
      }
    }

    const engine = new WebSpeechEngine(
      {
        onTranscript: vi.fn(),
        onError: (err) => errors.push(err),
        onStatusChange: vi.fn(),
      },
      TestConstructor as unknown as SpeechRecognitionConstructor,
    );

    engine.start();

    // not-allowed error (e.g. offscreen permission limitation)
    mockInstance!.onerror!({ error: 'not-allowed' });
    expect(errors.length).toBe(1);
    expect(errors[0]?.error).toBe('not-allowed');
    expect(errors[0]?.fatal).toBe(true);
    expect(errors[0]?.message).toContain('Microphone access restricted in offscreen window');

    // audio-capture error
    mockInstance!.onerror!({ error: 'audio-capture' });
    expect(errors.length).toBe(2);
    expect(errors[1]?.message).toContain('Audio capture failed');

    // silence timeout no-speech should be ignored (let onend auto-restart)
    mockInstance!.onerror!({ error: 'no-speech' });
    expect(errors.length).toBe(2);
  });

  it('stops listening and aborts recognition cleanly', () => {
    let mockInstance: any = null;
    let capturedStatus: SpeechStatus | null = null;

    class TestConstructor extends MockSpeechRecognition {
      constructor() {
        super();
        mockInstance = this;
      }
    }

    const engine = new WebSpeechEngine(
      {
        onTranscript: vi.fn(),
        onError: vi.fn(),
        onStatusChange: (status) => {
          capturedStatus = status;
        },
      },
      TestConstructor as unknown as SpeechRecognitionConstructor,
    );

    engine.start();
    expect(engine.isListening()).toBe(true);

    engine.stop();
    expect(engine.isListening()).toBe(false);
    expect(mockInstance?.abort).toHaveBeenCalled();
    expect(capturedStatus).toBe('idle');
  });
});

describe('Speech Engine - VoskEngine', () => {
  it('processes PCM audio chunks and emits interim and final transcripts', () => {
    const transcripts: SpeechTranscriptEvent[] = [];

    const mockRecognizer: VoskRecognizer = {
      acceptWaveform: vi.fn((data: Float32Array) => {
        // Return true if first sample is positive
        const first = data[0] ?? 0;
        return first > 0;
      }),
      result: vi.fn(() => ({ text: 'click' })),
      partialResult: vi.fn(() => ({ partial: 'cl' })),
    };

    const engine = new VoskEngine(
      {
        onTranscript: (evt) => transcripts.push(evt),
        onError: vi.fn(),
        onStatusChange: vi.fn(),
      },
      mockRecognizer,
    );

    // Send negative initial sample -> interim partial result
    const pcmInterim = new Float32Array([-0.5, 0.2, 0.1]);
    engine.processPcmChunk(pcmInterim);

    expect(transcripts.length).toBe(1);
    expect(transcripts[0]?.text).toBe('cl');
    expect(transcripts[0]?.isFinal).toBe(false);
    expect(transcripts[0]?.engine).toBe('vosk');

    // Send positive initial sample -> final result
    const pcmFinal = new Float32Array([0.8, 0.3, 0.2]);
    engine.processPcmChunk(pcmFinal);

    expect(transcripts.length).toBe(2);
    expect(transcripts[1]?.text).toBe('click');
    expect(transcripts[1]?.isFinal).toBe(true);
    expect(transcripts[1]?.engine).toBe('vosk');
  });

  it('reports errors if microphone initialization fails', async () => {
    let capturedError: SpeechErrorEvent | undefined;

    const engine = new VoskEngine({
      onTranscript: vi.fn(),
      onError: (err) => {
        capturedError = err;
      },
      onStatusChange: vi.fn(),
    });

    await engine.start(null);
    expect(capturedError).toBeDefined();
    expect(capturedError?.error).toBe('vosk_init_error');
  });
});

describe('Speech Engine - SpeechEngineManager', () => {
  it('instantiates appropriate engine based on settings and allows switching', () => {
    const manager = new SpeechEngineManager('webspeech', {
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStatusChange: vi.fn(),
    });

    expect(manager.activeEngineType).toBe('webspeech');

    manager.setEngine('vosk');
    expect(manager.activeEngineType).toBe('vosk');

    manager.setEngine('webspeech');
    expect(manager.activeEngineType).toBe('webspeech');
  });

  it('delegates start, stop, and listening state', () => {
    const manager = new SpeechEngineManager(
      'webspeech',
      {
        onTranscript: vi.fn(),
        onError: vi.fn(),
        onStatusChange: vi.fn(),
      },
      {
        speechRecognitionConstructor:
          MockSpeechRecognition as unknown as SpeechRecognitionConstructor,
      },
    );

    manager.start();
    expect(manager.isListening()).toBe(true);

    manager.stop();
    expect(manager.isListening()).toBe(false);
  });
});
