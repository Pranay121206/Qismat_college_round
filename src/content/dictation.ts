import { isRiskyAction } from './actions';
import type { VoiceFeedbackPayload } from '../shared/messages';

export type DictationEditingCommand =
  | 'new-line'
  | 'new-paragraph'
  | 'delete-last-word'
  | 'delete-that'
  | 'clear-field'
  | 'comma'
  | 'period'
  | 'question-mark'
  | 'exclamation-mark'
  | 'capitalize-that'
  | 'select-all'
  | 'undo'
  | 'submit'
  | 'stop-typing';

export interface DictationCallbacks {
  onStateChange: (state: 'Dictating' | 'Active') => void;
  showVoiceFeedback: (payload: VoiceFeedbackPayload) => void;
  triggerRiskyGuard: (
    target: Element,
    coords: { x: number; y: number },
    label: string,
    actionFn?: () => void,
  ) => void;
}

const DICTATING_OUTLINE_STYLE_ID = 'handsfree-dictating-styles';

function ensureDictatingStyleTag(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DICTATING_OUTLINE_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = DICTATING_OUTLINE_STYLE_ID;
  style.textContent = `
    .handsfree-dictating-target {
      outline: 3px solid #8b5cf6 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.25), 0 0 16px rgba(139, 92, 246, 0.45) !important;
      transition: outline 0.15s ease-in-out, box-shadow 0.15s ease-in-out !important;
    }
  `;
  document.head?.appendChild(style);
}

/**
 * Checks whether an element is an editable text field (input, textarea, contenteditable, role=textbox).
 */
export function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;

  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled;
  }

  if (el instanceof HTMLInputElement) {
    const nonTextTypes = [
      'button',
      'submit',
      'reset',
      'checkbox',
      'radio',
      'file',
      'image',
      'range',
      'color',
      'hidden',
    ];
    if (nonTextTypes.includes(el.type.toLowerCase())) {
      return false;
    }
    return !el.readOnly && !el.disabled;
  }

  if (el.isContentEditable) return true;
  const ce = el.getAttribute('contenteditable');
  if (ce === 'true' || ce === '') return true;
  if (el.getAttribute('role') === 'textbox') return true;

  return false;
}

/**
 * Resolves editable element: currently focused element, or element under the cursor.
 */
export function resolveEditableTarget(
  activeEl: Element | null,
  cursorCoords?: { x: number; y: number },
): HTMLElement | null {
  // 1. Check focused element
  if (isEditableElement(activeEl)) {
    return activeEl;
  }

  // Check activeElement inside shadowRoot if present
  if (activeEl?.shadowRoot?.activeElement) {
    const shadowActive = activeEl.shadowRoot.activeElement;
    if (isEditableElement(shadowActive)) {
      return shadowActive;
    }
  }

  // 2. Check element under virtual cursor coordinates
  if (cursorCoords && typeof document !== 'undefined') {
    const elUnderCursor = document.elementFromPoint(cursorCoords.x, cursorCoords.y);
    if (isEditableElement(elUnderCursor)) {
      return elUnderCursor;
    }

    const editableAncestor = elUnderCursor?.closest(
      'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]):not([type="range"]):not([type="color"]):not([type="hidden"]), textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
    );
    if (editableAncestor && isEditableElement(editableAncestor)) {
      return editableAncestor as HTMLElement;
    }
  }

  return null;
}

/**
 * Native value setter for input/textarea that triggers input & change events for React/Vue/Angular.
 */
export function setNativeInputValue(
  target: HTMLInputElement | HTMLTextAreaElement,
  newValue: string,
  cursorPosition?: number,
): void {
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor?.set) {
    descriptor.set.call(target, newValue);
  } else {
    target.value = newValue;
  }

  // Dispatch both input and change events so frameworks (React, Vue, Angular) register it
  target.dispatchEvent(new Event('input', { bubbles: true, composed: true, cancelable: false }));
  target.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));

  if (typeof cursorPosition === 'number') {
    try {
      target.setSelectionRange(cursorPosition, cursorPosition);
    } catch {
      // Ignored for input types that do not support setSelectionRange (e.g. email, number)
    }
  }
}

/**
 * Text insertion into contenteditable using beforeinput/insertText with execCommand fallback.
 */
