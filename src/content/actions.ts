/**
 * Action dispatcher for simulated mouse and keyboard events.
 * Dispatches trusted-like event sequences (pointerdown -> mousedown -> focus -> pointerup -> mouseup -> click)
 * and handles scrolling and cross-frame iframe action forwarding.
 */

export interface ActionTarget {
  element: Element;
  x: number;
  y: number;
}

/**
 * Checks whether an element is an iframe element.
 */
function isIframeElement(element: Element | null): element is HTMLIFrameElement {
  return element !== null && element.tagName.toLowerCase() === 'iframe';
}

/**
 * Forwards an action message to a cross-origin or same-origin iframe's contentWindow.
 */
function forwardActionToIframe(
  iframe: HTMLIFrameElement,
  action: 'click' | 'doubleClick' | 'rightClick' | 'scroll',
  x: number,
  y: number,
  deltaX = 0,
  deltaY = 0,
): boolean {
  if (!iframe.contentWindow) return false;

  const rect = iframe.getBoundingClientRect();
  const iframeX = x - rect.left;
  const iframeY = y - rect.top;

  try {
    iframe.contentWindow.postMessage(
      {
        type: 'HANDSFREE_IFRAME_ACTION',
        payload: {
          action,
          x: iframeX,
          y: iframeY,
          deltaX,
          deltaY,
        },
      },
      '*',
    );
    return true;
  } catch (err) {
    console.warn('[Handsfree Actions] Failed to forward action to iframe:', err);
    return false;
  }
}

/**
 * Checks whether an element or any of its ancestors match destructive or risky actions.
 * Used for the Risky Action Confirmation Guard (Task 4).
 */
export function isRiskyAction(element: Element | null): { isRisky: boolean; label: string } {
  if (!element) return { isRisky: false, label: '' };

  let current: Element | null = element;
  while (current && current !== document.body && current !== document.documentElement) {
    const text = (current.textContent || '').trim().toLowerCase();
    const ariaLabel = (current.getAttribute('aria-label') || '').toLowerCase();
    const title = (current.getAttribute('title') || '').toLowerCase();
    const id = (current.id || '').toLowerCase();
    const className = typeof current.className === 'string' ? current.className.toLowerCase() : '';
    const formMethod = (current.getAttribute('formmethod') || '').toLowerCase();
    const type = (current.getAttribute('type') || '').toLowerCase();

    const matchesWord = (str: string) => {
      return (
        /\b(delete|remove|destroy|purge|erase|drop|kill|trash)\b/i.test(str) ||
        /\b(pay|checkout|buy now|purchase|place order|order now|subscribe)\b/i.test(str) ||
        /\b(transfer|send money|withdraw|confirm payment)\b/i.test(str) ||
        /\b(submit order|finalize|confirm booking)\b/i.test(str)
      );
    };

    if (
      matchesWord(text) ||
      matchesWord(ariaLabel) ||
      matchesWord(title) ||
      matchesWord(id) ||
      matchesWord(className)
    ) {
      let label = text.slice(0, 32);
      if (!label && ariaLabel) label = ariaLabel.slice(0, 32);
      if (!label && title) label = title.slice(0, 32);
      if (!label) label = 'Risky Action';
      return { isRisky: true, label };
    }

    if (current.tagName.toLowerCase() === 'button' || current.tagName.toLowerCase() === 'input') {
      if (type === 'submit' && (formMethod === 'post' || formMethod === 'delete')) {
        return { isRisky: true, label: text || 'Submit Form' };
      }
    }

    current = current.parentElement;
  }

  return { isRisky: false, label: '' };
}

/**
 * Resolves the topmost clickable element under viewport coordinates.
 */
function resolveTarget(coords: { x: number; y: number }, targetElement?: Element | null): Element {
  if (targetElement && document.contains(targetElement)) {
    return targetElement;
  }
  const el = document.elementFromPoint(coords.x, coords.y);
  return el || document.body;
}

/**
 * Dispatches full click event sequence:
 * pointerdown -> mousedown -> focus -> pointerup -> mouseup -> click
 */
