import { SpeechResult } from '../shared/messages';

export class VoiceEngine {
  private recognition: any = null;
  private listening = false;
  private lang = 'en-US';
  private onResult: ((r: SpeechResult) => void) | null = null;
  private onError: ((message: string | undefined) => void) | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private session = 0;
  private startedOk = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  public isAvailable(): boolean {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public setLang(lang: string): void {
    if (!lang || lang === this.lang) return;
    this.lang = lang;
    if (this.listening && this.recognition) {
      // restart so the new language takes effect
      try {
        this.recognition.stop();
      } catch {
        /* ignore */
      }
    }
  }

  private build(): void {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 4;
    rec.lang = this.lang;
    this.session++;
    const session = this.session;

    rec.onstart = () => {
      this.startedOk = true;
      if (this.watchdog) clearTimeout(this.watchdog);
      this.failures = 0;
      this.onError?.(undefined);
    };

    rec.onresult = (event: any) => {
      this.failures = 0;
      // A single event can carry several changed results, so walk all of them.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (!res || res.length === 0) continue;
        const text = String(res[0].transcript || '').trim();
        if (!text) continue;
        const alts: string[] = [];
        for (let a = 1; a < res.length; a++) {
          const t = String(res[a]?.transcript || '').trim();
          if (t && t !== text) alts.push(t);
        }
        this.onResult?.({
          type: 'SPEECH_RESULT',
          text,
          alts,
          confidence: res[0].confidence || 0.8,
          isFinal: !!res.isFinal,
          utteranceId: `${session}-${i}`,
          timestamp: Date.now()
        });
      }
    };

    rec.onerror = (event: any) => {
      const code = event?.error;
      if (code === 'no-speech' || code === 'aborted') return; // normal, we simply restart
      if (code === 'language-not-supported' && this.lang !== 'en-US') { this.lang = 'en-US'; return; }
      this.failures++;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.onError?.('Microphone access was blocked. Open the Handsfree setup page and allow the microphone.');
        this.listening = false;
      } else if (code === 'network') {
        this.onError?.('Speech recognition needs an internet connection (Chrome sends audio to Google to transcribe it).');
      } else if (code === 'audio-capture') {
        this.onError?.('No microphone was found.');
      } else {
        this.onError?.(`Speech recognition error: ${code}`);
      }
    };

    rec.onend = () => {
      if (!this.listening) return;
      // Chrome ends continuous sessions every so often. Restart, backing off if it keeps failing.
      const delay = Math.min(3000, 20 + this.failures * 400);
      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => this.begin(), delay);
    };

    this.recognition = rec;
  }

  private begin(): void {
    if (!this.listening) return;
    // A fresh object each time avoids the "already started" state some Chrome versions get stuck in.
    try { this.recognition?.abort?.(); } catch { /* ignore */ }
    this.build();
    this.startedOk = false;
    try {
      this.recognition.start();
    } catch (err) {
      this.failures++;
      console.warn('[Handsfree Voice] start() failed:', err);
    }
    // Watchdog: if the engine never reports that it started, throw it away and try again.
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (this.listening && !this.startedOk) {
        this.failures++;
        this.begin();
      }
    }, 5000);
  }

  public start(
    onResult: (r: SpeechResult) => void,
    onError: (message: string | undefined) => void,
    lang?: string
  ): boolean {
    if (!this.isAvailable()) {
      onError('This browser does not support speech recognition. Use Google Chrome or Microsoft Edge.');
      return false;
    }
    if (lang) this.lang = lang;
    this.onResult = onResult;
    this.onError = onError;
    this.listening = true;
    this.failures = 0;
    this.begin();
    return true;
  }

  public stop(): void {
    this.listening = false;
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
    this.recognition = null;
  }
}
