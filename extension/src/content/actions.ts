export interface ClickResult {
  success: boolean;
  isSensitive: boolean;
  targetText?: string;
  element?: HTMLElement;
}

const SENSITIVE_REGEX = /\b(buy now|purchase|pay|payment|delete|destroy|checkout|place (?:your )?order|transfer|send money|deactivate)\b/i;

export class ActionExecutor {
  private pendingSensitiveAction: (() => void) | null = null;

  private resolveInteractive(el: Element | null): HTMLElement | null {
    if (!el) return null;
    const hit = el.closest('a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick]');
    const target = (hit || el) as Element;
    return target instanceof HTMLElement ? target : null;
  }

  public isSensitiveTarget(el: Element | null): { isSensitive: boolean; description: string } {
    if (!el || !(el instanceof HTMLElement)) return { isSensitive: false, description: '' };
    const text = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('value') || '').trim();
    // Only genuinely risky wording needs a spoken "yes". Plain form submits (like a search box) go straight through.
    if (SENSITIVE_REGEX.test(text)) {
      return { isSensitive: true, description: text.slice(0, 30) };
    }
    return { isSensitive: false, description: text.slice(0, 30) };
  }

  public clickAt(x: number, y: number, bypassGuard: boolean = false): ClickResult {
    const el = this.resolveInteractive(document.elementFromPoint(x, y));
    if (!el) {
      return { success: false, isSensitive: false };
    }

    const { isSensitive, description } = this.isSensitiveTarget(el);

    if (isSensitive && !bypassGuard) {
      this.pendingSensitiveAction = () => {
        this.dispatchClickEvents(el, x, y);
      };
      return { success: false, isSensitive: true, targetText: description, element: el };
    }

    this.dispatchClickEvents(el, x, y);
    return { success: true, isSensitive: false, targetText: description, element: el };
  }

  public confirmPendingAction(): boolean {
    if (this.pendingSensitiveAction) {
      this.pendingSensitiveAction();
      this.pendingSensitiveAction = null;
      return true;
    }
    return false;
  }

  public cancelPendingAction(): void {
    this.pendingSensitiveAction = null;
  }

  public hasPendingSensitiveAction(): boolean {
    return this.pendingSensitiveAction !== null;
  }

  private dispatchClickEvents(el: HTMLElement, x: number, y: number): void {
    const init: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mousedown', init));
      if (typeof el.focus === 'function') el.focus({ preventScroll: true });
      el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
    } catch {
      /* some pages throw from their own listeners */
    }
    // One real click. Dispatching a synthetic click as well would fire the handler twice.
    try {
      el.click();
    } catch {
      /* ignore */
    }
  }

  /** Click a specific element (used by numbered hints) at its center. */
  public clickElement(el: HTMLElement): void {
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    this.dispatchClickEvents(el, r.left + r.width / 2, r.top + r.height / 2);
  }

  private lastHover: Element | null = null;
  private lastHoverAt = 0;

  /** Let hover-only menus and video controls react to the virtual cursor. */
  public hoverAt(x: number, y: number): void {
    const now = performance.now();
    if (now - this.lastHoverAt < 50) return;
    this.lastHoverAt = now;
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const init: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    try {
      if (el !== this.lastHover) {
        if (this.lastHover) {
          this.lastHover.dispatchEvent(new MouseEvent('mouseout', init));
          this.lastHover.dispatchEvent(new PointerEvent('pointerout', init));
        }
        el.dispatchEvent(new PointerEvent('pointerover', init));
        el.dispatchEvent(new MouseEvent('mouseover', init));
        this.lastHover = el;
      }
      el.dispatchEvent(new PointerEvent('pointermove', init));
      el.dispatchEvent(new MouseEvent('mousemove', init));
    } catch {
      /* ignore */
    }
  }

  public doubleClickAt(x: number, y: number): void {
    const el = document.elementFromPoint(x, y);
    if (!el || !(el instanceof HTMLElement)) return;

    this.dispatchClickEvents(el, x, y);
    setTimeout(() => {
      this.dispatchClickEvents(el, x, y);
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }, 120);
  }

  public rightClickAt(x: number, y: number): void {
    const el = document.elementFromPoint(x, y);
    if (!el || !(el instanceof HTMLElement)) return;

    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 2
      })
    );
  }

  public zoom(factor: number): void {
    const current = parseFloat((document.body.style as any).zoom || '1.0');
    const next = Math.max(0.5, Math.min(2.5, current + factor));
    (document.body.style as any).zoom = `${next}`;
  }

  public zoomReset(): void {
    (document.body.style as any).zoom = '1';
  }

  /** The video the user most likely means: the playing one, else the biggest visible one. */
  private findVideo(): HTMLVideoElement | null {
    const videos = Array.from(document.querySelectorAll('video'));
    let best: HTMLVideoElement | null = null;
    let bestScore = -1;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0) continue;
      const score = w * h + (v.paused ? 0 : 1e9);
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    return best;
  }

  public media(action: 'play' | 'pause' | 'mute' | 'unmute'): boolean {
    const v = this.findVideo();
    if (!v) return false;
    if (action === 'play') void v.play().catch(() => {});
    else if (action === 'pause') v.pause();
    else v.muted = action === 'mute';
    return true;
  }

  /**
   * Click the visible control whose label best matches what the user said.
   * Looks at text, aria-label, title, placeholder and alt.
   */
  public clickByText(query: string): { success: boolean; label?: string; isSensitive?: boolean } {
    const q = query.toLowerCase().trim();
    if (!q) return { success: false };

    const candidates = document.querySelectorAll<HTMLElement>(
      'a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [tabindex]'
    );

    let best: { el: HTMLElement; score: number; label: string } | null = null;
    for (const el of Array.from(candidates)) {
      if (el.closest('#handsfree-cursor-root, #handsfree-hud-root, #handsfree-hints-root')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;

      const label = (
        el.getAttribute('aria-label') ||
        el.innerText ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        el.getAttribute('value') ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!label || label.length > 80) continue;

      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80 - Math.min(20, label.length - q.length);
      else if (label.includes(q)) score = 60 - Math.min(30, label.length - q.length);
      else if (q.includes(label) && label.length >= 3) score = 40;
      if (score > 0 && (!best || score > best.score)) best = { el, score, label };
    }

    if (!best) return { success: false };

    best.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const rect = best.el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const { isSensitive } = this.isSensitiveTarget(best.el);
    if (isSensitive) {
      const el = best.el;
      this.pendingSensitiveAction = () => this.dispatchClickEvents(el, x, y);
      return { success: false, label: best.label, isSensitive: true };
    }
    this.dispatchClickEvents(best.el, x, y);
    return { success: true, label: best.label };
  }
}
