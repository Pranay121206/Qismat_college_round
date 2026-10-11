import { TrackingMode } from '../shared/messages';

const HELP_ROWS: Array<[string, string]> = [
  ['scroll down / up', 'Smooth scroll. Add "slowly" or "fast". Say "stop" to stop.'],
  ['next / previous', 'Move to the next or previous reel, short or post.'],
  ['click', 'Click where the pointer is. "double click", "right click" also work.'],
  ['click <name>', 'Click a button or link by its label, for example "click sign in".'],
  ['show hints, click 4', 'Number every link on screen, then pick one.'],
  ['type hello world', 'Type into the focused field. "start typing" keeps dictating.'],
  ['search for <words>', 'Search the web. "go to youtube" opens a site.'],
  ['go back, new tab, tab 2', 'Browser and tab control.'],
  ['pause video, mute', 'Control the video on the page.'],
  ['center', 'Make the way you are sitting right now the new middle.'],
  ['sleep / wake up', 'Pause and resume listening and tracking.']
];

/** Small status pill, a transient message line, and the "what can I say" sheet. */
export class HeadsUpDisplay {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private pill: HTMLElement;
  private dot: HTMLElement;
  private stateText: HTMLElement;
  private heard: HTMLElement;
  private toast: HTMLElement;
  private confirm: HTMLElement;
  private confirmText: HTMLElement;
  private help: HTMLElement;
  private toastTimer: number | null = null;
  private heardTimer: number | null = null;
  private warnTimer: number | null = null;
  private mode: TrackingMode = 'head';
  private active = false;
  private asleep = false;
  private dictating = false;
  private persistentError = '';

  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'handsfree-hud-root';
    Object.assign(this.host.style, { position: 'fixed', left: '0', bottom: '0', zIndex: '2147483646', pointerEvents: 'none' });
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .wrap {
        position: fixed; left: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
        font: 500 13px/1.35 'Public Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; color: #f4f6f8;
        max-width: min(420px, calc(100vw - 32px));
      }
      .pill, .toast, .heard {
        background: #131a2a; border-radius: 10px; padding: 8px 12px; box-shadow: 0 6px 24px rgba(19,26,42,.35);
        border: 1px solid rgba(255,255,255,.12);
      }
      .pill { display: flex; align-items: center; gap: 9px; font-weight: 600; }
      .dot { width: 9px; height: 9px; border-radius: 50%; background: #6b7488; flex: none; }
      .on .dot { background: #ffd60a; box-shadow: 0 0 0 3px rgba(255,214,10,.25); }
      .sleep .dot { background: #6b7488; }
      .err .dot { background: #ff6b7d; }
      .mode { color: #aab3c5; font-weight: 500; }
      .heard { font-style: italic; color: #d4d9e3; display: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .toast { display: none; }
      .toast.ok { border-left: 4px solid #3ccf91; }
      .toast.bad { border-left: 4px solid #ff6b7d; }
      .confirm {
        display: none; pointer-events: auto; background: #fff; color: #131a2a; border-radius: 12px; padding: 14px 16px;
        box-shadow: 0 10px 40px rgba(19,26,42,.4); border: 2px solid #131a2a; max-width: 340px;
      }
      .confirm b { display: block; margin-bottom: 4px; font-size: 14px; }
      .confirm span { color: #4b546a; }
      .help {
        display: none; position: fixed; right: 16px; bottom: 16px; width: min(440px, calc(100vw - 32px)); max-height: 70vh; overflow: auto;
        background: #fff; color: #131a2a; border-radius: 14px; padding: 16px 18px; border: 2px solid #131a2a; box-shadow: 0 16px 50px rgba(19,26,42,.4);
      }
      .help h2 { font: 700 15px 'Bricolage Grotesque', 'Public Sans', system-ui, sans-serif; margin: 0 0 8px; }
      .help dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; }
      .help dt { font-weight: 700; }
      .help dd { margin: 0; color: #4b546a; }
      .help p { margin: 10px 0 0; color: #4b546a; font-size: 12px; }
      .hc .pill, .hc .toast, .hc .heard { background: #000; border-color: #fff; }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = `
      <div class="confirm" role="alertdialog" aria-live="assertive"><b></b><span>Say "yes" to continue or "no" to cancel.</span></div>
      <div class="toast" role="status" aria-live="polite"></div>
      <div class="heard" aria-hidden="true"></div>
      <div class="pill"><span class="dot"></span><span class="state">Handsfree off</span><span class="mode"></span></div>`;
    this.pill = wrap.querySelector('.pill') as HTMLElement;
    this.dot = wrap.querySelector('.dot') as HTMLElement;
    this.stateText = wrap.querySelector('.state') as HTMLElement;
    this.heard = wrap.querySelector('.heard') as HTMLElement;
    this.toast = wrap.querySelector('.toast') as HTMLElement;
    this.confirm = wrap.querySelector('.confirm') as HTMLElement;
    this.confirmText = this.confirm.querySelector('b') as HTMLElement;

    this.help = document.createElement('div');
    this.help.className = 'help';
    this.help.innerHTML = `<h2>What you can say</h2><dl>${HELP_ROWS.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl><p>Say "close help" to dismiss this.</p>`;

    this.shadow.append(style, wrap, this.help);
    document.documentElement.appendChild(this.host);
    this.render();
  }

  private render(): void {
    const wrap = this.pill.parentElement as HTMLElement;
    wrap.classList.remove('on', 'sleep', 'err');
    let label = 'Handsfree off';
    if (this.persistentError) {
      wrap.classList.add('err');
      label = this.persistentError;
    } else if (this.active && this.asleep) {
      wrap.classList.add('sleep');
      label = 'Sleeping. Say "wake up"';
    } else if (this.active && this.dictating) {
      wrap.classList.add('on');
      label = 'Dictating. Say "stop typing" to finish';
    } else if (this.active) {
      wrap.classList.add('on');
      label = 'Handsfree on';
    }
    this.stateText.textContent = label;
    (this.pill.querySelector('.mode') as HTMLElement).textContent = this.active && !this.persistentError ? (this.mode === 'head' ? 'head' : 'hand') : '';
  }

  public setStatus(active: boolean, dictating = false, asleep = false): void {
    this.active = active;
    this.dictating = dictating;
    this.asleep = asleep;
    this.render();
  }

  public setMode(mode: TrackingMode): void {
    this.mode = mode;
    this.render();
  }

  /** A problem that should stay visible until it clears (camera blocked, model missing...). */
  public setError(message: string | undefined): void {
    this.persistentError = message ? message.slice(0, 110) : '';
    this.render();
  }

  public setTranscript(text: string): void {
    if (!text) return;
    this.heard.style.display = 'block';
    this.heard.textContent = `“${text}”`;
    if (this.heardTimer) clearTimeout(this.heardTimer);
    this.heardTimer = window.setTimeout(() => (this.heard.style.display = 'none'), 3500);
  }

  public showCommand(text: string, success = true): void {
    this.flash(text, success ? 'ok' : 'bad', 1800);
  }

  public showWarning(message: string): void {
    this.flash(message, 'bad', 2600);
  }

  private flash(text: string, kind: 'ok' | 'bad', ms: number): void {
    this.toast.className = `toast ${kind}`;
    this.toast.textContent = text;
    this.toast.style.display = 'block';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.style.display = 'none'), ms);
  }

  public showConfirmDialog(actionName: string): void {
    this.confirmText.textContent = `Do you want to "${actionName || 'continue'}"?`;
    this.confirm.style.display = 'block';
  }

  public hideConfirmDialog(): void {
    this.confirm.style.display = 'none';
  }

  public showHelp(): void {
    this.help.style.display = 'block';
  }

  public hideHelp(): void {
    this.help.style.display = 'none';
  }

  public setHighContrast(on: boolean): void {
    (this.pill.parentElement as HTMLElement).classList.toggle('hc', on);
  }

  public show(): void {
    this.host.style.display = '';
  }

  public hide(): void {
    this.host.style.display = 'none';
  }

  public destroy(): void {
    this.host.remove();
  }
}
