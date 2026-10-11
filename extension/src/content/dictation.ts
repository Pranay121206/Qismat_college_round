export class DictationManager {
  private activeElement: HTMLElement | null = null;
  private isDictating: boolean = false;
  private silenceTimer: any = null;
  private previousOutline: string = '';
  private onEnd: (() => void) | null = null;

  public setOnEnd(cb: () => void): void {
    this.onEnd = cb;
  }

  public startDictating(targetEl?: HTMLElement | null): boolean {
    let el = targetEl;

    if (!el) {
      // Use currently focused element
      if (document.activeElement && this.isEditable(document.activeElement as HTMLElement)) {
        el = document.activeElement as HTMLElement;
      }
    }

    if (!el) {
      // Find search box or first input
      el = this.findSearchOrFirstInput();
    }

    if (!el || !this.isEditable(el)) {
      return false;
    }

    this.activeElement = el;
    this.isDictating = true;
    el.focus();

    // Visual indicator on target
    this.previousOutline = el.style.outline;
    el.style.outline = '3px solid #2540e8';

    this.resetSilenceTimer();
    return true;
  }

  /** Type one phrase into the focused field (or the nearest search box) without entering dictation mode. */
  public typeOnce(text: string, hint?: HTMLElement | null): boolean {
    let el: HTMLElement | null = hint && this.isEditable(hint) ? hint : null;
    if (!el && document.activeElement && this.isEditable(document.activeElement as HTMLElement)) {
      el = document.activeElement as HTMLElement;
    }
    if (!el) el = this.findSearchOrFirstInput();
    if (!el) return false;
    el.focus();
    const prevEl = this.activeElement;
    const prevOn = this.isDictating;
    this.activeElement = el;
    this.isDictating = true;
    this.handleText(text);
    this.activeElement = prevEl;
    this.isDictating = prevOn;
    return true;
  }

  public stopDictating(): void {
    if (this.activeElement) {
      this.activeElement.style.outline = this.previousOutline;
      this.activeElement = null;
    }
    const wasOn = this.isDictating;
    this.isDictating = false;
    clearTimeout(this.silenceTimer);
    if (wasOn && this.onEnd) this.onEnd();
  }

  public isActive(): boolean {
    return this.isDictating;
  }

  public handleText(text: string): void {
    if (!this.isDictating || !this.activeElement) return;
    this.resetSilenceTimer();

    if (this.activeElement instanceof HTMLInputElement || this.activeElement instanceof HTMLTextAreaElement) {
      const el = this.activeElement;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;

      const prefix = el.value.substring(0, start);
      const suffix = el.value.substring(end);
      const insert = (prefix.length > 0 && !prefix.endsWith(' ') ? ' ' : '') + text;

      const newValue = prefix + insert + suffix;
      this.setNativeValue(el, newValue);

      el.selectionStart = el.selectionEnd = prefix.length + insert.length;
    } else if (this.activeElement.isContentEditable) {
      // Contenteditable field
      document.execCommand('insertText', false, (this.activeElement.textContent ? ' ' : '') + text);
    }
  }

  public handleNewline(): void {
    if (!this.isDictating || !this.activeElement) return;

    if (this.activeElement instanceof HTMLTextAreaElement) {
      this.handleText('\n');
    } else if (this.activeElement.isContentEditable) {
      document.execCommand('insertParagraph', false);
    }
  }

  public handleDeleteLastWord(): void {
    if (!this.isDictating || !this.activeElement) return;

    if (this.activeElement instanceof HTMLInputElement || this.activeElement instanceof HTMLTextAreaElement) {
      const el = this.activeElement;
      const words = el.value.trim().split(/\s+/);
      words.pop();
      this.setNativeValue(el, words.join(' '));
    } else if (this.activeElement.isContentEditable) {
      document.execCommand('undo', false);
    }
  }

  public handleClear(): void {
    if (!this.isDictating || !this.activeElement) return;

    if (this.activeElement instanceof HTMLInputElement || this.activeElement instanceof HTMLTextAreaElement) {
      this.setNativeValue(this.activeElement, '');
    } else if (this.activeElement.isContentEditable) {
      this.activeElement.innerHTML = '';
    }
  }

  public handleSelectAll(): void {
    if (!this.isDictating || !this.activeElement) return;

    if (this.activeElement instanceof HTMLInputElement || this.activeElement instanceof HTMLTextAreaElement) {
      this.activeElement.select();
    } else if (this.activeElement.isContentEditable) {
      document.execCommand('selectAll', false);
    }
  }

  public handleSubmit(): void {
    if (!this.activeElement) return;

    // Dispatch enter keydown
    const enterInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    this.activeElement.dispatchEvent(new KeyboardEvent('keydown', enterInit));
    this.activeElement.dispatchEvent(new KeyboardEvent('keypress', enterInit));
    this.activeElement.dispatchEvent(new KeyboardEvent('keyup', enterInit));

    // Submit form if part of one
    if (this.activeElement instanceof HTMLInputElement || this.activeElement instanceof HTMLTextAreaElement) {
      if (this.activeElement.form) {
        this.activeElement.form.requestSubmit();
      }
    }
    this.stopDictating();
  }

  private setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');

    if (desc && desc.set) {
      desc.set.call(element, value);
    } else {
      element.value = value;
    }

    // Dispatch modern synthetic input and change events for React/Vue/Angular
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private isEditable(el: HTMLElement): boolean {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'password', 'url', 'number', 'tel'].includes(type);
    }
    return el.isContentEditable;
  }

  public findSearchOrFirstInput(): HTMLElement | null {
    const searchSelector = 'input[type="search"], [role="search"] input, input[name*="search" i], input[placeholder*="search" i], textarea, input[type="text"], input:not([type]), [contenteditable="true"]';
    const all = Array.from(document.querySelectorAll<HTMLElement>(searchSelector));
    // prefer one that is actually on screen
    return all.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    }) || null;
  }

  private resetSilenceTimer(): void {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.isDictating) {
        this.stopDictating();
      }
    }, 60000);
  }
}
