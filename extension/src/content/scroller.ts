/**
 * Smooth, slow-by-default scrolling that works on the thing under the cursor.
 *
 * Plain window.scrollBy does nothing on reels / shorts / most web apps, because the feed lives
 * inside its own scroll container. So we find the scrollable element under the pointer, and for
 * feeds that use scroll-snap we move one item at a time instead of fighting the snap.
 */

export type SpeedName = 'slow' | 'normal' | 'fast';

const SPEED_FACTOR: Record<SpeedName, number> = { slow: 0.45, normal: 1, fast: 2.2 };

interface Target {
  el: Element | Window;
  snap: boolean;
}

const FEED_HOSTS = /(youtube\.com\/shorts|instagram\.com\/(reels?|explore)|tiktok\.com|facebook\.com\/reel)/i;

function isScrollable(el: Element): boolean {
  const cs = getComputedStyle(el);
  const oy = cs.overflowY;
  if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
  return el.scrollHeight > el.clientHeight + 4;
}

export class SmoothScroller {
  private rafId: number | null = null;
  private direction: 1 | -1 = 1;
  private pxPerSecond = 260;
  private baseSpeed = 260;
  private speedFactor = 1;
  private lastTs = 0;
  private remainder = 0;
  private target: Target | null = null;
  private ramp = 0;
  private stepping = false;

  public setBaseSpeed(pxPerSecond: number): void {
    this.baseSpeed = Math.max(60, pxPerSecond);
    this.pxPerSecond = this.baseSpeed * this.speedFactor;
  }

  public isScrolling(): boolean {
    return this.rafId !== null;
  }

  /** Find what should scroll when the pointer is at (x, y). */
  public findTarget(x: number, y: number): Target {
    let el: Element | null = document.elementFromPoint(x, y);
    let snapAncestor = false;

    while (el && el !== document.documentElement && el !== document.body) {
      if (isScrollable(el)) {
        const snapType = getComputedStyle(el).scrollSnapType;
        return { el, snap: !!snapType && snapType !== 'none' };
      }
      el = el.parentElement;
    }

    // Nothing scrollable under the pointer. Prefer the page itself if it scrolls.
    const root = document.scrollingElement as HTMLElement | null;
    if (root && root.scrollHeight > root.clientHeight + 4) {
      const snapType = getComputedStyle(document.documentElement).scrollSnapType;
      snapAncestor = !!snapType && snapType !== 'none';
      return { el: window, snap: snapAncestor };
    }

    // Single-page apps often scroll an inner panel. Pick the largest scrollable box on screen.
    const best = this.largestScrollable();
    if (best) {
      const snapType = getComputedStyle(best).scrollSnapType;
      return { el: best, snap: !!snapType && snapType !== 'none' };
    }
    return { el: window, snap: false };
  }