export function executeClick(
  coords: { x: number; y: number },
  targetElement?: Element | null,
): boolean {
  const target = resolveTarget(coords, targetElement);

  if (isIframeElement(target)) {
    return forwardActionToIframe(target, 'click', coords.x, coords.y);
  }

  const { x, y } = coords;
  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const baseInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  target.dispatchEvent(new PointerEvent('pointerdown', { ...baseInit, button: 0, buttons: 1 }));
  target.dispatchEvent(
    new MouseEvent('mousedown', { ...baseInit, button: 0, buttons: 1, detail: 1 }),
  );

  executeFocus(target);

  target.dispatchEvent(new PointerEvent('pointerup', { ...baseInit, button: 0, buttons: 0 }));
  target.dispatchEvent(
    new MouseEvent('mouseup', { ...baseInit, button: 0, buttons: 0, detail: 1 }),
  );

  const clickEvent = new MouseEvent('click', { ...baseInit, button: 0, buttons: 0, detail: 1 });
  const dispatched = target.dispatchEvent(clickEvent);

  if (target instanceof HTMLAnchorElement && target.href && !clickEvent.defaultPrevented) {
    if (target.target === '_blank') {
      window.open(target.href, '_blank');
    } else {
      window.location.href = target.href;
    }
  } else {
    const parentLink = target.closest('a');
    if (parentLink && parentLink.href && !clickEvent.defaultPrevented) {
      if (parentLink.target === '_blank') {
        window.open(parentLink.href, '_blank');
      } else {
        window.location.href = parentLink.href;
      }
    }
  }

  return dispatched;
}

/**
 * Dispatches double click sequence.
 */
export function executeDoubleClick(
  coords: { x: number; y: number },
  targetElement?: Element | null,
): boolean {
  const target = resolveTarget(coords, targetElement);

  if (isIframeElement(target)) {
    return forwardActionToIframe(target, 'doubleClick', coords.x, coords.y);
  }

  const { x, y } = coords;
  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const baseInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  target.dispatchEvent(new PointerEvent('pointerdown', { ...baseInit, button: 0, buttons: 1 }));
  target.dispatchEvent(
    new MouseEvent('mousedown', { ...baseInit, button: 0, buttons: 1, detail: 1 }),
  );
  target.dispatchEvent(new PointerEvent('pointerup', { ...baseInit, button: 0, buttons: 0 }));
  target.dispatchEvent(
    new MouseEvent('mouseup', { ...baseInit, button: 0, buttons: 0, detail: 1 }),
  );
  target.dispatchEvent(new MouseEvent('click', { ...baseInit, button: 0, buttons: 0, detail: 1 }));

  target.dispatchEvent(new PointerEvent('pointerdown', { ...baseInit, button: 0, buttons: 1 }));
  target.dispatchEvent(
    new MouseEvent('mousedown', { ...baseInit, button: 0, buttons: 1, detail: 2 }),
  );
  target.dispatchEvent(new PointerEvent('pointerup', { ...baseInit, button: 0, buttons: 0 }));
  target.dispatchEvent(
    new MouseEvent('mouseup', { ...baseInit, button: 0, buttons: 0, detail: 2 }),
  );
  target.dispatchEvent(new MouseEvent('click', { ...baseInit, button: 0, buttons: 0, detail: 2 }));

  return target.dispatchEvent(
    new MouseEvent('dblclick', { ...baseInit, button: 0, buttons: 0, detail: 2 }),
  );
}

/**
 * Dispatches right-click / context menu sequence.
 */
export function executeRightClick(
  coords: { x: number; y: number },
  targetElement?: Element | null,
): boolean {
  const target = resolveTarget(coords, targetElement);

  if (isIframeElement(target)) {
    return forwardActionToIframe(target, 'rightClick', coords.x, coords.y);
  }

  const { x, y } = coords;
  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const baseInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  target.dispatchEvent(new PointerEvent('pointerdown', { ...baseInit, button: 2, buttons: 2 }));
  target.dispatchEvent(
    new MouseEvent('mousedown', { ...baseInit, button: 2, buttons: 2, detail: 1 }),
  );
  target.dispatchEvent(new PointerEvent('pointerup', { ...baseInit, button: 2, buttons: 0 }));
  target.dispatchEvent(
    new MouseEvent('mouseup', { ...baseInit, button: 2, buttons: 0, detail: 1 }),
  );

  return target.dispatchEvent(
    new MouseEvent('contextmenu', { ...baseInit, button: 2, buttons: 0 }),
  );
}

