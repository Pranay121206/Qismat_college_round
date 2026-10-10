/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias, @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DictationController,
  executePageSearch,
  findPageSearchBox,
  handleSubmitWithRiskyGuard,
  isEditableElement,
  parseDictationCommand,
  resolveEditableTarget,
  setNativeInputValue,
} from '../dictation';

// --- Lightweight DOM Mock for Node environment ---
class MockClassList {
  private classes = new Set<string>();
  add(cls: string) {
    this.classes.add(cls);
  }
  remove(cls: string) {
    this.classes.delete(cls);
  }
  contains(cls: string) {
    return this.classes.has(cls);
  }
}

class MockEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  constructor(type: string, init?: { bubbles?: boolean; cancelable?: boolean }) {
    this.type = type;
    this.bubbles = Boolean(init?.bubbles);
    this.cancelable = Boolean(init?.cancelable);
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

class MockElement {
  tagName: string;
  parentElement: MockElement | null = null;
  children: MockElement[] = [];
  classList = new MockClassList();
  attributes: Record<string, string> = {};
  listeners: Record<string, ((e: any) => void)[]> = {};
  style: Record<string, string> = {};
  disabled = false;
  readOnly = false;
  isContentEditable = false;
  textContent = '';
  innerText = '';
  id = '';
  form: any = null;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(k: string, v: string) {
    this.attributes[k.toLowerCase()] = v;
    if (k.toLowerCase() === 'id') this.id = v;
  }
  getAttribute(k: string) {
    return this.attributes[k.toLowerCase()] ?? null;
  }
  getAttributeNames(): string[] {
    return Object.keys(this.attributes);
  }
  addEventListener(event: string, fn: (e: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  dispatchEvent(event: MockEvent): boolean {
    const list = this.listeners[event.type] || [];
    for (const fn of list) {
      fn(event);
    }
    return !event.defaultPrevented;
  }
  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
    }
  }
  focus() {
    (globalThis as any).document.activeElement = this;
  }
  blur() {
    if ((globalThis as any).document.activeElement === this) {
      (globalThis as any).document.activeElement = (globalThis as any).document.body;
    }
  }
  closest(selector: string): MockElement | null {
    let cur: MockElement | null = this;
    const s = selector.toLowerCase();
    while (cur) {
      if (cur.tagName.toLowerCase() === s) return cur;
      if (s === 'form' && cur.tagName.toLowerCase() === 'form') return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelector(selector: string): MockElement | null {
    function traverse(el: MockElement): MockElement | null {
      for (const child of el.children) {
        if (child.tagName.toLowerCase() === 'button') return child;
        if (child instanceof MockHTMLInputElement && child.type === 'submit') return child;
        const res = traverse(child);
        if (res) return res;
      }
      return null;
    }
    return traverse(this);
  }
  getBoundingClientRect() {
    return { left: 10, top: 10, width: 200, height: 40, right: 210, bottom: 50 };
  }
  scrollIntoView() {}
}

class MockHTMLInputElement extends MockElement {
  type = 'text';
  private _value = '';
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;
  placeholder = '';

  constructor() {
    super('input');
  }

  get value(): string {
    return this._value;
  }
  set value(v: string) {
    this._value = v;
    this.selectionStart = v.length;
    this.selectionEnd = v.length;
  }
  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  select() {
    this.selectionStart = 0;
    this.selectionEnd = this._value.length;
  }
}

class MockHTMLTextAreaElement extends MockElement {
  private _value = '';
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;

  constructor() {
    super('textarea');
  }

  get value(): string {
    return this._value;
  }
  set value(v: string) {
    this._value = v;
    this.selectionStart = v.length;
    this.selectionEnd = v.length;
  }
  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  select() {
    this.selectionStart = 0;
    this.selectionEnd = this._value.length;
  }
}

class MockHTMLFormElement extends MockElement {
  constructor() {
    super('form');
  }
  requestSubmit() {
    const e = new MockEvent('submit', { cancelable: true });
    this.dispatchEvent(e);
  }
  submit() {
    this.requestSubmit();
  }
}

// Attach mocks to global environment
function setupMockDOM() {
  (globalThis as any).HTMLElement = MockElement;
  (globalThis as any).HTMLInputElement = MockHTMLInputElement;
  (globalThis as any).HTMLTextAreaElement = MockHTMLTextAreaElement;
  (globalThis as any).HTMLFormElement = MockHTMLFormElement;
  (globalThis as any).HTMLButtonElement = MockElement;
  (globalThis as any).HTMLSelectElement = MockElement;
  (globalThis as any).Event = MockEvent;
  (globalThis as any).KeyboardEvent = MockEvent;

  const body = new MockElement('body');
  const head = new MockElement('head');

  const mockDoc = {
    body,
    head,
    activeElement: body,
    createElement(tag: string) {
      if (tag.toLowerCase() === 'input') return new MockHTMLInputElement();
      if (tag.toLowerCase() === 'textarea') return new MockHTMLTextAreaElement();
      if (tag.toLowerCase() === 'form') return new MockHTMLFormElement();
      return new MockElement(tag);
    },
    getElementById(_id: string) {
      return null;
    },
    elementFromPoint(_x: number, _y: number) {
      return body;
    },
    querySelectorAll(selector: string) {
      const results: MockElement[] = [];
      function traverse(el: MockElement) {
        const s = selector.toLowerCase();
        if (
          s.includes('input[type="search"]') &&
          el instanceof MockHTMLInputElement &&
          el.type === 'search'
        ) {
          results.push(el);
        } else if (
          s.includes('[role="search"]') &&
          (el.getAttribute('role') === 'search' ||
            el.parentElement?.getAttribute('role') === 'search')
        ) {
          results.push(el);
        } else if (
          s.includes('placeholder') &&
          el instanceof MockHTMLInputElement &&
          el.placeholder.toLowerCase().includes('search')
        ) {
          results.push(el);
        }
        for (const child of el.children) {
          traverse(child);
        }
      }
      traverse(body);
      return results;
    },
  };

  (globalThis as any).document = mockDoc;
  (globalThis as any).window = {
    setTimeout: (fn: any, ms: any) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
    getSelection() {
      return {
        rangeCount: 0,
        removeAllRanges() {},
        addRange() {},
      };
    },
    getComputedStyle(_el: any) {
      return { display: 'block', visibility: 'visible' };
    },
  };
}

setupMockDOM();

describe('Dictation - Editable Element Detection', () => {
  it('identifies standard text input types as editable', () => {
    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    input.type = 'text';
    expect(isEditableElement(input as unknown as HTMLElement)).toBe(true);

    input.type = 'search';
    expect(isEditableElement(input as unknown as HTMLElement)).toBe(true);

    input.type = 'email';
    expect(isEditableElement(input as unknown as HTMLElement)).toBe(true);

    input.type = 'password';
    expect(isEditableElement(input as unknown as HTMLElement)).toBe(true);
  });

  it('rejects non-text input types and disabled/readonly inputs', () => {
    const btn = document.createElement('input') as unknown as MockHTMLInputElement;
    btn.type = 'button';
    expect(isEditableElement(btn as unknown as HTMLElement)).toBe(false);

    const check = document.createElement('input') as unknown as MockHTMLInputElement;
    check.type = 'checkbox';
    expect(isEditableElement(check as unknown as HTMLElement)).toBe(false);

    const submit = document.createElement('input') as unknown as MockHTMLInputElement;
    submit.type = 'submit';
    expect(isEditableElement(submit as unknown as HTMLElement)).toBe(false);

    const disabledInput = document.createElement('input') as unknown as MockHTMLInputElement;
    disabledInput.type = 'text';
    disabledInput.disabled = true;
    expect(isEditableElement(disabledInput as unknown as HTMLElement)).toBe(false);

    const readOnlyInput = document.createElement('input') as unknown as MockHTMLInputElement;
    readOnlyInput.type = 'text';
    readOnlyInput.readOnly = true;
    expect(isEditableElement(readOnlyInput as unknown as HTMLElement)).toBe(false);
  });

  it('identifies textarea as editable', () => {
    const textarea = document.createElement('textarea') as unknown as MockHTMLTextAreaElement;
    expect(isEditableElement(textarea as unknown as HTMLElement)).toBe(true);

    textarea.disabled = true;
    expect(isEditableElement(textarea as unknown as HTMLElement)).toBe(false);
  });

  it('identifies contenteditable and role=textbox elements as editable', () => {
    const div = document.createElement('div') as unknown as MockElement;
    expect(isEditableElement(div as unknown as HTMLElement)).toBe(false);

    div.setAttribute('contenteditable', 'true');
    expect(isEditableElement(div as unknown as HTMLElement)).toBe(true);

    const roleBox = document.createElement('div') as unknown as MockElement;
    roleBox.setAttribute('role', 'textbox');
    expect(isEditableElement(roleBox as unknown as HTMLElement)).toBe(true);
  });
});

describe('Dictation - Target Resolution & "Focus a text field first"', () => {
  it('resolves focused element when it is editable', () => {
    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    input.focus();

    const target = resolveEditableTarget(input as unknown as HTMLElement);
    expect(target).toBe(input);
  });

  it('falls back to element under cursor when nothing is focused', () => {
    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(input as unknown as Element);

    const target = resolveEditableTarget(document.body as unknown as Element, { x: 100, y: 100 });
    expect(target).toBe(input);
  });

  it('returns null when neither focused nor under cursor is editable', () => {
    const btn = document.createElement('button') as unknown as MockElement;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn as unknown as Element);

    const target = resolveEditableTarget(btn as unknown as Element, { x: 50, y: 50 });
    expect(target).toBeNull();
  });
});

describe('Dictation - Native Value Setter & Event Dispatching', () => {
  it('updates input value and dispatches both input and change events', () => {
    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    let inputFired = false;
    let changeFired = false;

    input.addEventListener('input', () => {
      inputFired = true;
    });
    input.addEventListener('change', () => {
      changeFired = true;
    });

    setNativeInputValue(input as unknown as HTMLInputElement, 'Hello World', 11);
    expect(input.value).toBe('Hello World');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });

  it('updates textarea value and dispatches events', () => {
    const textarea = document.createElement('textarea') as unknown as MockHTMLTextAreaElement;
    let inputFired = false;
    let changeFired = false;

    textarea.addEventListener('input', () => {
      inputFired = true;
    });
    textarea.addEventListener('change', () => {
      changeFired = true;
    });

    setNativeInputValue(textarea as unknown as HTMLTextAreaElement, 'Line 1\nLine 2', 13);
    expect(textarea.value).toBe('Line 1\nLine 2');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });
});

describe('Dictation - Spoken Editing Commands Parser', () => {
  it('parses all 12 spoken editing commands and control commands', () => {
    expect(parseDictationCommand('new line')).toBe('new-line');
    expect(parseDictationCommand('new paragraph')).toBe('new-paragraph');
    expect(parseDictationCommand('delete last word')).toBe('delete-last-word');
    expect(parseDictationCommand('delete that')).toBe('delete-that');
    expect(parseDictationCommand('clear field')).toBe('clear-field');
    expect(parseDictationCommand('comma')).toBe('comma');
    expect(parseDictationCommand('period')).toBe('period');
    expect(parseDictationCommand('question mark')).toBe('question-mark');
    expect(parseDictationCommand('exclamation mark')).toBe('exclamation-mark');
    expect(parseDictationCommand('capitalize that')).toBe('capitalize-that');
    expect(parseDictationCommand('select all')).toBe('select-all');
    expect(parseDictationCommand('undo')).toBe('undo');
    expect(parseDictationCommand('submit')).toBe('submit');
    expect(parseDictationCommand('press enter')).toBe('submit');
    expect(parseDictationCommand('stop typing')).toBe('stop-typing');
  });

  it('returns null for non-command dictation phrases', () => {
    expect(parseDictationCommand('hello world')).toBeNull();
    expect(parseDictationCommand('my grocery list')).toBeNull();
  });
});

describe('DictationController - Lifecycle, Live Interim, and Spoken Commands', () => {
  let input: MockHTMLInputElement;
  let stateChanges: string[] = [];
  let feedbackMessages: string[] = [];
  let controller: DictationController;

  beforeEach(() => {
    vi.useFakeTimers();
    input = document.createElement('input') as unknown as MockHTMLInputElement;
    (document.body as any).appendChild(input);

    stateChanges = [];
    feedbackMessages = [];

    controller = new DictationController({
      onStateChange: (st) => stateChanges.push(st),
      showVoiceFeedback: (fb) => feedbackMessages.push(fb.message),
      triggerRiskyGuard: vi.fn(),
    });
  });

  afterEach(() => {
    controller.stopDictating('user');
    input.remove();
    vi.useRealTimers();
  });

  it('shows "Focus a text field first" when no editable element is present', () => {
    const btn = document.createElement('button') as unknown as MockElement;
    btn.focus();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn as unknown as Element);

    const started = controller.startDictating({ x: 0, y: 0 });
    expect(started).toBe(false);
    expect(controller.isActive()).toBe(false);
    expect(feedbackMessages).toContain('Focus a text field first');
  });

  it('enters Dictating state, adds colored outline, and shows "Dictating"', () => {
    input.focus();
    const started = controller.startDictating();
    expect(started).toBe(true);
    expect(controller.isActive()).toBe(true);
    expect(input.classList.contains('handsfree-dictating-target')).toBe(true);
    expect(stateChanges).toContain('Dictating');
    expect(feedbackMessages).toContain('Dictating');
  });

  it('inserts interim live and replaces it with final text', () => {
    input.focus();
    controller.startDictating();

    // Interim 1
    controller.handleSpeechResult('hello', false);
    expect(input.value).toBe('hello');

    // Interim 2
    controller.handleSpeechResult('hello world', false);
    expect(input.value).toBe('hello world');

    // Final
    controller.handleSpeechResult('hello world', true);
    expect(input.value).toBe('hello world');

    // Next utterance
    controller.handleSpeechResult('again', false);
    expect(input.value).toBe('hello world again');

    controller.handleSpeechResult('again', true);
    expect(input.value).toBe('hello world again');
  });

  it('executes "comma", "period", "question mark", "exclamation mark" cleanly', () => {
    input.focus();
    controller.startDictating();

    controller.handleSpeechResult('hello', true);
    expect(input.value).toBe('hello');

    controller.handleSpeechResult('comma', true);
    expect(input.value).toBe('hello, ');

    controller.handleSpeechResult('how are you', true);
    expect(input.value).toBe('hello, how are you');

    controller.handleSpeechResult('question mark', true);
    expect(input.value).toBe('hello, how are you? ');

    controller.handleSpeechResult('exclamation mark', true);
    expect(input.value).toBe('hello, how are you?! ');
  });

  it('executes "delete last word", "delete that", and "clear field"', () => {
    input.focus();
    controller.startDictating();

    controller.handleSpeechResult('first second third', true);
    expect(input.value).toBe('first second third');

    controller.handleSpeechResult('delete last word', true);
    expect(input.value).toBe('first second');

    controller.handleSpeechResult('delete that', true);
    expect(input.value).toBe('first');

    controller.handleSpeechResult('clear field', true);
    expect(input.value).toBe('');
  });

  it('executes "capitalize that" on the preceding word', () => {
    input.focus();
    controller.startDictating();

    controller.handleSpeechResult('antigravity', true);
    expect(input.value).toBe('antigravity');

    controller.handleSpeechResult('capitalize that', true);
    expect(input.value).toBe('Antigravity');
  });

  it('executes "select all" and "undo"', () => {
    input.focus();
    controller.startDictating();

    controller.handleSpeechResult('alpha beta', true);
    expect(input.value).toBe('alpha beta');

    controller.handleSpeechResult('select all', true);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(10);

    controller.handleSpeechResult('undo', true);
    expect(input.value).toBe('');
  });

  it('auto-exits dictation after 15 seconds of silence with HUD message', () => {
    input.focus();
    controller.startDictating();
    expect(controller.isActive()).toBe(true);

    // Fast forward 14.9s -> still active
    vi.advanceTimersByTime(14900);
    expect(controller.isActive()).toBe(true);

    // Advance 200ms -> 15.1s -> auto exit
    vi.advanceTimersByTime(200);
    expect(controller.isActive()).toBe(false);
    expect(input.classList.contains('handsfree-dictating-target')).toBe(false);
    expect(stateChanges).toContain('Active');
    expect(feedbackMessages).toContain('Dictation ended (silence)');
  });

  it('resets 15-second silence timer when speech is received', () => {
    input.focus();
    controller.startDictating();

    // Advance 10s
    vi.advanceTimersByTime(10000);
    expect(controller.isActive()).toBe(true);

    // Speech arrives at 10s
    controller.handleSpeechResult('still speaking', false);

    // Advance another 10s (total 20s from start, but 10s from last speech)
    vi.advanceTimersByTime(10000);
    expect(controller.isActive()).toBe(true);

    // Advance 6s more -> 16s from speech -> auto exits
    vi.advanceTimersByTime(6000);
    expect(controller.isActive()).toBe(false);
  });

  it('"stop typing" immediately returns to command mode', () => {
    input.focus();
    controller.startDictating();
    expect(controller.isActive()).toBe(true);

    controller.handleSpeechResult('stop typing', true);
    expect(controller.isActive()).toBe(false);
    expect(input.classList.contains('handsfree-dictating-target')).toBe(false);
    expect(feedbackMessages).toContain('Typing Stopped');
  });
});

describe('Dictation - Submit & Risky Guard (Task 4)', () => {
  it('submits a normal form directly when not risky', () => {
    const form = document.createElement('form') as unknown as MockHTMLFormElement;
    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    input.form = form;
    form.appendChild(input as unknown as MockElement);
    (document.body as any).appendChild(form);

    const submitSpy = vi.fn();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitSpy();
    });

    const riskyGuardSpy = vi.fn();
    const result = handleSubmitWithRiskyGuard(input as unknown as HTMLElement, riskyGuardSpy);

    expect(result).toBe(true);
    expect(riskyGuardSpy).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalled();
    form.remove();
  });