  private largestScrollable(): Element | null {
    let best: Element | null = null;
    let bestArea = 0;
    const all = document.body ? document.body.querySelectorAll('*') : [];
    const limit = Math.min(all.length, 4000);
    for (let i = 0; i < limit; i++) {
      const el = all[i];
      if (!isScrollable(el)) continue;
      const r = el.getBoundingClientRect();
      const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      const area = Math.max(0, w) * Math.max(0, h);
      if (area > bestArea && area > window.innerWidth * window.innerHeight * 0.25) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  private scrollTop(t: Target): number {
    return t.el === window ? window.scrollY : (t.el as Element).scrollTop;
  }

  private viewportHeight(t: Target): number {
    return t.el === window ? window.innerHeight : (t.el as Element).clientHeight;
  }

  private scrollByRaw(t: Target, dy: number, smooth = false): void {
    const behavior: ScrollBehavior = smooth ? 'smooth' : 'instant';
    if (t.el === window) window.scrollBy({ top: dy, behavior });
    else (t.el as Element).scrollBy({ top: dy, behavior });
  }

  /** Start scrolling. On feeds that snap, this steps one item instead. */
  public start(direction: 'up' | 'down', x: number, y: number, speed?: SpeedName): 'continuous' | 'step' {
    this.stop();
    if (speed) {
      this.speedFactor = SPEED_FACTOR[speed];
      this.pxPerSecond = this.baseSpeed * this.speedFactor;
    }

    const target = this.findTarget(x, y);
    if (target.snap || FEED_HOSTS.test(location.href)) {
      this.stepItem(direction, x, y, target);
      return 'step';
    }

    this.target = target;
    this.direction = direction === 'down' ? 1 : -1;
    this.lastTs = performance.now();
    this.remainder = 0;
    this.ramp = 0;
    this.rafId = requestAnimationFrame(this.frame);
    return 'continuous';
  }

  private frame = (ts: number): void => {
    if (this.rafId === null || !this.target) return;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    // ease in over ~350 ms so scrolling never lurches
    this.ramp = Math.min(1, this.ramp + dt / 0.35);
    const eased = this.ramp * this.ramp * (3 - 2 * this.ramp);

    const exact = this.direction * this.pxPerSecond * eased * dt + this.remainder;
    const whole = Math.trunc(exact);
    this.remainder = exact - whole;

    if (whole !== 0) {
      const before = this.scrollTop(this.target);
      this.scrollByRaw(this.target, whole);
      if (this.scrollTop(this.target) === before) {
        // hit the end
        this.stop();
        return;
      }
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  public stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.target = null;
  }

  public faster(): SpeedName {
    this.speedFactor = Math.min(4, this.speedFactor * 1.5);
    this.pxPerSecond = this.baseSpeed * this.speedFactor;
    return this.speedFactor >= 2 ? 'fast' : 'normal';
  }

  public slower(): SpeedName {
    this.speedFactor = Math.max(0.2, this.speedFactor / 1.5);
    this.pxPerSecond = this.baseSpeed * this.speedFactor;
    return this.speedFactor <= 0.6 ? 'slow' : 'normal';
  }

  /** Scroll roughly one screen, smoothly. */
  public page(direction: 'up' | 'down', x: number, y: number): void {
    this.stop();
    const t = this.findTarget(x, y);
    const amount = this.viewportHeight(t) * 0.85 * (direction === 'down' ? 1 : -1);
    this.scrollByRaw(t, amount, true);
  }

  /** A small nudge, about a third of a screen. */
  public nudge(direction: 'up' | 'down', x: number, y: number): void {
    this.stop();
    const t = this.findTarget(x, y);
    const amount = this.viewportHeight(t) * 0.3 * (direction === 'down' ? 1 : -1);
    this.scrollByRaw(t, amount, true);
  }

  public toEdge(where: 'top' | 'bottom', x: number, y: number): void {
    this.stop();
    const t = this.findTarget(x, y);
    const el = t.el === window ? (document.scrollingElement as Element) : (t.el as Element);
    el.scrollTo({ top: where === 'top' ? 0 : el.scrollHeight, behavior: 'smooth' });
  }

  /**
   * Move to the next or previous item in a feed (reel, short, post).
   * 1) scroll the snap container by exactly one viewport, smoothly;
   * 2) if the feed did not move, press the site's own "next" button;
   * 3) as a last resort, send an arrow key.
   */
  public stepItem(direction: 'up' | 'down', x: number, y: number, knownTarget?: Target): void {
    if (this.stepping) return;
    this.stepping = true;
    window.setTimeout(() => (this.stepping = false), 650);

    const t = knownTarget || this.findTarget(x, y);
    const before = this.scrollTop(t);
    const delta = this.viewportHeight(t) * (direction === 'down' ? 1 : -1);
    this.scrollByRaw(t, delta, true);

    window.setTimeout(() => {
      if (Math.abs(this.scrollTop(t) - before) > 8) return;
      if (this.pressSiteNavButton(direction)) return;
      this.pressArrowKey(direction);
    }, 700);
  }

  private pressSiteNavButton(direction: 'up' | 'down'): boolean {
    const wanted = direction === 'down' ? /(next|down|navigate down)/i : /(previous|prev|up|navigate up)/i;
    const buttons = document.querySelectorAll<HTMLElement>('button, [role="button"]');
    for (const b of Array.from(buttons)) {
      const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`;
      if (!wanted.test(label)) continue;
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
      b.click();
      return true;
    }
    return false;
  }

  private pressArrowKey(direction: 'up' | 'down'): void {
    const key = direction === 'down' ? 'ArrowDown' : 'ArrowUp';
    const init = { key, code: key, keyCode: direction === 'down' ? 40 : 38, which: direction === 'down' ? 40 : 38, bubbles: true, cancelable: true };
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
  }
}
