/**
 * Snap-to-target system (src/content/snap.ts)
 * Detects clickable elements near cursor using elementFromPoint + getBoundingClientRect radius search,
 * gently pulls the cursor toward the element center, and provides target highlight geometry.
 *
 * Highly optimized: uses fast spatial hit-testing (elementFromPoint / elementsFromPoint)
 * to test only candidates within snapRadius, completely eliminating DOM layout thrashing.
 */

export const CLICKABLE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[onclick]',
  '[tabindex]',
].join(', ');

export interface SnapResult {
  element: HTMLElement;
  rect: DOMRect;
  snappedX: number;
  snappedY: number;
  distance: number;
}

/**
 * Checks if an element is genuinely interactive and visible to the user.
 */
function isValidClickable(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;

  // Disabled check
  if (
    (el as HTMLButtonElement).disabled ||
    el.getAttribute('aria-disabled') === 'true' ||
    (el.getAttribute('tabindex') === '-1' &&
      !el.matches('a, button, input, select, textarea, [onclick]'))
  ) {
    return false;
  }

  // Overlay host ignore
  if (el.id === 'handsfree-overlay-host' || el.closest('#handsfree-overlay-host')) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  // Viewport visibility check
  if (
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  ) {
    return false;
  }

  return true;
}

/**
 * Calculates distance from (x, y) to closest boundary point on a rectangle.
 */
function distanceToRect(x: number, y: number, rect: DOMRect): number {
  const clampedX = Math.max(rect.left, Math.min(x, rect.right));
  const clampedY = Math.max(rect.top, Math.min(y, rect.bottom));
  return Math.hypot(x - clampedX, y - clampedY);
}

/**
 * Finds the closest clickable element within snapRadius of (x, y).
 * Uses multi-point spatial hit-testing to inspect only local elements near the cursor.
 */
export function findSnapTarget(x: number, y: number, snapRadius: number): SnapResult | null {
  if (snapRadius <= 0) return null;

  // 1. Fast path: check element directly under cursor point
  const directEl = document.elementFromPoint(x, y);
  if (directEl) {
    const clickable = directEl.closest(CLICKABLE_SELECTOR);
    if (isValidClickable(clickable)) {
      const rect = clickable.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const PULL_FACTOR = 0.35;
      return {
        element: clickable,
        rect,
        snappedX: x + (centerX - x) * PULL_FACTOR,
        snappedY: y + (centerY - y) * PULL_FACTOR,
        distance: 0,
      };
    }
  }

  // 2. Fallback: lightweight radial search in 8 directions at optimal radius
  const candidateSet = new Set<HTMLElement>();
  const probeRadius = snapRadius * 0.8;
  const angles = [
    0,
    Math.PI / 4,
    Math.PI / 2,
    (3 * Math.PI) / 4,
    Math.PI,
    (5 * Math.PI) / 4,
    (3 * Math.PI) / 2,
    (7 * Math.PI) / 4,
  ];

  for (const angle of angles) {
    const sx = Math.max(0, Math.min(window.innerWidth - 1, x + Math.cos(angle) * probeRadius));
    const sy = Math.max(0, Math.min(window.innerHeight - 1, y + Math.sin(angle) * probeRadius));
    const el = document.elementFromPoint(sx, sy);
    if (el) {
      const clickable = el.closest(CLICKABLE_SELECTOR);
      if (isValidClickable(clickable)) {
        candidateSet.add(clickable);
      }
    }
  }

  if (candidateSet.size === 0) {
    return null;
  }

  // Find closest candidate within snapRadius
  let bestCandidate: HTMLElement | null = null;
  let minDistance = snapRadius;
  let bestRect: DOMRect | null = null;

  candidateSet.forEach((candidate) => {
    const rect = candidate.getBoundingClientRect();
    const dist = distanceToRect(x, y, rect);

    if (dist <= minDistance) {
      // If distances are equal, pick the smaller/more specific element
      if (
        dist === minDistance &&
        bestCandidate &&
        bestRect &&
        rect.width * rect.height > bestRect.width * bestRect.height
      ) {
        return;
      }
      minDistance = dist;
      bestCandidate = candidate;
      bestRect = rect;
    }
  });

  if (!bestCandidate || !bestRect) {
    return null;
  }

  const rect = bestRect as DOMRect;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Gentle magnetic pull toward element center (35% pull strength)
  const PULL_FACTOR = 0.35;
  const snappedX = x + (centerX - x) * PULL_FACTOR;
  const snappedY = y + (centerY - y) * PULL_FACTOR;

  return {
    element: bestCandidate,
    rect,
    snappedX,
    snappedY,
    distance: minDistance,
  };
}
