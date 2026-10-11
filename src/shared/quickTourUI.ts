/**
 * Creates audio feedback chime using Web Audio API for touchless cues
 */
export function playChime(type: 'beep' | 'success' | 'complete'): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'beep') {
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.28);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch {
    // Audio optional / best-effort
  }
}

export interface QuickTourHandle {
  start: (onComplete?: () => void) => void;
  stop: () => void;
  isActive: () => boolean;
  onCursorMove: (x: number, y: number) => void;
  onSpeech: (text: string) => void;
  onDwellClick: (targetElem: Element | null) => void;
}

/**
 * Creates the 3-Step Quick Tour controller (Move -> Dwell click -> Voice).
 */
export function createQuickTourController(container: HTMLElement): QuickTourHandle {
  let isRunning = false;
  let currentStep: 1 | 2 | 3 | 4 = 1;
  let accumulatedDistance = 0;
  let lastX = 0;
  let lastY = 0;
  let activeCompletionCallback: (() => void) | null = null;

  const tourCard = document.createElement('div');
  tourCard.className = 'hf-tour-card';
  tourCard.style.display = 'none';

  tourCard.innerHTML = `
    <div class="hf-tour-badge">HANDSFREE QUICK TOUR</div>
    <div id="hf-tour-title" class="hf-tour-title">1/3 Move the Cursor</div>
    <div id="hf-tour-desc" class="hf-tour-desc">Move your head gently to steer the cursor across the screen.</div>

    <!-- Step 1: Distance progress -->
    <div id="hf-tour-move-box" class="hf-tour-box">
      <div class="hf-tour-meter-bg">
        <div id="hf-tour-move-fill" class="hf-tour-meter-fill"></div>
      </div>
      <div id="hf-tour-move-label" class="hf-tour-status">Distance: 0%</div>
    </div>

    <!-- Step 2: Dwell click interactive button -->
    <div id="hf-tour-dwell-box" class="hf-tour-box" style="display: none;">
      <button id="hf-tour-dwell-target" class="hf-tour-btn-target">
        <div id="hf-tour-dwell-bar" class="hf-tour-dwell-bar"></div>
        <span id="hf-tour-dwell-btn-text">Hover Here to Dwell Click</span>
      </button>
      <div class="hf-tour-status">Pause the cursor over the button for 0.8s</div>
    </div>

    <!-- Step 3: Voice command -->
    <div id="hf-tour-voice-box" class="hf-tour-box" style="display: none;">
      <div class="hf-tour-voice-mic">
        <div class="hf-voice-pulse"></div>
        <span>🎤 Listening...</span>
      </div>
      <div id="hf-tour-voice-status" class="hf-tour-status">Say <strong>"scroll down"</strong> into your mic</div>
      <button id="hf-tour-voice-skip" class="hf-tour-btn-action">Skip / Finish Setup</button>
    </div>

    <!-- Step 4: All set complete screen -->
    <div id="hf-tour-complete-box" class="hf-tour-box" style="display: none;">
      <div class="hf-tour-success-icon">✓</div>
      <div class="hf-tour-summary-list">
        <div>• <strong>Re-center anytime:</strong> Say "center" or press <kbd>Alt+Shift+C</kbd></div>
        <div>• <strong>Pause / Resume:</strong> Press <kbd>Alt+Shift+H</kbd></div>
        <div>• <strong>Click:</strong> Pause cursor for 0.8 seconds (dwell click)</div>
      </div>
      <button id="hf-tour-finish-btn" class="hf-tour-btn-action">Start Browsing</button>
    </div>
  `;

  container.appendChild(tourCard);

  const titleElem = tourCard.querySelector('#hf-tour-title') as HTMLElement;
  const descElem = tourCard.querySelector('#hf-tour-desc') as HTMLElement;

  const moveBox = tourCard.querySelector('#hf-tour-move-box') as HTMLElement;
  const moveFill = tourCard.querySelector('#hf-tour-move-fill') as HTMLElement;
  const moveLabel = tourCard.querySelector('#hf-tour-move-label') as HTMLElement;

  const dwellBox = tourCard.querySelector('#hf-tour-dwell-box') as HTMLElement;
  const dwellTarget = tourCard.querySelector('#hf-tour-dwell-target') as HTMLElement;
  const dwellBar = tourCard.querySelector('#hf-tour-dwell-bar') as HTMLElement;
  const dwellBtnText = tourCard.querySelector('#hf-tour-dwell-btn-text') as HTMLElement;

  const voiceBox = tourCard.querySelector('#hf-tour-voice-box') as HTMLElement;
  const voiceStatus = tourCard.querySelector('#hf-tour-voice-status') as HTMLElement;
  const voiceSkipBtn = tourCard.querySelector('#hf-tour-voice-skip') as HTMLButtonElement;

  const completeBox = tourCard.querySelector('#hf-tour-complete-box') as HTMLElement;
  const finishBtn = tourCard.querySelector('#hf-tour-finish-btn') as HTMLButtonElement;

  function setVisible(
    elem: HTMLElement | null,
    visible: boolean,
    displayStyle: string = 'block',
  ): void {
    if (!elem) return;
    if (visible) {
      elem.classList.add('visible');
      elem.style.setProperty('display', displayStyle, 'important');
    } else {
      elem.classList.remove('visible');
      elem.style.setProperty('display', 'none', 'important');
    }
  }

  function showStep(step: 1 | 2 | 3 | 4): void {
    currentStep = step;
    setVisible(moveBox, step === 1, 'block');
    setVisible(dwellBox, step === 2, 'block');
    setVisible(voiceBox, step === 3, 'block');
    setVisible(completeBox, step === 4, 'block');

    if (step === 1) {
      accumulatedDistance = 0;
      titleElem.textContent = '1/3 Move the Cursor';
      descElem.textContent = 'Turn your head gently to steer the cursor.';
      playChime('beep');
    } else if (step === 2) {
      titleElem.textContent = '2/3 Dwell to Click';
      descElem.textContent = 'Handsfree clicks automatically when you pause on a button.';
      dwellBar.style.width = '0%';
      playChime('beep');
    } else if (step === 3) {
      titleElem.textContent = '3/3 Voice Commands';
      descElem.textContent = 'Control pages with your voice or hotkeys.';
      playChime('beep');
    } else if (step === 4) {
      titleElem.textContent = 'You are Ready!';
      descElem.textContent = 'Onboarding complete.';
      playChime('complete');
    }
  }

  // Interactive target click listener in Step 2
  dwellTarget?.addEventListener('click', () => {
    if (currentStep === 2) {
      dwellBtnText.textContent = 'Clicked! ✓ Success';
      dwellTarget.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      playChime('success');
      setTimeout(() => {
        showStep(3);
      }, 1000);
    }
  });

  voiceSkipBtn?.addEventListener('click', () => {
    showStep(4);
  });

  finishBtn?.addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ handsfree_onboarding_completed: true });
      }
    } catch {
      // Ignore
    }
    const cb = activeCompletionCallback;
    stop();
    if (cb) cb();
  });

  function start(onComplete?: () => void): void {
    isRunning = true;
    activeCompletionCallback = onComplete || null;
    setVisible(tourCard, true, 'block');
    showStep(1);
  }

  function stop(): void {
    isRunning = false;
    setVisible(tourCard, false);
  }

  function onCursorMove(x: number, y: number): void {
    if (!isRunning) return;

    if (currentStep === 1) {
      if (lastX > 0 && lastY > 0) {
        const delta = Math.hypot(x - lastX, y - lastY);
        accumulatedDistance += delta;
        const targetDist = 200;
        const pct = Math.min(100, Math.round((accumulatedDistance / targetDist) * 100));
        moveFill.style.width = `${pct}%`;
        moveLabel.textContent = `Head steering verified: ${pct}%`;

        if (accumulatedDistance >= targetDist) {
          playChime('success');
          moveLabel.textContent = '✓ Motion verified!';
          setTimeout(() => {
            showStep(2);
          }, 900);
        }
      }
      lastX = x;
      lastY = y;
    }
  }

  function onSpeech(text: string): void {
    if (!isRunning) return;
    const lower = text.toLowerCase();
    if (currentStep === 3) {
      if (lower.includes('scroll') || lower.includes('down')) {
        voiceStatus.innerHTML =
          '<span style="color: #10b981;">✓ Command "scroll down" recognized!</span>';
        playChime('success');
        setTimeout(() => {
          showStep(4);
        }, 1000);
      }
    }
  }

  function onDwellClick(targetElem: Element | null): void {
    if (!isRunning) return;
    if (currentStep === 2 && targetElem === dwellTarget) {
      dwellTarget.click();
    }
  }

  return {
    start,
    stop,
    isActive: () => isRunning,
    onCursorMove,
    onSpeech,
    onDwellClick,
  };
}
