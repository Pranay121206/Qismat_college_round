/**
 * The on-screen pointer. A yellow disc with a dark rim and a white halo, so it stays
 * visible on both light and dark pages. A blue ring fills while dwelling.
 */
const RING_RADIUS = 19;
const CIRC = 2 * Math.PI * RING_RADIUS;
const BOX = 48;

export class VirtualCursor {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private root: HTMLElement;
  private disc: HTMLElement;
  private ring: SVGCircleElement;
  private pinchEl: HTMLElement;
  private snapOutline: HTMLElement;

  private visible = true;
  private x = typeof window !== 'undefined' ? window.innerWidth / 2 : 400;
  private y = typeof window !== 'undefined' ? window.innerHeight / 2 : 300;
  private highContrast = false;
  private baseScale = 1;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'handsfree-cursor-root';
    Object.assign(this.host.style, {
      position: 'fixed', top: '0', left: '0', width: '0', height: '0', zIndex: '2147483647', pointerEvents: 'none'
    });
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .root { position: fixed; top: 0; left: 0; width: ${BOX}px; height: ${BOX}px; pointer-events: none; will-change: transform; }
      .halo { position: absolute; inset: 0; display: grid; place-items: center; }
      .disc {
        width: 20px; height: 20px; border-radius: 50%;
        background: #ffd60a;
        border: 2.5px solid #131a2a;
        box-shadow: 0 0 0 2px #ffffff, 0 3px 10px rgba(19, 26, 42, .45);
        transition: transform .12s ease, background .12s ease;
      }
      svg { position: absolute; inset: 0; transform: rotate(-90deg); overflow: visible; }
      .track { fill: none; stroke: rgba(255,255,255,.0); stroke-width: 5; }
      .progress { fill: none; stroke: #2540e8; stroke-width: 5; stroke-linecap: round; filter: drop-shadow(0 0 2px #fff); }
      .pinch { position: absolute; inset: 6px; border-radius: 50%; border: 3px solid #2540e8; opacity: 0; transform: scale(1.35); transition: opacity .12s, transform .12s; }
      .pinch.on { opacity: 1; transform: scale(.85); }
      .snap {
        position: fixed; pointer-events: none; opacity: 0;
        border: 3px solid #2540e8; border-radius: 6px;
        background: rgba(37, 64, 232, .10);
        box-shadow: 0 0 0 2px rgba(255,255,255,.9);
        transition: opacity .1s ease;
      }
      .hc .disc { background: #ffff00; border-color: #000; border-width: 3px; }
      .hc .progress { stroke: #000; }
      .hc .snap { border-color: #000; background: rgba(255,255,0,.25); }
      @media (prefers-reduced-motion: reduce) { .disc, .pinch, .snap { transition: none; } }
    `;

    this.snapOutline = document.createElement('div');
    this.snapOutline.className = 'snap';

    this.root = document.createElement('div');
    this.root.className = 'root';
    this.root.innerHTML = `
      <svg width="${BOX}" height="${BOX}" viewBox="0 0 ${BOX} ${BOX}" aria-hidden="true">
        <circle class="track" cx="${BOX / 2}" cy="${BOX / 2}" r="${RING_RADIUS}"></circle>
        <circle class="progress" cx="${BOX / 2}" cy="${BOX / 2}" r="${RING_RADIUS}"
          style="stroke-dasharray:${CIRC};stroke-dashoffset:${CIRC}"></circle>
      </svg>
      <div class="halo"><div class="disc"></div></div>
      <div class="pinch"></div>`;
    this.disc = this.root.querySelector('.disc') as HTMLElement;
    this.ring = this.root.querySelector('.progress') as SVGCircleElement;
    this.pinchEl = this.root.querySelector('.pinch') as HTMLElement;

    this.shadow.append(style, this.snapOutline, this.root);
    document.documentElement.appendChild(this.host);
    this.moveTo(this.x, this.y);
  }

  public setSize(size: number): void {
    this.baseScale = Math.max(0.6, Math.min(2, size / 28));
    this.disc.style.width = this.disc.style.height = `${Math.round(20 * this.baseScale)}px`;
  }

  public setHighContrast(on: boolean): void {
    this.highContrast = on;
    this.root.classList.toggle('hc', on);
    this.snapOutline.classList.toggle('hc', on);
  }

  public moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.root.style.transform = `translate3d(${x - BOX / 2}px, ${y - BOX / 2}px, 0)`;
  }

  public getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  public setDwellProgress(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction));
    this.ring.style.strokeDashoffset = String(CIRC * (1 - f));
    this.disc.style.transform = f > 0.02 ? `scale(${1 + f * 0.25})` : 'scale(1)';
  }

  public setPinch(on: boolean): void {
    this.pinchEl.classList.toggle('on', on);
  }

  public highlightTarget(el: Element | null): void {
    if (!el || !(el instanceof HTMLElement)) {
      this.snapOutline.style.opacity = '0';
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(this.snapOutline.style, {
      top: `${r.top - 3}px`, left: `${r.left - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px`, opacity: '1'
    });
  }

  public clearHighlight(): void {
    this.snapOutline.style.opacity = '0';
  }

  public flashClick(): void {
    this.disc.style.background = '#1f8a5b';
    this.disc.style.transform = 'scale(1.5)';
    window.setTimeout(() => {
      this.disc.style.background = '';
      this.disc.style.transform = 'scale(1)';
    }, 180);
  }

  public setAsleep(asleep: boolean): void {
    this.root.style.opacity = asleep ? '0.35' : '1';
  }

  public show(): void {
    this.visible = true;
    this.root.style.display = '';
  }

  public hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.clearHighlight();
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public destroy(): void {
    this.host.remove();
  }
}
