import { executeClick } from './actions';

interface ActiveHint {
  number: number;
  element: Element;
  badgeElement: HTMLElement;
}

let activeHints: ActiveHint[] = [];
let hintsContainer: HTMLElement | null = null;

/**
 * Searches for all visible clickable and interactive elements in the viewport.
 */
function findInteractiveElements(): Element[] {
  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const elements = Array.from(document.querySelectorAll(selector));
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  return elements.filter((el) => {
    // Check if inside handsfree host
    if (el.closest('#handsfree-overlay-host')) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 4 || rect.height <= 4) return false;

    // Check viewport bounds
    const isVisibleInViewport =
      rect.bottom > 0 && rect.top < viewportH && rect.right > 0 && rect.left < viewportW;
    if (!isVisibleInViewport) return false;

    // Check computed styles
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) < 0.1
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Shows numbered badges over all interactive elements on the page.
 */
export function showHints(parentContainer: HTMLElement): void {
  hideHints();

  hintsContainer = document.createElement('div');
  hintsContainer.id = 'hf-hints-layer';
  hintsContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483645;
  `;

  const elements = findInteractiveElements();
  activeHints = [];

  let count = 1;
  for (const el of elements) {
    if (count > 99) break; // Cap at 99 hints for clarity

    const rect = el.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'hf-hint-badge';
    badge.textContent = String(count);
    badge.style.cssText = `
      position: fixed;
      top: ${Math.max(2, rect.top)}px;
      left: ${Math.max(2, rect.left)}px;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid rgba(0, 0, 0, 0.85);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2);
      pointer-events: none;
      z-index: 2147483646;
      transform: translate3d(0, 0, 0);
      animation: hfHintPop 0.15s ease-out;
    `;

    hintsContainer.appendChild(badge);
    activeHints.push({
      number: count,
      element: el,
      badgeElement: badge,
    });
    count++;
  }

  parentContainer.appendChild(hintsContainer);
}

/**
 * Removes all hint badges from the page.
 */
export function hideHints(): void {
  if (hintsContainer) {
    hintsContainer.remove();
    hintsContainer = null;
  }
  activeHints = [];
}

/**
 * Checks if hints are currently active.
 */
export function areHintsVisible(): boolean {
  return activeHints.length > 0;
}

/**
 * Clicks the element associated with the given hint number.
 */
export function clickHintNumber(num: number): boolean {
  const match = activeHints.find((h) => h.number === num);
  if (!match) return false;

  const rect = match.element.getBoundingClientRect();
  const coords = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };

  executeClick(coords, match.element);
  hideHints();
  return true;
}

/**
 * Opens the link or clicks the element associated with the given hint number.
 */
export function openHintLinkNumber(num: number): boolean {
  const match = activeHints.find((h) => h.number === num);
  if (!match) return false;

  if (match.element instanceof HTMLAnchorElement && match.element.href) {
    window.location.href = match.element.href;
    hideHints();
    return true;
  }

  return clickHintNumber(num);
}