  it('triggers Risky Guard for sensitive forms (delete/payment/purge)', () => {
    const form = document.createElement('form') as unknown as MockHTMLFormElement;
    const deleteBtn = document.createElement('button') as unknown as MockElement;
    deleteBtn.setAttribute('type', 'submit');
    deleteBtn.textContent = 'Delete Account';
    form.appendChild(deleteBtn);

    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    input.form = form;
    form.appendChild(input as unknown as MockElement);
    (document.body as any).appendChild(form);

    const riskyGuardSpy = vi.fn();
    const result = handleSubmitWithRiskyGuard(input as unknown as HTMLElement, riskyGuardSpy);

    expect(result).toBe(true);
    expect(riskyGuardSpy).toHaveBeenCalledTimes(1);
    expect(riskyGuardSpy).toHaveBeenCalledWith(
      input,
      expect.any(Object),
      expect.stringMatching(/delete/i),
      expect.any(Function),
    );

    form.remove();
  });
});

describe('Dictation - Search Box Heuristic & Execution (Requirement 6)', () => {
  it('finds search box matching input[type=search]', () => {
    const searchInput = document.createElement('input') as unknown as MockHTMLInputElement;
    searchInput.type = 'search';
    (document.body as any).appendChild(searchInput);

    const found = findPageSearchBox();
    expect(found).toBe(searchInput);
    searchInput.remove();
  });

  it('finds search box matching placeholder containing "search"', () => {
    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    input.type = 'text';
    input.placeholder = 'Search documentation...';
    (document.body as any).appendChild(input);

    const found = findPageSearchBox();
    expect(found).toBe(input);
    input.remove();
  });

  it('executes page search: focuses search box, types query, and submits', () => {
    const form = document.createElement('form') as unknown as MockHTMLFormElement;
    const input = document.createElement('input') as unknown as MockHTMLInputElement;
    input.type = 'search';
    input.form = form;
    form.appendChild(input as unknown as MockElement);
    (document.body as any).appendChild(form);

    let submitted = false;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitted = true;
    });

    const success = executePageSearch('vitest reactive testing');
    expect(success).toBe(true);
    expect(input.value).toBe('vitest reactive testing');
    expect(submitted).toBe(true);
    form.remove();
  });
});