export function insertContentEditableText(target: HTMLElement, text: string): void {
  target.focus();

  // Try standard beforeinput event
  let beforeInputDispatched = false;
  let notCanceled = true;

  try {
    if (typeof InputEvent === 'function') {
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertText',
        data: text,
      });
      notCanceled = target.dispatchEvent(beforeInputEvent);
      beforeInputDispatched = true;
    }
  } catch {
    // InputEvent constructor unavailable in some test environments
  }

  if (!beforeInputDispatched || notCanceled) {
    let success = false;
    try {
      if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
        success = document.execCommand('insertText', false, text);
      }
    } catch {
      success = false;
    }

    if (!success) {
      // Direct DOM Range / text node fallback
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        target.textContent = (target.textContent || '') + text;
      }
    }
  }

  try {
    target.dispatchEvent(
      new Event('input', {
        bubbles: true,
        composed: true,
        cancelable: false,
      }),
    );
  } catch {
    // Ignore event dispatch errors
  }
}

/**
 * Parses utterance for spoken editing commands.
 */
export function parseDictationCommand(rawText: string): DictationEditingCommand | null {
  const norm = rawText
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ');

  if (!norm) return null;

  if (norm === 'new line' || norm === 'newline') return 'new-line';
  if (norm === 'new paragraph') return 'new-paragraph';
  if (
    norm === 'delete last word' ||
    norm === 'delete word' ||
    norm === 'remove last word' ||
    norm === 'delete previous word'
  ) {
    return 'delete-last-word';
  }
  if (
    norm === 'delete that' ||
    norm === 'delete this' ||
    norm === 'scratch that' ||
    norm === 'erase that' ||
    norm === 'remove that'
  ) {
    return 'delete-that';
  }
  if (norm === 'clear field' || norm === 'clear text' || norm === 'clear all' || norm === 'clear') {
    return 'clear-field';
  }
  if (norm === 'comma') return 'comma';
  if (norm === 'period' || norm === 'full stop' || norm === 'dot') return 'period';
  if (norm === 'question mark') return 'question-mark';
  if (norm === 'exclamation mark' || norm === 'exclamation point') return 'exclamation-mark';
  if (norm === 'capitalize that' || norm === 'capitalize') return 'capitalize-that';
  if (norm === 'select all') return 'select-all';
  if (norm === 'undo') return 'undo';
  if (norm === 'submit' || norm === 'press enter' || norm === 'hit enter' || norm === 'enter') {
    return 'submit';
  }
  if (norm === 'stop typing' || norm === 'stop dictation' || norm === 'end typing') {
    return 'stop-typing';
  }

  return null;
}

/**
 * Dispatches Enter keyboard event sequence and form submit.
 */
export function executeDirectSubmit(target: HTMLElement, form?: HTMLFormElement | null): void {
  const enterDown = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const notPrevented = target.dispatchEvent(enterDown);

  const enterPress = new KeyboardEvent('keypress', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(enterPress);

  const enterUp = new KeyboardEvent('keyup', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(enterUp);

  const effectiveForm =
    form ||
    (target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLSelectElement
      ? target.form
      : target.closest('form'));

  if (effectiveForm && notPrevented) {
    try {
      if (typeof effectiveForm.requestSubmit === 'function') {
        effectiveForm.requestSubmit();
      } else if (typeof effectiveForm.submit === 'function') {
        effectiveForm.submit();
      }
    } catch {
      // Forms may throw if an input has id="submit" or is blocked
    }
  }
}

/**
 * Form submit handler with Task 4 Risky Guard protection for sensitive forms.
 */
export function handleSubmitWithRiskyGuard(
  target: HTMLElement | null,
  triggerRiskyGuard: (
    target: Element,
    coords: { x: number; y: number },
    label: string,
    actionFn?: () => void,
  ) => void,
): boolean {
  if (!target) return false;

  const form =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLSelectElement
      ? target.form
      : target.closest('form');

  // Check target itself
  const targetRisky = isRiskyAction(target);
  let formRisky = form ? isRiskyAction(form) : { isRisky: false, label: '' };

  // Check submit button in form if any
  if (form) {
    const submitBtn = form.querySelector(
      'button[type="submit"], input[type="submit"], button:not([type])',
    );
    if (submitBtn) {
      const btnRisky = isRiskyAction(submitBtn);
      if (btnRisky.isRisky) {
        formRisky = btnRisky;
      }
    }
  }

  const risky = targetRisky.isRisky ? targetRisky : formRisky;

  if (risky.isRisky) {
    const rect = target.getBoundingClientRect();
    const coords = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    triggerRiskyGuard(target, coords, risky.label || 'Submit Sensitive Form', () => {
      executeDirectSubmit(target, form);
    });
    return true;
  }

  executeDirectSubmit(target, form);
  return true;
}

/**
 * Searches the page for a search input matching heuristics:
 * input[type=search], [role=search] input, name/placeholder containing "search".
 */
export function findPageSearchBox(): HTMLElement | null {
  const selectors = [
    'input[type="search"]',
    '[role="search"] input',
    'form[role="search"] input',
    '[role="search"] [contenteditable="true"]',
    'input[name*="search" i]',
    'input[placeholder*="search" i]',
    'input[aria-label*="search" i]',
    'input[id*="search" i]',
    'textarea[name*="search" i]',
    'textarea[placeholder*="search" i]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    for (const el of elements) {
      if (isEditableElement(el)) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        ) {
          return el;
        }
      }
    }
  }

  return null;
}

