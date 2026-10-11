export interface FusionTarget {
  element: HTMLElement;
  x: number;
  y: number;
  timestamp: number;
}

/**
 * Point-and-speak. When a spoken phrase begins we remember what the pointer was over, so that
 * "click" lands on that element even if the head drifted while the sentence was being said.
 */
export class MultimodalFusion {
  private onset: FusionTarget | null = null;
  private lastUtterance = '';
  private lastClickAt = 0;
  private readonly COOLDOWN_MS = 500;
  private readonly ONSET_MAX_AGE_MS = 2500;

  public registerSpeechOnset(utteranceId: string, x: number, y: number): void {
    if (utteranceId === this.lastUtterance) return; // only the first result of a phrase
    this.lastUtterance = utteranceId;
    const el = document.elementFromPoint(x, y);
    if (el instanceof HTMLElement) this.onset = { element: el, x, y, timestamp: Date.now() };
  }

  /** Where a voice click should land: the onset position if fresh, otherwise where the pointer is now. */
  public resolveVoiceTarget(currentX: number, currentY: number): { x: number; y: number } {
    if (this.onset && Date.now() - this.onset.timestamp < this.ONSET_MAX_AGE_MS) {
      const { x, y } = this.onset;
      this.onset = null;
      return { x, y };
    }
    return { x: currentX, y: currentY };
  }

  public markClickExecuted(): void {
    this.lastClickAt = Date.now();
    this.onset = null;
  }

  public canClick(): boolean {
    return Date.now() - this.lastClickAt >= this.COOLDOWN_MS;
  }
}