/**
 * Scrolls the innermost scrollable container under coords, or window.
 */
export function executeScroll(
  deltaX: number,
  deltaY: number,
  coords?: { x: number; y: number },
): void {
  let target: Element | null = null;
  if (coords) {
    target = document.elementFromPoint(coords.x, coords.y);
  }

  if (isIframeElement(target)) {
    forwardActionToIframe(target, 'scroll', coords?.x ?? 0, coords?.y ?? 0, deltaX, deltaY);
    return;
  }

  let container: Element | null = target;
  while (container && container !== document.body && container !== document.documentElement) {
    const style = window.getComputedStyle(container);
    const canScrollY =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      container.scrollHeight > container.clientHeight;
    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      container.scrollWidth > container.clientWidth;

    if (canScrollY || canScrollX) {
      break;
    }
    container = container.parentElement;
  }

  if (container && container !== document.body && container !== document.documentElement) {
    container.scrollBy({ left: deltaX, top: deltaY, behavior: 'smooth' });
  } else {
    window.scrollBy({ left: deltaX, top: deltaY, behavior: 'smooth' });
  }
}

/**
 * Continuous Smooth Scrolling using requestAnimationFrame
 */
let continuousScrollRafId: number | null = null;
let continuousScrollLastTime = 0;
let continuousScrollDir: 'down' | 'up' = 'down';
let continuousScrollSpeed = 400; // px/sec

function findScrollContainer(): Element | Window {
  const active = document.activeElement;
  if (active && active !== document.body && active !== document.documentElement) {
    const style = window.getComputedStyle(active);
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      active.scrollHeight > active.clientHeight
    ) {
      return active;
    }
  }
  return window;
}

export function startContinuousScroll(direction: 'down' | 'up' = 'down', speed = 400): void {
  stopContinuousScroll();
  continuousScrollDir = direction;
  continuousScrollSpeed = speed;
  continuousScrollLastTime = performance.now();

  const step = (now: number) => {
    const dt = Math.min((now - continuousScrollLastTime) / 1000, 0.05);
    continuousScrollLastTime = now;
    const distance = (continuousScrollDir === 'down' ? 1 : -1) * continuousScrollSpeed * dt;
    const container = findScrollContainer();
    if (container === window) {
      window.scrollBy(0, distance);
    } else {
      (container as Element).scrollBy(0, distance);
    }
    continuousScrollRafId = requestAnimationFrame(step);
  };

  continuousScrollRafId = requestAnimationFrame(step);
}

export function stopContinuousScroll(): void {
  if (continuousScrollRafId !== null) {
    cancelAnimationFrame(continuousScrollRafId);
    continuousScrollRafId = null;
  }
}

export function isContinuousScrolling(): boolean {
  return continuousScrollRafId !== null;
}

export function scrollPage(direction: 'down' | 'up'): void {
  stopContinuousScroll();
  const delta = (direction === 'down' ? 1 : -1) * (window.innerHeight * 0.85);
  window.scrollBy({ top: delta, behavior: 'smooth' });
}

