import { defineContentScript } from 'wxt/utils/define-content-script';
import { VirtualCursor } from '../src/content/cursor';
import { HeadsUpDisplay } from '../src/content/hud';
import { ActionExecutor } from '../src/content/actions';
import { HintOverlay } from '../src/content/hints';
import { DictationManager } from '../src/content/dictation';
import { MultimodalFusion } from '../src/content/fusion';
import { SmoothScroller } from '../src/content/scroller';
import { OneEuroPointFilter } from '../src/shared/oneEuro';
import { Stabilizer } from '../src/shared/mapper';
import { clamp, mapHand, mapHead, recenter, smoothingToParams, toScreen } from '../src/shared/mapper';
import { DEFAULT_SETTINGS, HandsfreeSettings, loadSettings, onSettingsChanged, saveSettings } from '../src/shared/settings';
import { playClickSound, playErrorSound, playSuccessSound } from '../src/shared/sound';
import { EngineStatus, PoseFrame } from '../src/shared/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: true,
  main() {
    // The overlay lives in the top page only.
    if (window.top !== window.self) return;

    // A previous copy of this script (before an extension reload) may have left its overlay behind.
    document.querySelectorAll('#handsfree-cursor-root, #handsfree-hud-root, #handsfree-hints-root').forEach((n) => n.remove());

    let settings: HandsfreeSettings = { ...DEFAULT_SETTINGS };
    let running = false;
    let asleep = false;

    const cursor = new VirtualCursor();
    const hud = new HeadsUpDisplay();
    const actions = new ActionExecutor();
    const hints = new HintOverlay();
    const dictation = new DictationManager();
    const fusion = new MultimodalFusion();
    const scroller = new SmoothScroller();
    const filter = new OneEuroPointFilter(0.7, 0.01);
    const stabilizer = new Stabilizer();
    // Smooth pointer pipeline: sensor -> 1€ filter -> stabiliser -> eased at display rate (rAF)
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let easedX = targetX;
    let easedY = targetY;
    let lastFrameT = performance.now();
    let rafOn = false;
    let gestureHoldUntil = 0;
    let easeTau = 0.035;

    let screenX = window.innerWidth / 2;
    let screenY = window.innerHeight / 2;
    let lastRaw = { x: 0, y: 0 };
    let haveRaw = false;
    let lastPoseAt = 0;
    let lostWarnAt = 0;

    // dwell
    let dwellStart: number | null = null;
    let dwellAnchor = { x: 0, y: 0 };
    let dwellArmed = true;
    let dwellTarget: HTMLElement | null = null;

    // pinch (hand mode)
    let pinchPrev = false;

    // snapping, refreshed at a limited rate
    let snapped: { el: HTMLElement; cx: number; cy: number } | null = null;
    let lastSnapAt = 0;
    let snapMissAt = 0;

    function applySettings(next: HandsfreeSettings) {
      settings = next;
      cursor.setSize(settings.cursorSize);
      cursor.setHighContrast(settings.highContrast);
      hud.setHighContrast(settings.highContrast);
      hud.setMode(settings.mode);
      const p = smoothingToParams(settings.smoothing);
      filter.setParams(p.minCutoff, p.beta);
      scroller.setBaseSpeed(settings.scrollSpeed);
    }

    function setRunning(isRunning: boolean, isAsleep: boolean) {
      running = isRunning;
      asleep = isAsleep;
      if (!running) {
        cursor.hide();
        scroller.stop();
      } else {
        cursor.show();
        cursor.setAsleep(asleep);
        cursor.moveTo(screenX, screenY);
      }
      hud.setStatus(running, dictation.isActive(), asleep);
    }

    function isInteractive(el: Element | null): el is HTMLElement {
      if (!el) return false;
      if (el.closest('#handsfree-cursor-root, #handsfree-hud-root, #handsfree-hints-root')) return false;
      return !!el.closest(
        'a, button, input, select, textarea, summary, label, video, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [onclick], [tabindex]:not([tabindex="-1"])'
      );
    }

    function interactiveAncestor(el: Element): HTMLElement {
      return (el.closest(
        'a, button, input, select, textarea, summary, label, video, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [onclick], [tabindex]:not([tabindex="-1"])'
      ) || el) as HTMLElement;
    }

    function findClickableNear(x: number, y: number, radius: number) {
      const centerEl = document.elementFromPoint(x, y);
      if (isInteractive(centerEl)) {
        const el = interactiveAncestor(centerEl);
        const r = el.getBoundingClientRect();
        return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, direct: true };
      }
      if (radius <= 0) return null;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const probe = document.elementFromPoint(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        if (isInteractive(probe)) {
          const el = interactiveAncestor(probe);
          const r = el.getBoundingClientRect();
          return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, direct: false };
        }
      }
      return null;
    }

    function updateCursor(x: number, y: number) {
      screenX = clamp(x, 4, window.innerWidth - 4);
      screenY = clamp(y, 4, window.innerHeight - 4);

      const now = performance.now();
      if (now - lastSnapAt > 60) {
        lastSnapAt = now;
        const found = findClickableNear(screenX, screenY, settings.snapRadius);
        if (found) {
          snapMissAt = 0;
          if (!snapped || snapped.el !== found.el) { snapped = { el: found.el, cx: found.cx, cy: found.cy }; cursor.highlightTarget(found.el); }
        } else if (snapped) {
          // sticky: only let go after ~180ms without a hit, so edges do not flicker
          if (!snapMissAt) snapMissAt = now;
          if (now - snapMissAt > 180) { snapped = null; snapMissAt = 0; cursor.clearHighlight(); }
        }
        actions.hoverAt(screenX, screenY);
      }

      // No positional pull: the pointer stays exactly where you aim. Snap only picks the target.
      const rx = screenX;
      const ry = screenY;
      cursor.moveTo(rx, ry);

      if (settings.dwellClickEnabled && settings.inputStyle !== 'voice_only') handleDwell(rx, ry);
      else cursor.setDwellProgress(0);
    }

    function handleDwell(x: number, y: number) {
      // Dwell only starts on something clickable, so resting on plain text never clicks by accident.
      if (!snapped || dictation.isActive() || !fusion.canClick()) {
        dwellStart = null;
        cursor.setDwellProgress(0);
        if (!snapped) dwellArmed = true;
        return;
      }

      const moved = Math.hypot(x - dwellAnchor.x, y - dwellAnchor.y);

      if (!dwellArmed) {
        // after a click, require the pointer to leave before another dwell can begin
        if (moved > settings.tolerancePx * 1.5 || snapped.el !== dwellTarget) dwellArmed = true;
        else return;
      }

      if (dwellStart === null || moved > settings.tolerancePx || snapped.el !== dwellTarget) {
        dwellStart = Date.now();
        dwellAnchor = { x, y };
        dwellTarget = snapped.el;
        cursor.setDwellProgress(0);
        return;
      }

      const progress = (Date.now() - dwellStart) / settings.dwellMs;
      cursor.setDwellProgress(progress);
      if (progress >= 1) {
        dwellStart = null;
        dwellArmed = false;
        cursor.setDwellProgress(0);
        performClick(x, y, 'dwell');
      }
    }

    function performClick(x: number, y: number, source: 'dwell' | 'voice' | 'pinch') {
      let cx = x;
      let cy = y;
      if (source === 'voice') ({ x: cx, y: cy } = fusion.resolveVoiceTarget(x, y));

      const result = actions.clickAt(cx, cy);
      fusion.markClickExecuted();

      if (result.isSensitive) {
        hud.showConfirmDialog(result.targetText || 'this action');
        if (settings.soundFeedback) playErrorSound();
        return;
      }
      if (!result.success) {
        hud.showCommand('Nothing to click here', false);
        return;
      }
      cursor.flashClick();
      if (settings.soundFeedback) playClickSound();
      hud.showCommand(result.targetText ? `Clicked “${result.targetText.slice(0, 24)}”` : 'Clicked', true);
    }

    function startLoop() {
      if (rafOn) return;
      rafOn = true;
      lastFrameT = performance.now();
      const step = (t: number) => {
        if (!running) { rafOn = false; return; }
        const dt = Math.min(0.1, (t - lastFrameT) / 1000);
        lastFrameT = t;
        if (!asleep && performance.now() - lastPoseAt < 1500) {
          // exponential ease: ~35ms time constant gives 60fps motion from 30fps samples
          const a = 1 - Math.exp(-dt / easeTau);
          easedX += (targetX - easedX) * a;
          easedY += (targetY - easedY) * a;
          updateCursor(easedX, easedY);
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    function handlePose(pose: PoseFrame) {
      if (!running || asleep) return;
      lastPoseAt = performance.now();

      if (pose.faceLost) {
        dwellStart = null;
        cursor.setDwellProgress(0);
        if (Date.now() - lostWarnAt > 3000) {
          lostWarnAt = Date.now();
          hud.showWarning(pose.mode === 'hand' ? 'Hand not visible' : 'Face not visible. Look at the camera.');
        }
        return;
      }
      if (pose.lightingWarning && Date.now() - lostWarnAt > 6000) {
        lostWarnAt = Date.now();
        hud.showWarning(pose.lightingWarning);
      }

      lastRaw = { x: pose.rawX, y: pose.rawY };
      haveRaw = true;
      if (pose.hold) return; // mouth open / head tilted: freeze the pointer so gestures never drag it

      const n =
        pose.mode === 'hand'
          ? mapHand(lastRaw, settings.sensitivity)
          : mapHead(lastRaw, settings.calibration, settings.sensitivity, settings.deadZone);
      const target = toScreen(n, window.innerWidth, window.innerHeight);
      // filter on the camera's own clock, not on message arrival time (which arrives in bursts)
      const smooth = filter.filter(target.x, target.y, pose.timestamp);
      // hand landmarks are noisier than the face mesh: wider dead-radius, gentler easing
      stabilizer.radius = pose.mode === 'hand' ? 6 : 3.5;
      easeTau = pose.mode === 'hand' ? 0.055 : 0.035;
      const stable = stabilizer.update(smooth.x, smooth.y);
      if (performance.now() > gestureHoldUntil) { targetX = stable.x; targetY = stable.y; }
      startLoop();

      if (pose.mode === 'hand') {
        const pinch = !!pose.pinch;
        cursor.setPinch(pinch);
        if (pinch && !pinchPrev && fusion.canClick()) performClick(screenX, screenY, 'pinch');
        pinchPrev = pinch;
      }
    }

    // While no camera data is arriving, let the real mouse drive the pointer so it can be seen and tested.
    window.addEventListener(
      'mousemove',
      (e) => {
        if (!running || asleep) return;
        if (performance.now() - lastPoseAt < 1500) return;
        targetX = easedX = e.clientX; targetY = easedY = e.clientY;
        updateCursor(e.clientX, e.clientY);
      },
      { passive: true }
    );

    function doRecenter() {
      if (!haveRaw) {
        hud.showCommand('No tracking yet', false);
        return;
      }
      const next = recenter(settings.calibration, lastRaw);
      settings = { ...settings, calibration: next };
      void saveSettings({ calibration: next });
      filter.reset();
      stabilizer.reset();
      targetX = easedX = window.innerWidth / 2;
      targetY = easedY = window.innerHeight / 2;
      screenX = window.innerWidth / 2;
      screenY = window.innerHeight / 2;
      cursor.moveTo(screenX, screenY);
      hud.showCommand('Centered', true);
      if (settings.soundFeedback) playSuccessSound();
    }

    function findSearchBox(): HTMLInputElement | null {
      const sel = 'input[type="search"], input[name="q"], input[name="search_query"], input[name*="search" i], input[placeholder*="search" i], input[aria-label*="search" i], [role="search"] input, textarea[name="q"], input[type="text"]';
      const all = Array.from(document.querySelectorAll<HTMLInputElement>(sel));
      return all.find((el) => { const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 10 && r.bottom > 0 && r.top < window.innerHeight; }) || null;
    }
    function setValue(el: HTMLInputElement, v: string) {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      desc?.set ? desc.set.call(el, v) : (el.value = v);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: v }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function speedLabel(s: 'slow' | 'normal' | 'fast') {
      return s === 'slow' ? 'slowly' : s === 'fast' ? 'fast' : '';
    }

    function handleCommand(msg: { action: string; payload?: any }) {
      const { action, payload } = msg;
      switch (action) {
        case 'CLICK':
          performClick(screenX, screenY, 'voice');
          break;
        case 'CLICK_TEXT': {
          const r = actions.clickByText(String(payload || ''));
          if (r.isSensitive) {
            hud.showConfirmDialog(r.label || 'this action');
            if (settings.soundFeedback) playErrorSound();
          } else if (r.success) {
            cursor.flashClick();
            if (settings.soundFeedback) playClickSound();
            hud.showCommand(`Clicked “${(r.label || '').slice(0, 24)}”`, true);
          } else {
            hud.showCommand(`Couldn't find “${String(payload).slice(0, 24)}”`, false);
          }
          break;
        }
        case 'DOUBLE_CLICK':
          actions.doubleClickAt(screenX, screenY);
          cursor.flashClick();
          hud.showCommand('Double click', true);
          break;
        case 'RIGHT_CLICK':
          actions.rightClickAt(screenX, screenY);
          hud.showCommand('Right click', true);
          break;

        case 'SCROLL_DOWN':
        case 'SCROLL_UP': {
          const dir = action === 'SCROLL_DOWN' ? 'down' : 'up';
          const mode = scroller.start(dir, screenX, screenY, payload?.speed);
          hud.showCommand(mode === 'step' ? (dir === 'down' ? 'Next' : 'Previous') : `Scrolling ${dir} ${speedLabel(payload?.speed || 'normal')}`.trim(), true);
          break;
        }
        case 'SCROLL_SLOWER':
          hud.showCommand(`Scrolling ${speedLabel(scroller.slower()) || 'slower'}`.trim(), true);
          break;
        case 'SCROLL_FASTER':
          hud.showCommand(`Scrolling ${speedLabel(scroller.faster()) || 'faster'}`.trim(), true);
          break;
        case 'STOP_SCROLL':
          scroller.stop();
          hud.showCommand('Stopped', true);
          break;
        case 'SCROLL_PAGE_DOWN':
          scroller.page('down', screenX, screenY);
          break;
        case 'SCROLL_PAGE_UP':
          scroller.page('up', screenX, screenY);
          break;
        case 'SCROLL_NUDGE':
          scroller.nudge(payload === 'up' ? 'up' : 'down', screenX, screenY);
          break;
        case 'SCROLL_TOP':
          scroller.toEdge('top', screenX, screenY);
          hud.showCommand('Top', true);
          break;
        case 'SCROLL_BOTTOM':
          scroller.toEdge('bottom', screenX, screenY);
          hud.showCommand('Bottom', true);
          break;
        case 'NEXT_ITEM':
          scroller.stepItem('down', screenX, screenY);
          hud.showCommand('Next', true);
          break;
        case 'PREV_ITEM':
          scroller.stepItem('up', screenX, screenY);
          hud.showCommand('Previous', true);
          break;

        case 'MEDIA_PLAY':
        case 'MEDIA_PAUSE':
        case 'MEDIA_MUTE':
        case 'MEDIA_UNMUTE': {
          const kind = action.replace('MEDIA_', '').toLowerCase() as 'play' | 'pause' | 'mute' | 'unmute';
          const ok = actions.media(kind);
          hud.showCommand(ok ? kind[0].toUpperCase() + kind.slice(1) : 'No video on this page', ok);
          break;
        }

        case 'SITE_SEARCH':
        case 'FOCUS_SEARCH': {
          const box = findSearchBox();
          if (!box) {
            if (action === 'SITE_SEARCH') chrome.runtime.sendMessage({ type: 'WEB_SEARCH', query: payload }).catch(() => {});
            else hud.showCommand('No search box here', false);
            break;
          }
          if (action === 'SITE_SEARCH') {
            dictation.typeOnce('', box);
            setValue(box, String(payload || ''));
            box.focus();
            const enter = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
            box.dispatchEvent(new KeyboardEvent('keydown', enter));
            box.dispatchEvent(new KeyboardEvent('keypress', enter));
            (box.form as HTMLFormElement | null)?.requestSubmit?.();
            box.dispatchEvent(new KeyboardEvent('keyup', enter));
            hud.showCommand(`Searching “${String(payload).slice(0, 24)}”`, true);
          } else {
            box.focus();
            if (dictation.startDictating(box)) {
              hud.setStatus(true, true, asleep);
              chrome.runtime.sendMessage({ type: 'DICTATION_STATE', active: true }).catch(() => {});
              hud.showCommand('Say what to search, then “submit”', true);
            }
          }
          break;
        }
        case 'FULLSCREEN': {
          const v = document.querySelector('video');
          if (v) void (v.requestFullscreen?.() ?? Promise.resolve());
          break;
        }
        case 'SHOW_HINTS':
          hints.show();
          hud.showCommand('Say “click” and a number', true);
          break;
        case 'HIDE_HINTS':
          hints.hide();
          break;
        case 'CLICK_HINT': {
          if (!hints.isActive()) {
            hud.showCommand('Say “show hints” first', false);
            break;
          }
          const ok = hints.clickHint(payload);
          hud.showCommand(ok ? `Clicked ${payload}` : `No link ${payload}`, ok);
          if (ok && settings.soundFeedback) playClickSound();
          break;
        }
        case 'TYPE_HINT': {
          if (!hints.isActive()) {
            hud.showCommand('Say “show hints” first', false);
            break;
          }
          const ok = hints.typeHint(payload);
          hud.showCommand(ok ? `Typing in ${payload}` : `No field ${payload}`, ok);
          break;
        }

        case 'START_TYPING': {
          const el = snapped?.el || (document.elementFromPoint(screenX, screenY) as HTMLElement | null);
          const ok = dictation.startDictating(el && el.closest('input, textarea, [contenteditable]') ? (el.closest('input, textarea, [contenteditable]') as HTMLElement) : undefined);
          if (ok) {
            hud.setStatus(true, true, asleep);
            chrome.runtime.sendMessage({ type: 'DICTATION_STATE', active: true }).catch(() => {});
            hud.showCommand('Dictating. Say “stop typing” when done.', true);
          } else {
            hud.showWarning('Point at a text field first');
          }
          break;
        }
        case 'STOP_TYPING':
          dictation.stopDictating();
          hud.setStatus(true, false, asleep);
          hud.showCommand('Stopped typing', true);
          break;
        case 'TYPE_TEXT': {
          const el = document.elementFromPoint(screenX, screenY) as HTMLElement | null;
          const field = el ? (el.closest('input, textarea, [contenteditable]') as HTMLElement | null) : null;
          const ok = dictation.typeOnce(String(payload || ''), field);
          hud.showCommand(ok ? 'Typed' : 'No text field found', ok);
          break;
        }
        case 'DICTATE_TEXT':
          dictation.handleText(String(payload || ''));
          break;
        case 'DICTATION_NEWLINE':
        case 'DICTATION_NEWPARAGRAPH':
          dictation.handleNewline();
          break;
        case 'DICTATION_BACKSPACE_WORD':
          dictation.handleDeleteLastWord();
          break;
        case 'DICTATION_CLEAR':
          dictation.handleClear();
          break;
        case 'DICTATION_SELECT_ALL':
          dictation.handleSelectAll();
          break;
        case 'DICTATION_SUBMIT':
          dictation.handleSubmit();
          hud.showCommand('Submitted', true);
          break;

        case 'CONFIRM':
          if (actions.hasPendingSensitiveAction()) {
            actions.confirmPendingAction();
            hud.hideConfirmDialog();
            hud.showCommand('Confirmed', true);
            if (settings.soundFeedback) playSuccessSound();
          }
          break;
        case 'CANCEL':
          if (actions.hasPendingSensitiveAction()) {
            actions.cancelPendingAction();
            hud.hideConfirmDialog();
            hud.showCommand('Cancelled', false);
          }
          hints.hide();
          break;

        case 'HUD_NOTE':
          hud.showCommand(String(payload || ''), true);
          if (settings.soundFeedback) playSuccessSound();
          break;
        case 'CENTER':
          doRecenter();
          break;
        case 'ZOOM_IN':
          actions.zoom(0.1);
          break;
        case 'ZOOM_OUT':
          actions.zoom(-0.1);
          break;
        case 'ZOOM_RESET':
          actions.zoomReset();
          break;
        case 'SHOW_HELP':
          hud.showHelp();
          break;
        case 'HIDE_HELP':
          hud.hideHelp();
          break;
        default:
          break;
      }
    }

    chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
      switch (message?.type) {
        case 'PING':
          sendResponse(true);
          break;
        case 'POSE_FRAME':
          handlePose(message as PoseFrame);
          break;
        case 'SPEECH_RESULT':
          if (!asleep) hud.setTranscript(message.text);
          fusion.registerSpeechOnset(message.utteranceId || String(message.timestamp), screenX, screenY);
          break;
        case 'ENGINE_STATUS': {
          const s = message as EngineStatus;
          hud.setMode(s.mode);
          hud.setError(s.running ? s.error || s.voiceError : undefined);
          setRunning(s.running, s.asleep);
          hud.setStatus(s.running, !!s.isDictating, s.asleep);
          break;
        }
        case 'RECENTER':
          doRecenter();
          break;
        case 'COMMAND_ACTION':
          handleCommand(message);
          break;
        case 'START_TYPING':
          handleCommand({ action: 'START_TYPING' });
          break;
        case 'STOP_TYPING':
          handleCommand({ action: 'STOP_TYPING' });
          break;
        default:
          break;
      }
    });

    hints.setOnAction((el, mode) => {
      if (mode === 'click') {
        actions.clickElement(el);
        cursor.flashClick();
      } else {
        if (dictation.startDictating(el)) {
          hud.setStatus(true, true, asleep);
          chrome.runtime.sendMessage({ type: 'DICTATION_STATE', active: true }).catch(() => {});
        }
      }
    });

    onSettingsChanged((s) => applySettings(s));

    // Tell the background worker whether dictation is really on, so voice commands are interpreted correctly.
    dictation.setOnEnd(() => {
      hud.setStatus(running, false, asleep);
      chrome.runtime.sendMessage({ type: 'DICTATION_STATE', active: false }).catch(() => {});
    });

    (async () => {
      applySettings(await loadSettings());
      // Ask the background worker what state the engine is really in.
      try {
        const status: EngineStatus | undefined = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (status) {
          hud.setMode(status.mode);
          hud.setError(status.running ? status.error || status.voiceError : undefined);
          setRunning(status.running, status.asleep);
        } else {
          setRunning(false, false);
        }
      } catch {
        setRunning(false, false);
      }
    })();
  }
});
