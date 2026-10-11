export class HintOverlay {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private container: HTMLElement;
  private hintsMap: Map<number, HTMLElement> = new Map();
  private isVisible: boolean = false;
  private onAction: ((el: HTMLElement, mode: 'click' | 'type') => void) | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'handsfree-hints-root';
    this.host.style.position = 'fixed';
    this.host.style.top = '0';
    this.host.style.left = '0';
    this.host.style.width = '100vw';
    this.host.style.height = '100vh';
    this.host.style.zIndex = '2147483645';
    this.host.style.pointerEvents = 'none';

    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .hints-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .hint-badge {
        position: fixed;
        background: #ffd60a;
        color: #131a2a;
        font-family: system-ui, 'Segoe UI', sans-serif;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        padding: 2px 5px;
        border-radius: 4px;
        border: 2px solid #131a2a;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        z-index: 2147483646;
        user-select: none;
        pointer-events: none;
        transform: translate3d(0, 0, 0);
        animation: popIn 0.15s cubic-bezier(0.1, 0.9, 0.2, 1);
      }
      @keyframes popIn {
        from { transform: scale(0.6); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `;

    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = 'hints-container';
    this.shadow.appendChild(this.container);

    document.documentElement.appendChild(this.host);
  }

  public setOnAction(callback: (el: HTMLElement, mode: 'click' | 'type') => void): void {
    this.onAction = callback;
  }

  public show(): void {
    this.scanAndRender();
    this.isVisible = true;
    this.host.style.display = 'block';
  }

  public hide(): void {
    this.isVisible = false;
    this.host.style.display = 'none';
    this.container.innerHTML = '';
    this.hintsMap.clear();
  }

  public toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  public isActive(): boolean {
    return this.isVisible;
  }

  public clickHint(index: number): boolean {
    const el = this.hintsMap.get(index);
    if (!el) return false;

    if (this.onAction) {
      this.onAction(el, 'click');
    } else {
      el.click();
    }
    this.hide();
    return true;
  }

  public typeHint(index: number): boolean {
    const el = this.hintsMap.get(index);
    if (!el) return false;

    if (this.onAction) {
      this.onAction(el, 'type');
    } else {
      el.focus();
    }
    this.hide();
    return true;
  }

  private scanAndRender(): void {
    this.container.innerHTML = '';
    this.hintsMap.clear();

    const selector = 'a, button, input, select, textarea, summary, [role="button"], [role="link"], [onclick], [tabindex]';
    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const visibleItems: { el: HTMLElement; rect: DOMRect }[] = [];

    for (const el of elements) {
      // Skip handsfree elements
      if (el.closest('#handsfree-cursor-root') || el.closest('#handsfree-hud-root') || el.closest('#handsfree-hints-root')) {
        continue;
      }

      const rect = el.getBoundingClientRect();
      // Must be within viewport and have visible area
      if (
        rect.width > 6 &&
        rect.height > 6 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < viewportHeight &&
        rect.left < viewportWidth
      ) {
        // Center check to filter covered elements
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topEl = document.elementFromPoint(centerX, centerY);

        if (topEl && (el.contains(topEl) || topEl.contains(el))) {
          visibleItems.push({ el, rect });
        }
      }
    }

    // Sort top-to-bottom, left-to-right
    visibleItems.sort((a, b) => {
      if (Math.abs(a.rect.top - b.rect.top) > 20) {
        return a.rect.top - b.rect.top;
      }
      return a.rect.left - b.rect.left;
    });

    let index = 1;
    for (const item of visibleItems) {
      if (index > 99) break; // Cap at 99 badges

      const badge = document.createElement('div');
      badge.className = 'hint-badge';
      badge.textContent = index.toString();
      badge.style.top = `${Math.max(2, item.rect.top - 6)}px`;
      badge.style.left = `${Math.max(2, item.rect.left - 6)}px`;

      this.container.appendChild(badge);
      this.hintsMap.set(index, item.el);
      index++;
    }
  }

  public destroy(): void {
    this.host.remove();
  }
}