export function scrollToTop(): void {
  stopContinuousScroll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function scrollToBottom(): void {
  stopContinuousScroll();
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
}

/**
 * Focuses target element with focus events.
 */
export function executeFocus(targetElement: Element): void {
  if (targetElement instanceof HTMLElement && typeof targetElement.focus === 'function') {
    try {
      targetElement.focus();
    } catch {
      // Ignore focus rejection
    }
  }
  targetElement.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  targetElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

/**
 * Drag and drop gesture simulation.
 */
let currentDragTarget: Element | null = null;

export function executeDragStart(
  coords: { x: number; y: number },
  targetElement?: Element | null,
): boolean {
  const target = resolveTarget(coords, targetElement);
  currentDragTarget = target;

  if (isIframeElement(target)) {
    return forwardActionToIframe(target, 'click', coords.x, coords.y);
  }

  const { x, y } = coords;
  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const baseInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  target.dispatchEvent(new PointerEvent('pointerdown', { ...baseInit, button: 0, buttons: 1 }));
  target.dispatchEvent(
    new MouseEvent('mousedown', { ...baseInit, button: 0, buttons: 1, detail: 1 }),
  );

  return true;
}

export function executeDragMove(coords: { x: number; y: number }): boolean {
  const target = currentDragTarget || resolveTarget(coords);
  const { x, y } = coords;
  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const baseInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  target.dispatchEvent(new PointerEvent('pointermove', { ...baseInit, button: 0, buttons: 1 }));
  target.dispatchEvent(new MouseEvent('mousemove', { ...baseInit, button: 0, buttons: 1 }));

  return true;
}

export function executeDragEnd(coords: { x: number; y: number }): boolean {
  const target = currentDragTarget || resolveTarget(coords);
  currentDragTarget = null;

  const { x, y } = coords;
  const screenX = window.screenX + x;
  const screenY = window.screenY + y;

  const baseInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX,
    screenY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };

  target.dispatchEvent(new PointerEvent('pointerup', { ...baseInit, button: 0, buttons: 0 }));
  target.dispatchEvent(
    new MouseEvent('mouseup', { ...baseInit, button: 0, buttons: 0, detail: 1 }),
  );

  return true;
}

/**
 * Unified action dispatcher.
 */
export function executeAction(
  action: 'click' | 'doubleClick' | 'rightClick' | 'scroll' | 'focus',
  coords: { x: number; y: number },
  deltaX = 0,
  deltaY = 0,
  targetElement?: Element | null,
): boolean {
  switch (action) {
    case 'click':
      return executeClick(coords, targetElement);
    case 'doubleClick':
      return executeDoubleClick(coords, targetElement);
    case 'rightClick':
      return executeRightClick(coords, targetElement);
    case 'scroll':
      executeScroll(deltaX, deltaY, coords);
      return true;
    case 'focus':
      if (targetElement) {
        executeFocus(targetElement);
        return true;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Resolves a human-readable label for a DOM element to display in HUD feedback.
 * e.g. "click → Sign in", "open → Documentation", "type → Search"
 */
export function getElementLabel(target: Element | null): string {
  if (!target || target === document.body || target === document.documentElement) {
    return 'Page';
  }

  // 1. Direct text or accessibility labels
  const text = (
    (target as HTMLElement).innerText ||
    target.getAttribute('aria-label') ||
    target.getAttribute('title') ||
    target.getAttribute('placeholder') ||
    (target as HTMLInputElement).value ||
    target.textContent ||
    ''
  )
    .trim()
    .replace(/\s+/g, ' ');

  if (text) {
    return text.length > 24 ? text.slice(0, 22) + '...' : text;
  }

  // 2. Fallback to descriptive tag or role
  const role = target.getAttribute('role');
  if (role) return role.charAt(0).toUpperCase() + role.slice(1);

  const tagName = target.tagName.toLowerCase();
  switch (tagName) {
    case 'a':
      return 'Link';
    case 'button':
      return 'Button';
    case 'input':
      return ((target as HTMLInputElement).type || 'Input').toUpperCase();
    case 'select':
      return 'Select';
    case 'textarea':
      return 'Text Field';
    case 'img':
      return (target as HTMLImageElement).alt || 'Image';
    case 'h1':
    case 'h2':
    case 'h3':
      return 'Heading';
    default:
      return tagName.charAt(0).toUpperCase() + tagName.slice(1);
  }
}

/**
 * Selects text or option in the target element.
 */
export function executeSelect(target: Element): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    executeFocus(target);
    if (typeof target.select === 'function') {
      target.select();
      return true;
    }
  }

  if (target instanceof HTMLSelectElement) {
    executeFocus(target);
    return true;
  }

  executeFocus(target);
  if (typeof window.getSelection === 'function') {
    try {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection.addRange(range);
        return true;
      }
    } catch {
      // Fallback
    }
  }

  return executeClick({ x: 0, y: 0 }, target);
}

/**
 * Opens link in the same tab.
 */
export function executeOpen(target: Element): boolean {
  const anchor = target.closest('a') as HTMLAnchorElement | null;
  if (anchor && anchor.href) {
    window.location.href = anchor.href;
    return true;
  }
  return executeClick({ x: 0, y: 0 }, target);
}

/**
 * Opens link in a new tab.
 */
export function executeOpenNewTab(target: Element): boolean {
  const anchor = target.closest('a') as HTMLAnchorElement | null;
  if (anchor && anchor.href) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'COMMAND',
          payload: { command: 'create-tab', args: { url: anchor.href }, source: 'voice' },
          source: 'content',
        });
        return true;
      }
    } catch {
      // Fallback to window.open
    }
    window.open(anchor.href, '_blank', 'noopener,noreferrer');
    return true;
  }

  // Fallback: click with ctrl/meta key to simulate open in new tab
  const coords = { x: 0, y: 0 };
  const baseInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    metaKey: true,
    view: window,
  };
  target.dispatchEvent(new MouseEvent('click', baseInit));
  return true;
}

