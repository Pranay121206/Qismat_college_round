import type { SnapResult } from './snap';

export interface TargetInfo {
  element: HTMLElement;
  coords: { x: number; y: number };
  rect?: DOMRect | null;
  isGrace?: boolean;
  wasFromOnset?: boolean;
}

/**
 * Manages the "current target" lifecycle:
 * - Retains the snap-to-target element during a 700ms grace window after cursor leaves it.
 * - Records cursor coordinates and target element at SPEECH ONSET to prevent speech cursor drift.
 * - Resolves target-less voice commands to the onset target or active grace target.
 */
export class TargetManager {
  private currentTarget: HTMLElement | null = null;
  private currentTargetRect: DOMRect | null = null;
  private currentTargetCoords: { x: number; y: number } | null = null;
  private lastSnapTimestamp = 0;
  private activeSnap: SnapResult | null = null;

  // Speech onset state
  private speechOnsetTarget: HTMLElement | null = null;
  private speechOnsetPosition: { x: number; y: number } | null = null;
  private speechOnsetTimestamp = 0;
  private isSpeaking = false;

  readonly GRACE_WINDOW_MS = 700;
  readonly ONSET_EXPIRY_MS = 6000;

  /**
   * Updates the current snap target from cursor movement.
   */
  updateSnap(snap: SnapResult | null, coords?: { x: number; y: number }): void {
    const now = Date.now();
    this.activeSnap = snap;

    if (snap && snap.element) {
      this.currentTarget = snap.element;
      this.currentTargetRect = snap.rect;
      this.currentTargetCoords = { x: snap.snappedX, y: snap.snappedY };
      this.lastSnapTimestamp = now;
    } else {
      // Check if grace window has expired
      if (now - this.lastSnapTimestamp > this.GRACE_WINDOW_MS) {
        this.currentTarget = null;
        this.currentTargetRect = null;
        this.currentTargetCoords = null;
      }
    }
  }

  /**
   * Returns whether the current target is still active via the 700ms grace window.
   */
  isInGraceWindow(now = Date.now()): boolean {
    return (
      !this.activeSnap &&
      Boolean(this.currentTarget) &&
      this.isValidElement(this.currentTarget) &&
      now - this.lastSnapTimestamp <= this.GRACE_WINDOW_MS
    );
  }

  /**
   * Gets the current target, respecting active snap and the 700ms grace window.
   */
  getCurrentTarget(fallbackCoords?: { x: number; y: number }, now = Date.now()): TargetInfo {
    // 1. Active snap target
    if (this.activeSnap && this.isValidElement(this.activeSnap.element)) {
      return {
        element: this.activeSnap.element,
        coords: { x: this.activeSnap.snappedX, y: this.activeSnap.snappedY },
        rect: this.activeSnap.rect,
        isGrace: false,
      };
    }

    // 2. Target within 700ms grace window
    if (
      this.currentTarget &&
      this.isValidElement(this.currentTarget) &&
      now - this.lastSnapTimestamp <= this.GRACE_WINDOW_MS
    ) {
      return {
        element: this.currentTarget,
        coords: this.currentTargetCoords || fallbackCoords || { x: 0, y: 0 },
        rect: this.currentTargetRect,
        isGrace: true,
      };
    }

    // 3. Fallback to element under coordinates
    if (fallbackCoords && typeof document !== 'undefined') {
      const el = document.elementFromPoint(fallbackCoords.x, fallbackCoords.y);
      if (el instanceof HTMLElement) {
        return {
          element: el,
          coords: fallbackCoords,
          rect: typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null,
          isGrace: false,
        };
      }
    }

    const fallbackEl =
      typeof document !== 'undefined' && document.body ? document.body : ({} as HTMLElement);
    return {
      element: fallbackEl,
      coords: fallbackCoords || { x: 0, y: 0 },
      isGrace: false,
    };
  }

  /**
   * Records cursor position and current target at SPEECH ONSET.
   */
  recordSpeechOnset(cursorCoords: { x: number; y: number }, timestamp = Date.now()): void {
    this.isSpeaking = true;
    this.speechOnsetPosition = { ...cursorCoords };
    this.speechOnsetTimestamp = timestamp;

    const current = this.getCurrentTarget(cursorCoords, timestamp);
    this.speechOnsetTarget = current.element;
  }

  /**
   * Retrieves and consumes the recorded onset target if valid, otherwise falls back.
   */
  consumeOnsetTarget(currentCoords: { x: number; y: number }, now = Date.now()): TargetInfo {
    const hasValidOnset =
      this.speechOnsetTarget &&
      this.isValidElement(this.speechOnsetTarget) &&
      now - this.speechOnsetTimestamp <= this.ONSET_EXPIRY_MS;

    if (hasValidOnset && this.speechOnsetTarget) {
      const target = this.speechOnsetTarget;
      const coords = this.speechOnsetPosition || currentCoords;
      const rect =
        typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;

      this.clearOnset();
      return {
        element: target,
        coords,
        rect,
        wasFromOnset: true,
      };
    }

    this.clearOnset();
    return this.getCurrentTarget(currentCoords, now);
  }

  /**
   * Resets the speech onset tracking state.
   */
  clearOnset(): void {
    this.speechOnsetTarget = null;
    this.speechOnsetPosition = null;
    this.speechOnsetTimestamp = 0;
    this.isSpeaking = false;
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  getOnsetTarget(): HTMLElement | null {
    return this.speechOnsetTarget;
  }

  getOnsetPosition(): { x: number; y: number } | null {
    return this.speechOnsetPosition;
  }

  private isValidElement(el: Element | null): el is HTMLElement {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (typeof document !== 'undefined' && !document.contains(el)) return false;
    return true;
  }
}