/**
 * Focuses page search box, types query, and submits.
 */
export function executePageSearch(query: string): boolean {
  const searchBox = findPageSearchBox();
  if (!searchBox) return false;

  searchBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  searchBox.focus();

  if (searchBox instanceof HTMLInputElement || searchBox instanceof HTMLTextAreaElement) {
    setNativeInputValue(searchBox, query, query.length);
  } else {
    insertContentEditableText(searchBox, query);
  }

  const form =
    searchBox instanceof HTMLInputElement || searchBox instanceof HTMLTextAreaElement
      ? searchBox.form
      : searchBox.closest('form');
  executeDirectSubmit(searchBox, form);
  return true;
}

/**
 * Dictation Controller managing Dictating state, interim & final live replacements,
 * spoken editing commands, and 15-second silence auto-exit.
 */
export class DictationController {
  private activeTarget: HTMLElement | null = null;
  private isDictating = false;
  private callbacks: DictationCallbacks;

  // Utterance tracking for interim vs final replacement
  private utteranceBaseValue = '';
  private utteranceBaseCursor = 0;
  private hasActiveInterim = false;
  private undoHistory: string[] = [];
  private lastCommittedChunk = '';

  // Silence auto-exit timer (15 seconds)
  private silenceTimer: number | null = null;

  constructor(callbacks: DictationCallbacks) {
    this.callbacks = callbacks;
    ensureDictatingStyleTag();
  }

  isActive(): boolean {
    return this.isDictating;
  }

  getTarget(): HTMLElement | null {
    return this.activeTarget;
  }

  /**
   * Enters Dictating state for active element or element under virtual cursor.
   * If neither is editable, reports "Focus a text field first".
   */
  startDictating(cursorCoords?: { x: number; y: number }): boolean {
    const activeEl = document.activeElement;
    const target = resolveEditableTarget(activeEl, cursorCoords);

    if (!target) {
      this.callbacks.showVoiceFeedback({
        rawText: 'start typing',
        recognized: false,
        message: 'Focus a text field first',
        playTone: false,
      });
      return false;
    }

    // Cleanup previous target if any
    if (this.activeTarget && this.activeTarget !== target) {
      this.activeTarget.classList.remove('handsfree-dictating-target');
    }

    this.activeTarget = target;
    this.isDictating = true;
    target.classList.add('handsfree-dictating-target');
    target.focus();

    this.undoHistory = [];
    this.lastCommittedChunk = '';
    this.resetUtteranceBaseline();

    this.callbacks.onStateChange('Dictating');
    this.callbacks.showVoiceFeedback({
      rawText: 'start typing',
      recognized: true,
      message: 'Dictating',
      playTone: true,
    });

    this.restartSilenceTimer();
    return true;
  }