/**
 * Focuses element and starts voice dictation on it.
 */
export function executeType(
  target: Element,
  coords: { x: number; y: number },
  dictation?: { startDictating: (coords: { x: number; y: number }, target?: HTMLElement) => void },
): void {
  executeFocus(target);
  if (dictation && typeof dictation.startDictating === 'function') {
    dictation.startDictating(coords, target instanceof HTMLElement ? target : undefined);
  }
}

/**
 * Finds the innermost scrollable container under target or coords.
 */
export function findScrollableContainer(
  coords?: { x: number; y: number },
  target?: Element | null,
): Element | Window {
  let container: Element | null = target || null;
  if (!container && coords && typeof document !== 'undefined') {
    container = document.elementFromPoint(coords.x, coords.y);
  }

  while (container && container !== document.body && container !== document.documentElement) {
    const style = window.getComputedStyle(container);
    const canScrollY =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      container.scrollHeight > container.clientHeight;
    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      container.scrollWidth > container.clientWidth;

    if (canScrollY || canScrollX) {
      return container;
    }
    container = container.parentElement;
  }

  return window;
}

/**
 * Scrolls the specific scrollable container under cursor/target.
 */
export function executeScrollHere(
  coords: { x: number; y: number },
  target?: Element | null,
  deltaY = 280,
): void {
  const container = findScrollableContainer(coords, target);
  if (container === window) {
    window.scrollBy({ top: deltaY, behavior: 'smooth' });
  } else {
    (container as Element).scrollBy({ top: deltaY, behavior: 'smooth' });
  }
}

/**
 * Zooms or smoothly centers the element in the viewport.
 */
export function executeZoomHere(coords: { x: number; y: number }, target?: Element | null): void {
  const el =
    target ||
    (typeof document !== 'undefined' ? document.elementFromPoint(coords.x, coords.y) : null);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }
}

/**
 * Copies link URL to clipboard.
 */
export async function executeCopyLink(target: Element): Promise<string> {
  const anchor = target.closest('a') as HTMLAnchorElement | null;
  const url =
    anchor?.href ||
    (target as any).src ||
    target.getAttribute('href') ||
    (typeof window !== 'undefined' ? window.location.href : '');

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  } catch (err) {
    console.warn('[Handsfree Actions] Failed to copy link to clipboard:', err);
  }
  return url;
}

/**
 * Reads the text content of the element aloud using SpeechSynthesis.
 */
export function executeReadThis(target: Element): string {
  const text = (target instanceof HTMLElement ? target.innerText : target.textContent || '').trim();

  if (typeof window !== 'undefined' && 'speechSynthesis' in window && text) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 1000));
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[Handsfree Actions] Speech synthesis error:', err);
    }
  }

  return text;
}