  /**
   * Exits Dictating state and returns to command mode.
   */
  stopDictating(reason: 'user' | 'timeout' = 'user'): void {
    if (!this.isDictating && !this.activeTarget) return;

    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    // If an interim preview was pending, roll it back
    if (this.hasActiveInterim && this.activeTarget) {
      this.rollbackInterim();
    }

    if (this.activeTarget) {
      this.activeTarget.classList.remove('handsfree-dictating-target');
      this.activeTarget = null;
    }

    this.isDictating = false;
    this.hasActiveInterim = false;
    this.callbacks.onStateChange('Active');

    if (reason === 'timeout') {
      this.callbacks.showVoiceFeedback({
        rawText: 'silence timeout',
        recognized: false,
        message: 'Dictation ended (silence)',
        playTone: false,
      });
    } else {
      this.callbacks.showVoiceFeedback({
        rawText: 'stop typing',
        recognized: true,
        message: 'Typing Stopped',
        playTone: true,
      });
    }
  }

  /**
   * Resets the 15-second silence auto-exit timer upon hearing any speech.
   */
  private restartSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
    }
    this.silenceTimer = window.setTimeout(() => {
      if (this.isDictating) {
        this.stopDictating('timeout');
      }
    }, 15000);
  }

  private resetUtteranceBaseline(): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      this.utteranceBaseValue = this.activeTarget.value;
      this.utteranceBaseCursor = this.activeTarget.selectionStart ?? this.activeTarget.value.length;
    } else {
      this.utteranceBaseValue = this.activeTarget.innerText || this.activeTarget.textContent || '';
      this.utteranceBaseCursor = this.utteranceBaseValue.length;
    }
    this.hasActiveInterim = false;
  }

  private rollbackInterim(): void {
    if (!this.activeTarget || !this.hasActiveInterim) return;

    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      setNativeInputValue(this.activeTarget, this.utteranceBaseValue, this.utteranceBaseCursor);
    } else {
      this.activeTarget.textContent = this.utteranceBaseValue;
    }
    this.hasActiveInterim = false;
  }

  /**
   * Handles incoming speech results (both interim and final).
   */
  handleSpeechResult(text: string, isFinal: boolean): void {
    if (!this.isDictating || !this.activeTarget) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    // Reset 15-second silence timer on any speech
    this.restartSilenceTimer();

    // 1. Interim Speech: Live interim insertion
    if (!isFinal) {
      this.insertInterim(trimmed);
      return;
    }

    // 2. Final Speech: Check for spoken commands first
    const cmd = parseDictationCommand(trimmed);

    if (cmd) {
      // Rollback any live interim preview before executing command
      if (this.hasActiveInterim) {
        this.rollbackInterim();
      }
      this.executeEditingCommand(cmd);
      return;
    }

    // 3. Regular Final Text: Replace interim with final text
    this.insertFinal(trimmed);
  }

  /**
   * Live interim text insertion and replacement.
   */
  private insertInterim(interimText: string): void {
    if (!this.activeTarget) return;

    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      const base = this.utteranceBaseValue;
      const cursor = this.utteranceBaseCursor;

      const needsLeadingSpace =
        cursor > 0 && !/\s$/.test(base.slice(0, cursor)) && !interimText.startsWith(' ');

      const formatted = needsLeadingSpace ? ` ${interimText}` : interimText;
      const nextVal = base.slice(0, cursor) + formatted + base.slice(cursor);

      setNativeInputValue(this.activeTarget, nextVal, cursor + formatted.length);
      this.hasActiveInterim = true;
    } else {
      // Contenteditable live interim
      const base = this.utteranceBaseValue;
      const needsLeadingSpace =
        base.length > 0 && !/\s$/.test(base) && !interimText.startsWith(' ');
      const formatted = needsLeadingSpace ? ` ${interimText}` : interimText;

      this.activeTarget.textContent = base + formatted;
      this.hasActiveInterim = true;
    }
  }

  /**
   * Replaces live interim text with committed final text.
   */
  private insertFinal(finalText: string): void {
    if (!this.activeTarget) return;

    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      const base = this.utteranceBaseValue;
      const cursor = this.utteranceBaseCursor;

      // Save to undo history before committing
      this.undoHistory.push(base);
      if (this.undoHistory.length > 50) this.undoHistory.shift();

      const needsLeadingSpace =
        cursor > 0 && !/\s$/.test(base.slice(0, cursor)) && !finalText.startsWith(' ');

      const formatted = needsLeadingSpace ? ` ${finalText}` : finalText;
      const nextVal = base.slice(0, cursor) + formatted + base.slice(cursor);
      const newCursor = cursor + formatted.length;

      setNativeInputValue(this.activeTarget, nextVal, newCursor);

      this.lastCommittedChunk = formatted;
      this.resetUtteranceBaseline();
    } else {
      // Contenteditable insertion via beforeinput/insertText
      this.rollbackInterim();
      const base = this.utteranceBaseValue;
      const needsLeadingSpace = base.length > 0 && !/\s$/.test(base) && !finalText.startsWith(' ');
      const formatted = needsLeadingSpace ? ` ${finalText}` : finalText;

      this.undoHistory.push(base);
      insertContentEditableText(this.activeTarget, formatted);
      this.lastCommittedChunk = formatted;
      this.resetUtteranceBaseline();
    }
  }

  /**
   * Executes spoken editing commands while dictating.
   */
  executeEditingCommand(cmd: DictationEditingCommand): void {
    if (!this.activeTarget) return;

    switch (cmd) {
      case 'stop-typing':
        this.stopDictating('user');
        break;

      case 'submit':
        handleSubmitWithRiskyGuard(this.activeTarget, this.callbacks.triggerRiskyGuard);
        break;

      case 'new-line':
        this.handleNewLine();
        break;

      case 'new-paragraph':
        this.handleNewParagraph();
        break;

      case 'delete-last-word':
        this.handleDeleteLastWord();
        break;

      case 'delete-that':
        this.handleDeleteThat();
        break;

      case 'clear-field':
        this.handleClearField();
        break;

      case 'comma':
        this.handlePunctuation(', ');
        break;

      case 'period':
        this.handlePunctuation('. ');
        break;

      case 'question-mark':
        this.handlePunctuation('? ');
        break;

      case 'exclamation-mark':
        this.handlePunctuation('! ');
        break;

      case 'capitalize-that':
        this.handleCapitalizeThat();
        break;

      case 'select-all':
        this.handleSelectAll();
        break;

      case 'undo':
        this.handleUndo();
        break;

      default:
        break;
    }
  }

  private handleNewLine(): void {
    if (!this.activeTarget) return;
    if (this.activeTarget instanceof HTMLTextAreaElement) {
      const val = this.activeTarget.value;
      const start = this.activeTarget.selectionStart ?? val.length;
      const end = this.activeTarget.selectionEnd ?? val.length;

      this.undoHistory.push(val);
      const nextVal = val.slice(0, start) + '\n' + val.slice(end);
      setNativeInputValue(this.activeTarget, nextVal, start + 1);
      this.resetUtteranceBaseline();
    } else if (this.activeTarget instanceof HTMLInputElement) {
      // Single-line inputs do not accept newlines, treat as change/no-op
      this.activeTarget.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      insertContentEditableText(this.activeTarget, '\n');
      this.resetUtteranceBaseline();
    }
  }

  private handleNewParagraph(): void {
    if (!this.activeTarget) return;
    if (this.activeTarget instanceof HTMLTextAreaElement) {
      const val = this.activeTarget.value;
      const start = this.activeTarget.selectionStart ?? val.length;
      const end = this.activeTarget.selectionEnd ?? val.length;

      this.undoHistory.push(val);
      const nextVal = val.slice(0, start) + '\n\n' + val.slice(end);
      setNativeInputValue(this.activeTarget, nextVal, start + 2);
      this.resetUtteranceBaseline();
    } else if (this.activeTarget instanceof HTMLInputElement) {
      this.activeTarget.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      insertContentEditableText(this.activeTarget, '\n\n');
      this.resetUtteranceBaseline();
    }
  }

  private handleDeleteLastWord(): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      const val = this.activeTarget.value;
      const start = this.activeTarget.selectionStart ?? val.length;
      const end = this.activeTarget.selectionEnd ?? val.length;

      this.undoHistory.push(val);
      const before = val.slice(0, start);
      const after = val.slice(end);
      const newBefore = before.replace(/\s*\S+\s*$/, '');
      const nextVal = newBefore + after;

      setNativeInputValue(this.activeTarget, nextVal, newBefore.length);
      this.resetUtteranceBaseline();
    } else {
      const text = this.activeTarget.innerText || this.activeTarget.textContent || '';
      this.undoHistory.push(text);
      const newText = text.replace(/\s*\S+\s*$/, '');
      this.activeTarget.textContent = newText;
      this.resetUtteranceBaseline();
    }
  }

  private handleDeleteThat(): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      const val = this.activeTarget.value;
      const start = this.activeTarget.selectionStart ?? val.length;
      const end = this.activeTarget.selectionEnd ?? val.length;

      this.undoHistory.push(val);

      if (end > start) {
        // Delete selected text
        const nextVal = val.slice(0, start) + val.slice(end);
        setNativeInputValue(this.activeTarget, nextVal, start);
      } else if (this.lastCommittedChunk && val.slice(0, start).endsWith(this.lastCommittedChunk)) {
        // Delete last committed phrase
        const before = val.slice(0, start - this.lastCommittedChunk.length);
        const after = val.slice(end);
        setNativeInputValue(this.activeTarget, before + after, before.length);
        this.lastCommittedChunk = '';
      } else {
        // Fallback to delete last word
        this.handleDeleteLastWord();
      }
      this.resetUtteranceBaseline();
    } else {
      this.handleDeleteLastWord();
    }
  }

  private handleClearField(): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      this.undoHistory.push(this.activeTarget.value);
      setNativeInputValue(this.activeTarget, '', 0);
      this.resetUtteranceBaseline();
    } else {
      this.undoHistory.push(this.activeTarget.textContent || '');
      this.activeTarget.textContent = '';
      this.activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
      this.resetUtteranceBaseline();
    }
  }

  private handlePunctuation(mark: string): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      const val = this.activeTarget.value;
      const start = this.activeTarget.selectionStart ?? val.length;
      const end = this.activeTarget.selectionEnd ?? val.length;

      this.undoHistory.push(val);
      // Strip trailing whitespace before cursor so "hello " + ", " -> "hello, "
      const before = val.slice(0, start).replace(/\s+$/, '');
      const after = val.slice(end);
      const nextVal = before + mark + after;
      const newCursor = before.length + mark.length;

      setNativeInputValue(this.activeTarget, nextVal, newCursor);
      this.resetUtteranceBaseline();
    } else {
      insertContentEditableText(this.activeTarget, mark);
      this.resetUtteranceBaseline();
    }
  }

  private handleCapitalizeThat(): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      const val = this.activeTarget.value;
      const start = this.activeTarget.selectionStart ?? val.length;
      const end = this.activeTarget.selectionEnd ?? val.length;

      this.undoHistory.push(val);
      const before = val.slice(0, start);
      const after = val.slice(end);

      // Match last word before cursor: prefix, first char, rest of word, trailing spaces
      const match = before.match(/^(.*?)(\b[a-zA-Z])([a-zA-Z0-9]*)(\s*)$/);
      if (match && match[2]) {
        const capitalized = match[2].toUpperCase() + (match[3] || '');
        const newBefore = (match[1] || '') + capitalized + (match[4] || '');
        setNativeInputValue(this.activeTarget, newBefore + after, start);
        this.resetUtteranceBaseline();
      }
    } else {
      const text = this.activeTarget.innerText || this.activeTarget.textContent || '';
      const match = text.match(/^(.*?)(\b[a-zA-Z])([a-zA-Z0-9]*)(\s*)$/);
      if (match && match[2]) {
        this.undoHistory.push(text);
        const capitalized = match[2].toUpperCase() + (match[3] || '');
        this.activeTarget.textContent = (match[1] || '') + capitalized + (match[4] || '');
        this.resetUtteranceBaseline();
      }
    }
  }

  private handleSelectAll(): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      this.activeTarget.select();
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(this.activeTarget);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  private handleUndo(): void {
    if (!this.activeTarget) return;
    if (
      this.activeTarget instanceof HTMLInputElement ||
      this.activeTarget instanceof HTMLTextAreaElement
    ) {
      if (this.undoHistory.length > 0) {
        const prev = this.undoHistory.pop()!;
        setNativeInputValue(this.activeTarget, prev, prev.length);
        this.resetUtteranceBaseline();
      } else {
        try {
          document.execCommand('undo');
        } catch {
          // Ignore
        }
      }
    } else {
      if (this.undoHistory.length > 0) {
        const prev = this.undoHistory.pop()!;
        this.activeTarget.textContent = prev;
        this.resetUtteranceBaseline();
      } else {
        try {
          document.execCommand('undo');
        } catch {
          // Ignore
        }
      }
    }
  }
}
