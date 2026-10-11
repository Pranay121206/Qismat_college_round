import type {
  HandsfreeState,
  PoseFrame,
  SpeechResult,
  StatusUpdate,
  VoiceFeedbackPayload,
} from './messages';
import { DEFAULT_SETTINGS, getSettings, type HandsfreeSettings } from './settings';
import { findSnapTarget, type SnapResult } from '../content/snap';
import { createQuickTourController } from './quickTourUI';
import { executeClick, isRiskyAction } from '../content/actions';

export interface OverlayHandle {
  mount: () => void;
  unmount: () => void;
  handlePoseFrame: (frame: PoseFrame) => void;
  handleStatusUpdate: (status: Partial<StatusUpdate>) => void;
  updateSettings: (settings: HandsfreeSettings) => void;
  togglePauseState: () => void;
  recenter: (notifyRuntime?: boolean) => void;
  startQuickTour: (onComplete?: () => void) => void;
  confirmPendingRisky: () => void;
  dismissPendingRisky: () => void;
  triggerRiskyGuard: (
    target: Element,
    coords: { x: number; y: number },
    label: string,
    actionFn?: () => void,
  ) => void;
  showVoiceFeedback: (payload: VoiceFeedbackPayload) => void;
  handleSpeechResult: (result: SpeechResult) => void;
  toggleHelpSheet: (visible?: boolean) => void;
  getRootContainer: () => HTMLElement;
}

/**
 * Creates and mounts the Handsfree Virtual Cursor, Snap Highlights, Dwell Click Engine,
 * Risky Guard Modal, and Corner HUD inside a closed Shadow DOM.
 */
export function createHandsfreeOverlay(): OverlayHandle {
  let settings: HandsfreeSettings = { ...DEFAULT_SETTINGS };
  let currentX = typeof window !== 'undefined' ? window.innerWidth / 2 : 500;
  let currentY = typeof window !== 'undefined' ? window.innerHeight / 2 : 400;
  let effectiveX = currentX;
  let effectiveY = currentY;

  let isPipelineActive = false;
  let isPipelinePaused = false;
  let globalState: HandsfreeState = 'Active';

  // Dwell click engine state
  let dwellAnchorX = currentX;
  let dwellAnchorY = currentY;
  let dwellStartTime: number | null = null;
  let lastClickTime = 0;
  let currentSnap: SnapResult | null = null;

  // Risky action guard state
  let pendingRiskyAction: {
    target: Element;
    coords: { x: number; y: number };
    label: string;
    actionFn?: () => void;
  } | null = null;
  let riskyConfirmElapsed = 0;
  let lastFrameTime = performance.now();
  let lastMetricUpdateTime = 0;
  let riskyAutoDismissTimer: number | null = null;
  let edgePinnedStartTime: number | null = null;

  // Purge any existing or stale overlay hosts from previous script injections/versions
  if (typeof document !== 'undefined') {
    document.querySelectorAll('#handsfree-overlay-host').forEach((el) => {
      el.remove();
    });
  }

  // Root host element - full viewport with pointer-events: none so it never blocks page clicks,
  // but allows shadow DOM elements with pointer-events: auto (HUD bar, toasts) to receive clicks
  const host = document.createElement('div');
  host.id = 'handsfree-overlay-host';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    pointer-events: none !important;
    overflow: visible !important;
    z-index: 2147483647 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    background: transparent !important;
    display: block !important;
  `;

  // Closed Shadow DOM for complete CSS/DOM encapsulation
  const shadow = host.attachShadow({ mode: 'closed' });

  // Stylesheet
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      overflow: visible !important;
      z-index: 2147483647 !important;
      display: block !important;
    }

    *, *::before, *::after {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
    }

    .hf-viewport {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      overflow: visible !important;
      display: block !important;
    }

    /* Snap Target Highlight Outline */
    .hf-target-highlight {
      position: fixed !important;
      pointer-events: none !important;
      z-index: 2147483645 !important;
      border: 2px solid #00f0ff !important;
      border-radius: 6px !important;
      background: rgba(0, 240, 255, 0.08) !important;
      box-shadow: 0 0 16px rgba(0, 240, 255, 0.65), inset 0 0 10px rgba(0, 240, 255, 0.25) !important;
      transition: all 0.08s cubic-bezier(0.16, 1, 0.3, 1) !important;
      display: none;
    }

    /* Virtual Cursor Wrapper */
    .hf-cursor-wrapper {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      will-change: transform !important;
      display: none;
      transition: opacity 0.15s ease, filter 0.15s ease !important;
      overflow: visible !important;
    }

    .hf-cursor-wrapper.active {
      display: block !important;
    }

    /* Paused: Hide Cursor Completely */
    .hf-cursor-wrapper.paused {
      display: none !important;
    }

    .hf-cursor-wrapper.frozen .hf-cursor-ring {
      border-color: #f59e0b !important;
      box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.95), 0 0 12px rgba(245, 158, 11, 0.85) !important;
    }

    .hf-cursor-wrapper.frozen .hf-cursor-dot {
      background: #f59e0b !important;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.95), 0 0 6px #f59e0b !important;
    }

    /* Circular Dwell Progress Ring SVG */
    .hf-dwell-svg {
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      width: calc(var(--hf-cursor-size, 28px) + 20px) !important;
      height: calc(var(--hf-cursor-size, 28px) + 20px) !important;
      transform: translate(-50%, -50%) !important;
      pointer-events: none !important;
      overflow: visible !important;
    }

    .hf-dwell-track {
      stroke: rgba(0, 240, 255, 0.18) !important;
      transition: stroke 0.2s ease !important;
    }

    .hf-dwell-fill {
      stroke: #00f0ff !important;
      filter: drop-shadow(0 0 6px rgba(0, 240, 255, 0.85)) !important;
      transition: stroke-dashoffset 0.04s linear !important;
    }

    /* High-contrast Ring */
    .hf-cursor-ring {
      width: var(--hf-cursor-size, 28px) !important;
      height: var(--hf-cursor-size, 28px) !important;
      border-radius: 50% !important;
      border: 2.5px solid #00f0ff !important;
      background: radial-gradient(circle, rgba(0, 240, 255, 0.25) 0%, rgba(0, 240, 255, 0.05) 60%, transparent 100%) !important;
      box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.9), 0 0 14px rgba(0, 240, 255, 0.85) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease !important;
    }

    /* Precision Center Dot */
    .hf-cursor-dot {
      width: 6px !important;
      height: 6px !important;
      border-radius: 50% !important;
      background: #ffffff !important;
      box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.95), 0 0 6px #00f0ff !important;
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
    }

    /* Click Ripple Feedback */
    .hf-cursor-ripple {
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      width: 10px !important;
      height: 10px !important;
      border-radius: 50% !important;
      border: 3px solid #00f0ff !important;
      transform: translate(-50%, -50%) scale(0) !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .hf-cursor-ripple.animate {
      animation: hf-ripple 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) !important;
    }

    @keyframes hf-ripple {
      0% {
        transform: translate(-50%, -50%) scale(0.4);
        opacity: 1;
        box-shadow: 0 0 16px #00f0ff;
      }
      100% {
        transform: translate(-50%, -50%) scale(3.8);
        opacity: 0;
        box-shadow: 0 0 0 transparent;
      }
    }

    /* Hand Mode Styling */
    .hf-cursor-wrapper.hand-mode .hf-dwell-svg {
      display: none !important;
    }

    .hf-cursor-wrapper.hand-mode .hf-cursor-ring {
      border-color: #06b6d4 !important;
      box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.9), 0 0 14px rgba(6, 182, 212, 0.85) !important;
    }

    /* Visible Pinch Indicator */
    .hf-pinch-indicator {
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      width: calc(var(--hf-cursor-size, 28px) + 14px) !important;
      height: calc(var(--hf-cursor-size, 28px) + 14px) !important;
      border-radius: 50% !important;
      border: 2px dashed rgba(6, 182, 212, 0.45) !important;
      transform: translate(-50%, -50%) scale(1) !important;
      pointer-events: none !important;
      opacity: 0;
      transition: opacity 0.15s ease, transform 0.08s ease, border-color 0.12s ease !important;
    }

    .hf-cursor-wrapper.hand-mode .hf-pinch-indicator {
      opacity: 0.7 !important;
    }

    .hf-cursor-wrapper.pinching .hf-pinch-indicator {
      opacity: 1 !important;
      border-style: solid !important;
      border-color: #22d3ee !important;
      box-shadow: 0 0 12px rgba(34, 211, 238, 0.95), inset 0 0 8px rgba(34, 211, 238, 0.5) !important;
      transform: translate(-50%, -50%) scale(0.72) !important;
    }

    .hf-cursor-wrapper.pinching .hf-cursor-ring {
      border-color: #22d3ee !important;
      transform: scale(0.92) !important;
    }

    /* Dragging State */
    .hf-cursor-wrapper.dragging .hf-cursor-ring {
      border-color: #f59e0b !important;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, rgba(245, 158, 11, 0.12) 60%, transparent 100%) !important;
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.95), 0 0 20px rgba(245, 158, 11, 0.95) !important;
      transform: scale(1.18) !important;
    }

    .hf-cursor-wrapper.dragging .hf-cursor-dot {
      background: #f59e0b !important;
      box-shadow: 0 0 0 1px #000, 0 0 8px #f59e0b !important;
    }

    .hf-cursor-wrapper.dragging .hf-pinch-indicator {
      border-color: #f59e0b !important;
      box-shadow: 0 0 16px rgba(245, 158, 11, 0.95) !important;
      transform: translate(-50%, -50%) scale(1.2) !important;
    }

    .hf-drag-badge {
      position: absolute !important;
      top: -24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: rgba(15, 23, 42, 0.92) !important;
      border: 1px solid #f59e0b !important;
      color: #f59e0b !important;
      font-size: 9px !important;
      font-weight: 800 !important;
      letter-spacing: 0.8px !important;
      padding: 2px 7px !important;
      border-radius: 999px !important;
      white-space: nowrap !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6), 0 0 8px rgba(245, 158, 11, 0.6) !important;
      pointer-events: none !important;
      display: none !important;
    }

    .hf-cursor-wrapper.dragging .hf-drag-badge {
      display: block !important;
      animation: hf-drag-pulse 1s ease-in-out infinite alternate !important;
    }

    @keyframes hf-drag-pulse {
      from { transform: translateX(-50%) scale(0.95); opacity: 0.85; }
      to { transform: translateX(-50%) scale(1.05); opacity: 1; }
    }

    /* Corner HUD Container */
    .hf-hud-container {
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483646 !important;
      pointer-events: auto !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-end !important;
      gap: 10px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-size: 11px !important;
      line-height: 1.3 !important;
      color: #f8fafc !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      animation: hf-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    /* Risky Action Guard Card */
    .hf-risky-card {
      background: rgba(15, 23, 42, 0.96) !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
      border: 1.5px solid rgba(245, 158, 11, 0.8) !important;
      border-radius: 14px !important;
      padding: 14px 16px !important;
      width: 290px !important;
      box-shadow: 0 12px 38px rgba(0, 0, 0, 0.7), 0 0 24px rgba(245, 158, 11, 0.35) !important;
      display: none !important;
      flex-direction: column !important;
      gap: 10px !important;
      animation: hf-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    }

    .hf-risky-card.visible {
      display: flex !important;
    }

    .hf-risky-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      font-size: 9.5px !important;
      font-weight: 800 !important;
      letter-spacing: 0.6px !important;
      text-transform: uppercase !important;
      color: #fef08a !important;
      background: rgba(245, 158, 11, 0.25) !important;
      border: 1px solid rgba(245, 158, 11, 0.5) !important;
      border-radius: 6px !important;
      padding: 3px 7px !important;
      width: fit-content !important;
    }

    .hf-risky-msg {
      font-size: 13px !important;
      font-weight: 600 !important;
      color: #ffffff !important;
      line-height: 1.4 !important;
    }

    .hf-risky-msg strong {
      color: #00f0ff !important;
    }

    .hf-risky-target-info {
      font-size: 11px !important;
      color: #cbd5e1 !important;
      background: rgba(0, 0, 0, 0.35) !important;
      border-radius: 6px !important;
      padding: 6px 9px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      border-left: 3px solid #f59e0b !important;
    }

    .hf-risky-actions {
      display: flex !important;
      gap: 8px !important;
      margin-top: 4px !important;
    }

    /* Big Confirm Button with dwell progress fill */
    .hf-btn-risky-confirm {
      position: relative !important;
      flex: 2 !important;
      background: #1e293b !important;
      color: #ffffff !important;
      border: 1.5px solid #10b981 !important;
      border-radius: 8px !important;
      padding: 9px 12px !important;
      font-size: 11.5px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      overflow: hidden !important;
      text-align: center !important;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important;
      pointer-events: auto !important;
    }

    .hf-btn-dwell-bar {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      height: 100% !important;
      width: 0%;
      background: linear-gradient(90deg, #10b981, #059669) !important;
      transition: width 0.05s linear !important;
      z-index: 1 !important;
      opacity: 0.85 !important;
    }

    .hf-btn-text {
      position: relative !important;
      z-index: 2 !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8) !important;
    }

    .hf-btn-risky-cancel {
      flex: 1 !important;
      background: rgba(239, 68, 68, 0.2) !important;
      color: #fca5a5 !important;
      border: 1px solid rgba(239, 68, 68, 0.5) !important;
      border-radius: 8px !important;
      padding: 9px 8px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      text-align: center !important;
      transition: all 0.15s ease !important;
      pointer-events: auto !important;
    }

    .hf-btn-risky-cancel:hover {
      background: rgba(239, 68, 68, 0.4) !important;
      color: #ffffff !important;
    }

    /* Sleek Glassmorphism Metric Bar */
    .hf-hud-bar {
      background: rgba(15, 23, 42, 0.94) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border: 1.5px solid rgba(0, 240, 255, 0.35) !important;
      border-radius: 12px !important;
      padding: 7px 12px !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 16px rgba(0, 240, 255, 0.15) !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
      user-select: none !important;
    }

    .hf-hud-bar:hover {
      border-color: rgba(0, 240, 255, 0.75) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65), 0 0 24px rgba(0, 240, 255, 0.3) !important;
      transform: translateY(-1px) !important;
    }

    .hf-hud-bar:active {
      transform: translateY(0px) scale(0.99) !important;
    }

    .hf-hud-badge {
      background: linear-gradient(135deg, #0284c7, #0369a1) !important;
      color: #ffffff !important;
      font-size: 9.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.5px !important;
      text-transform: uppercase !important;
      padding: 3px 6px !important;
      border-radius: 5px !important;
      box-shadow: 0 0 8px rgba(2, 132, 199, 0.45) !important;
    }

    .hf-hud-badge.state-paused {
      background: linear-gradient(135deg, #d97706, #b45309) !important;
      box-shadow: 0 0 8px rgba(217, 119, 6, 0.45) !important;
    }

    .hf-hud-badge.state-dictating {
      background: linear-gradient(135deg, #8b5cf6, #6366f1) !important;
      box-shadow: 0 0 10px rgba(139, 92, 246, 0.6) !important;
      letter-spacing: 0.8px !important;
    }

    .hf-hud-item {
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      color: #cbd5e1 !important;
      font-size: 11px !important;
      white-space: nowrap !important;
    }

    .hf-hud-item strong {
      color: #f8fafc !important;
      font-weight: 600 !important;
    }

    .hf-status-indicator {
      width: 8px !important;
      height: 8px !important;
      border-radius: 50% !important;
      display: inline-block !important;
    }

    .hf-status-indicator.green {
      background: #10b981 !important;
      box-shadow: 0 0 6px #10b981 !important;
    }

    .hf-status-indicator.yellow {
      background: #f59e0b !important;
      box-shadow: 0 0 6px #f59e0b !important;
    }

    .hf-status-indicator.red {
      background: #ef4444 !important;
      box-shadow: 0 0 6px #ef4444 !important;
    }

    .hf-status-indicator.gray {
      background: #64748b !important;
      box-shadow: 0 0 4px #64748b !important;
    }

    /* Action Buttons */
    .hf-btn-action {
      background: #0284c7 !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 6px !important;
      padding: 4px 10px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      transition: all 0.15s ease !important;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.4) !important;
    }

    .hf-btn-action:hover {
      background: #0369a1 !important;
      transform: translateY(-1px) !important;
    }

    .hf-btn-action.running {
      background: #ef4444 !important;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4) !important;
    }

    .hf-btn-action.running:hover {
      background: #dc2626 !important;
    }

    .hf-btn-secondary {
      background: rgba(255, 255, 255, 0.12) !important;
      color: #cbd5e1 !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      border-radius: 6px !important;
      padding: 3px 7px !important;
      font-size: 11px !important;
      font-weight: bold !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      transition: all 0.15s ease !important;
    }

    .hf-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.25) !important;
      color: #ffffff !important;
    }

    /* Warning & Pause Alerts */
    .hf-hud-alert {
      background: rgba(239, 68, 68, 0.28) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1.5px solid rgba(239, 68, 68, 0.75) !important;
      color: #fecaca !important;
      border-radius: 8px !important;
      padding: 7px 12px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      display: none !important;
      align-items: center !important;
      gap: 6px !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3) !important;
      animation: hf-pulse 1.6s infinite ease-in-out !important;
    }

    .hf-hud-alert.visible {
      display: flex !important;
    }

    .hf-hud-alert:hover {
      filter: brightness(1.15) !important;
    }

    .hf-hud-alert.paused {
      background: rgba(245, 158, 11, 0.28) !important;
      border-color: rgba(245, 158, 11, 0.75) !important;
      color: #fef3c7 !important;
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.3) !important;
      animation: none !important;
    }

    .hf-hud-alert.permission {
      background: rgba(168, 85, 247, 0.28) !important;
      border-color: rgba(168, 85, 247, 0.75) !important;
      color: #f3e8ff !important;
      box-shadow: 0 4px 16px rgba(168, 85, 247, 0.3) !important;
      animation: none !important;
    }

    .hf-hud-alert.dictating {
      background: rgba(139, 92, 246, 0.35) !important;
      border-color: rgba(139, 92, 246, 0.8) !important;
      color: #ede9fe !important;
      box-shadow: 0 4px 16px rgba(139, 92, 246, 0.35) !important;
      animation: none !important;
    }

    @keyframes hf-fade-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes hf-slide-up {
      from {
        opacity: 0;
        transform: translateY(14px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes hf-pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.65;
      }
    }
    /* Drift Detection Toast */
    .hf-drift-toast {
      position: fixed !important;
      bottom: 64px !important;
      right: 18px !important;
      background: rgba(15, 23, 42, 0.94) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border: 1.5px solid rgba(245, 158, 11, 0.85) !important;
      color: #fef3c7 !important;
      border-radius: 10px !important;
      padding: 10px 14px !important;
      font-size: 12px !important;
      display: none !important;
      align-items: center !important;
      gap: 10px !important;
      pointer-events: auto !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(245, 158, 11, 0.35) !important;
      z-index: 2147483647 !important;
      animation: hf-slide-up 0.25s ease-out !important;
    }

    .hf-drift-toast.visible {
      display: flex !important;
    }

    .hf-drift-btn {
      background: linear-gradient(135deg, #f59e0b, #d97706) !important;
      color: #fff !important;
      border: none !important;
      border-radius: 6px !important;
      padding: 5px 12px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      transition: filter 0.15s ease !important;
    }

    .hf-drift-btn:hover {
      filter: brightness(1.15) !important;
    }

    /* Recenter Feedback Pill */
    .hf-recenter-pill {
      position: fixed !important;
      top: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: rgba(16, 185, 129, 0.95) !important;
      backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(16, 185, 129, 0.6) !important;
      color: #fff !important;
      padding: 6px 16px !important;
      border-radius: 9999px !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.45) !important;
      display: none !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      animation: hf-fade-in 0.2s ease-out !important;
    }

    /* Quick Tour Floating Card */
    .hf-tour-card {
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: rgba(15, 23, 42, 0.94) !important;
      border: 1.5px solid rgba(56, 189, 248, 0.5) !important;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(56, 189, 248, 0.25) !important;
      backdrop-filter: blur(16px) !important;
      border-radius: 14px !important;
      padding: 20px 24px !important;
      width: 420px !important;
      max-width: 90vw !important;
      color: #f8fafc !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      text-align: center !important;
      display: none !important;
      animation: hf-slide-up 0.3s ease-out !important;
    }

    .hf-tour-card.visible {
      display: block !important;
    }

    .hf-tour-badge {
      font-size: 10px !important;
      font-weight: 800 !important;
      letter-spacing: 0.08em !important;
      color: #38bdf8 !important;
      background: rgba(56, 189, 248, 0.15) !important;
      padding: 2px 8px !important;
      border-radius: 9999px !important;
      display: inline-block !important;
      margin-bottom: 6px !important;
    }

    .hf-tour-title {
      font-size: 16px !important;
      font-weight: 700 !important;
      color: #ffffff !important;
    }

    .hf-tour-desc {
      font-size: 12px !important;
      color: #94a3b8 !important;
      margin-top: 4px !important;
      margin-bottom: 12px !important;
    }

    .hf-tour-box {
      margin-top: 10px !important;
    }

    .hf-tour-meter-bg {
      width: 100% !important;
      height: 8px !important;
      background: rgba(255, 255, 255, 0.1) !important;
      border-radius: 9999px !important;
      overflow: hidden !important;
    }

    .hf-tour-meter-fill {
      width: 0% !important;
      height: 100% !important;
      background: linear-gradient(90deg, #38bdf8, #10b981) !important;
      border-radius: 9999px !important;
      transition: width 0.15s ease !important;
    }

    .hf-tour-status {
      font-size: 11px !important;
      color: #cbd5e1 !important;
      margin-top: 6px !important;
    }

    .hf-tour-btn-target {
      position: relative !important;
      overflow: hidden !important;
      background: linear-gradient(135deg, #2563eb, #38bdf8) !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 10px 20px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      box-shadow: 0 4px 12px rgba(56, 189, 248, 0.35) !important;
      transition: all 0.2s ease !important;
    }

    .hf-tour-btn-action {
      background: linear-gradient(135deg, #2563eb, #38bdf8) !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 8px 18px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      margin-top: 8px !important;
      transition: filter 0.15s ease !important;
    }

    .hf-tour-btn-action:hover {
      filter: brightness(1.1) !important;
    }

    .hf-tour-success-icon {
      font-size: 32px !important;
      color: #10b981 !important;
      margin-bottom: 8px !important;
    }

    .hf-tour-summary-list {
      text-align: left !important;
      font-size: 12px !important;
      color: #cbd5e1 !important;
      background: rgba(0, 0, 0, 0.25) !important;
      padding: 10px 14px !important;
      border-radius: 8px !important;
      margin-bottom: 12px !important;
      line-height: 1.6 !important;
    }

    /* Voice Command Feedback Pill */
    .hf-voice-pill {
      position: fixed !important;
      top: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(-20px) !important;
      display: none;
      align-items: center !important;
      gap: 10px !important;
      background: rgba(15, 23, 42, 0.94) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(56, 189, 248, 0.35) !important;
      border-radius: 9999px !important;
      padding: 8px 18px !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.25) !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      opacity: 0 !important;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }

    .hf-voice-pill.visible {
      display: flex !important;
      transform: translateX(-50%) translateY(0) !important;
      opacity: 1 !important;
    }

    .hf-voice-icon {
      font-size: 15px !important;
    }

    .hf-voice-text {
      font-size: 13px !important;
      font-weight: 500 !important;
      color: #f8fafc !important;
    }

    .hf-voice-badge {
      font-size: 11px !important;
      font-weight: 600 !important;
      padding: 2px 8px !important;
      border-radius: 9999px !important;
      background: rgba(56, 189, 248, 0.2) !important;
      color: #38bdf8 !important;
      border: 1px solid rgba(56, 189, 248, 0.4) !important;
    }

    .hf-voice-badge.success {
      background: rgba(16, 185, 129, 0.2) !important;
      color: #10b981 !important;
      border-color: rgba(16, 185, 129, 0.4) !important;
    }

    .hf-voice-badge.rejected {
      background: rgba(239, 68, 68, 0.2) !important;
      color: #ef4444 !important;
      border-color: rgba(239, 68, 68, 0.4) !important;
    }

    .hf-voice-badge.interim {
      background: rgba(234, 179, 8, 0.2) !important;
      color: #eab308 !important;
      border-color: rgba(234, 179, 8, 0.4) !important;
    }

    .hf-voice-pill.rejected {
      border-color: rgba(239, 68, 68, 0.4) !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(239, 68, 68, 0.25) !important;
    }

    /* Commands Help Sheet Modal */
    .hf-help-modal {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.68) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      display: none;
      align-items: center !important;
      justify-content: center !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      opacity: 0 !important;
      transition: opacity 0.2s ease !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }

    .hf-help-modal.visible {
      display: flex !important;
      opacity: 1 !important;
    }

    .hf-help-card {
      background: #0f172a !important;
      border: 1px solid rgba(56, 189, 248, 0.3) !important;
      border-radius: 16px !important;
      width: 90% !important;
      max-width: 680px !important;
      max-height: 85vh !important;
      overflow-y: auto !important;
      padding: 24px !important;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15) !important;
      color: #f8fafc !important;
      transform: scale(0.96) !important;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    .hf-help-modal.visible .hf-help-card {
      transform: scale(1) !important;
    }

    .hf-help-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      margin-bottom: 20px !important;
      padding-bottom: 14px !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    }

    .hf-help-title {
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
      font-size: 17px !important;
      font-weight: 700 !important;
      color: #f8fafc !important;
    }

    .hf-help-sub {
      font-size: 12px !important;
      font-weight: 400 !important;
      color: #94a3b8 !important;
    }

    .hf-help-close {
      background: rgba(255, 255, 255, 0.08) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      color: #cbd5e1 !important;
      width: 32px !important;
      height: 32px !important;
      border-radius: 50% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      font-size: 14px !important;
      transition: all 0.15s ease !important;
    }

    .hf-help-close:hover {
      background: rgba(239, 68, 68, 0.8) !important;
      color: #ffffff !important;
      border-color: rgba(239, 68, 68, 0.9) !important;
    }

    .hf-help-grid {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important;
      gap: 16px !important;
    }

    .hf-help-cat {
      background: rgba(30, 41, 59, 0.5) !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
      border-radius: 12px !important;
      padding: 14px !important;
    }

    .hf-cat-title {
      font-size: 12px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      color: #38bdf8 !important;
      margin-bottom: 10px !important;
    }

    .hf-cmd-row {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      font-size: 12px !important;
      padding: 5px 0 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
    }

    .hf-cmd-row:last-child {
      border-bottom: none !important;
    }

    .hf-cmd-row code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      background: rgba(254, 240, 138, 0.12) !important;
      color: #fef08a !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
      font-size: 11.5px !important;
    }

    .hf-cmd-row span {
      color: #94a3b8 !important;
      font-size: 12px !important;
    }
  `;

  // HTML content
  const rootContainer = document.createElement('div');
  rootContainer.className = 'hf-viewport';
  rootContainer.innerHTML = `
    <!-- Snap Target Highlight Outline -->
    <div id="hf-target-highlight" class="hf-target-highlight"></div>

    <!-- Virtual Cursor with Dwell Ring & Ripple -->
    <div id="hf-cursor" class="hf-cursor-wrapper">
      <svg class="hf-dwell-svg" viewBox="0 0 64 64">
        <circle
          class="hf-dwell-track"
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke-width="3"
        />
        <circle
          id="hf-dwell-progress"
          class="hf-dwell-fill"
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke-width="3.5"
          stroke-linecap="round"
          transform="rotate(-90 32 32)"
          stroke-dasharray="163.36"
          stroke-dashoffset="163.36"
        />
      </svg>
      <div class="hf-cursor-ring">
        <div class="hf-cursor-dot"></div>
      </div>
      <div id="hf-cursor-ripple" class="hf-cursor-ripple"></div>
    </div>

    <!-- Voice Command Feedback Pill -->
    <div id="hf-voice-hud-pill" class="hf-voice-pill" style="display: none;">
      <span class="hf-voice-icon">🎙️</span>
      <span id="hf-voice-text" class="hf-voice-text">"scroll down"</span>
      <span id="hf-voice-badge" class="hf-voice-badge">Scrolling</span>
    </div>

    <!-- Commands Help Sheet Modal -->
    <div id="hf-help-modal" class="hf-help-modal" style="display: none;">
      <div class="hf-help-card">
        <div class="hf-help-header">
          <div class="hf-help-title">
            <span>🎙️ Handsfree Voice Commands</span>
            <span class="hf-help-sub">Say any command or "what can I say" to open this guide</span>
          </div>
          <button id="hf-help-close-btn" class="hf-help-close" title="Close (or say 'no')">✕</button>
        </div>
        <div class="hf-help-grid">
          <div class="hf-help-cat">
            <div class="hf-cat-title">🎯 Pointer</div>
            <div class="hf-cmd-row"><code>click</code><span>Single click target</span></div>
            <div class="hf-cmd-row"><code>double click</code><span>Double click target</span></div>
            <div class="hf-cmd-row"><code>right click</code><span>Context menu</span></div>
            <div class="hf-cmd-row"><code>drag / drop</code><span>Drag & drop item</span></div>
          </div>
          <div class="hf-help-cat">
            <div class="hf-cat-title">📜 Scroll</div>
            <div class="hf-cmd-row"><code>scroll down</code><span>Continuous smooth scroll</span></div>
            <div class="hf-cmd-row"><code>scroll up</code><span>Continuous upward scroll</span></div>
            <div class="hf-cmd-row"><code>page down / up</code><span>Scroll one page</span></div>
            <div class="hf-cmd-row"><code>top / bottom</code><span>Scroll to top/bottom</span></div>
            <div class="hf-cmd-row"><code>stop</code><span>Halt scrolling</span></div>
          </div>
          <div class="hf-help-cat">
            <div class="hf-cat-title">🌐 Navigation</div>
            <div class="hf-cmd-row"><code>go back / forward</code><span>Browser history</span></div>
            <div class="hf-cmd-row"><code>refresh</code><span>Reload active page</span></div>
            <div class="hf-cmd-row"><code>new / close tab</code><span>Manage tabs</span></div>
            <div class="hf-cmd-row"><code>next / prev tab</code><span>Cycle tabs</span></div>
            <div class="hf-cmd-row"><code>tab 1..9</code><span>Switch to tab #</span></div>
            <div class="hf-cmd-row"><code>open &lt;site&gt;</code><span>google, youtube, github...</span></div>
            <div class="hf-cmd-row"><code>search for &lt;query&gt;</code><span>Google search query</span></div>
          </div>
          <div class="hf-help-cat">
            <div class="hf-cat-title">🔢 Link Hints</div>
            <div class="hf-cmd-row"><code>show hints</code><span>Show numbered links</span></div>
            <div class="hf-cmd-row"><code>hide hints</code><span>Dismiss numbers</span></div>
            <div class="hf-cmd-row"><code>click &lt;number&gt;</code><span>Click numbered link</span></div>
            <div class="hf-cmd-row"><code>open link &lt;number&gt;</code><span>Open link #</span></div>
          </div>
          <div class="hf-help-cat">
            <div class="hf-cat-title">⚙️ Modes & Toggles</div>
            <div class="hf-cmd-row"><code>pause / resume</code><span>Sleep or wake up</span></div>
            <div class="hf-cmd-row"><code>head mode</code><span>Head tracking</span></div>
            <div class="hf-cmd-row"><code>dwell on / off</code><span>Toggle dwell clicks</span></div>
            <div class="hf-cmd-row"><code>center</code><span>Re-center pose</span></div>
            <div class="hf-cmd-row"><code>start / stop typing</code><span>Input dictation</span></div>
            <div class="hf-cmd-row"><code>zoom in / out</code><span>Browser zoom</span></div>
          </div>
          <div class="hf-help-cat">
            <div class="hf-cat-title">✅ Confirmation & Help</div>
            <div class="hf-cmd-row"><code>yes / no</code><span>Confirm or cancel action</span></div>
            <div class="hf-cmd-row"><code>what can I say</code><span>Open this guide</span></div>
          </div>
        </div>
      </div>
    </div>
    <!-- Drift Detection Toast -->
    <div id="hf-drift-toast" class="hf-drift-toast">
      <span>⚠️ Drifted? Say 'center' or press <kbd>Alt+Shift+C</kbd></span>
      <button id="hf-drift-recenter-btn" class="hf-drift-btn">Center</button>
    </div>

    <!-- Recenter Confirmation Pill -->
    <div id="hf-recenter-pill" class="hf-recenter-pill">✓ Neutral Pose Re-centered</div>

    <!-- Corner HUD -->
    <div id="hf-hud" class="hf-hud-container">
      <!-- Risky Action Guard Card -->
      <div id="hf-risky-guard" class="hf-risky-card">
        <div class="hf-risky-badge">🛡️ Confirmation Required</div>
        <div class="hf-risky-msg">
          Say <strong>'yes'</strong> to confirm or <strong>'no'</strong> to cancel
        </div>
        <div id="hf-risky-desc" class="hf-risky-target-info">Action: Submit</div>
        <div class="hf-risky-actions">
          <button id="hf-confirm-btn" class="hf-btn-risky-confirm" title="Dwell 1.5s on this button to confirm">
            <div id="hf-confirm-dwell-bar" class="hf-btn-dwell-bar"></div>
            <span class="hf-btn-text">✓ CONFIRM (Dwell 1.5s)</span>
          </button>
          <button id="hf-cancel-btn" class="hf-btn-risky-cancel">✕ Cancel</button>
        </div>
      </div>

      <!-- Warning when Camera Permission is needed -->
      <div id="hf-hud-permission" class="hf-hud-alert permission" title="Click to grant camera access">
        <span>⚠️ Camera permission needed: Click to grant access</span>
      </div>

      <!-- Warning when Face is Lost -->
      <div id="hf-hud-warning" class="hf-hud-alert">
        <span>⚠️ Face lost: look at the camera</span>
      </div>

      <!-- Paused Notification -->
      <div id="hf-hud-paused" class="hf-hud-alert paused" title="Click to resume or press Alt+Shift+H">
        <span>⏸️ PAUSED — Click to Resume or Alt+Shift+H</span>
      </div>

      <!-- Dictating Notification -->
      <div id="hf-hud-dictating" class="hf-hud-alert dictating" title="Say 'stop typing' to finish dictation">
        <span>✍️ DICTATING — Say "stop typing" or editing commands</span>
      </div>

      <!-- Metric Bar -->
      <div id="hf-hud-bar" class="hf-hud-bar" title="Click to toggle Handsfree (Alt+Shift+H)">
        <span id="hf-hud-mode" class="hf-hud-badge">HEAD</span>
        <div class="hf-hud-item">
          <span id="hf-hud-conf-dot" class="hf-status-indicator gray"></span>
          <span id="hf-hud-conf"><strong>IDLE</strong></span>
        </div>
        <div class="hf-hud-item">
          <span>🎤</span>
          <span id="hf-hud-mic"><strong>MIC OFF</strong></span>
        </div>
        <div class="hf-hud-item">
          <span id="hf-hud-fps"><strong>-- FPS</strong></span>
        </div>
        <button id="hf-toggle-btn" class="hf-btn-action" title="Toggle Handsfree (Alt+Shift+H)">START</button>
        <button id="hf-recenter-btn" class="hf-btn-secondary" title="Recenter Neutral Pose (Alt+Shift+C)" style="display: none;">⟳</button>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(rootContainer);

  // References inside Shadow DOM
  const cursorElem = rootContainer.querySelector('#hf-cursor') as HTMLDivElement;
  const dwellProgressCircle = rootContainer.querySelector('#hf-dwell-progress') as SVGCircleElement;
  const cursorRipple = rootContainer.querySelector('#hf-cursor-ripple') as HTMLDivElement;
  const highlightElem = rootContainer.querySelector('#hf-target-highlight') as HTMLDivElement;

  const riskyGuardElem = rootContainer.querySelector('#hf-risky-guard') as HTMLDivElement;
  const riskyDescElem = rootContainer.querySelector('#hf-risky-desc') as HTMLDivElement;
  const confirmBtn = rootContainer.querySelector('#hf-confirm-btn') as HTMLButtonElement;
  const confirmDwellBar = rootContainer.querySelector('#hf-confirm-dwell-bar') as HTMLDivElement;
  const cancelBtn = rootContainer.querySelector('#hf-cancel-btn') as HTMLButtonElement;

  const warningElem = rootContainer.querySelector('#hf-hud-warning') as HTMLDivElement;
  const pausedElem = rootContainer.querySelector('#hf-hud-paused') as HTMLDivElement;
  const dictatingElem = rootContainer.querySelector('#hf-hud-dictating') as HTMLDivElement;
  const permElem = rootContainer.querySelector('#hf-hud-permission') as HTMLDivElement;
  const modeElem = rootContainer.querySelector('#hf-hud-mode') as HTMLSpanElement;
  const confDot = rootContainer.querySelector('#hf-hud-conf-dot') as HTMLSpanElement;
  const confElem = rootContainer.querySelector('#hf-hud-conf') as HTMLSpanElement;
  const micElem = rootContainer.querySelector('#hf-hud-mic') as HTMLSpanElement;
  const fpsElem = rootContainer.querySelector('#hf-hud-fps') as HTMLSpanElement;
  const toggleBtn = rootContainer.querySelector('#hf-toggle-btn') as HTMLButtonElement;
  const recenterBtn = rootContainer.querySelector('#hf-recenter-btn') as HTMLButtonElement;

  const driftToast = rootContainer.querySelector('#hf-drift-toast') as HTMLElement;
  const driftRecenterBtn = rootContainer.querySelector(
    '#hf-drift-recenter-btn',
  ) as HTMLButtonElement;
  const recenterPill = rootContainer.querySelector('#hf-recenter-pill') as HTMLElement;

  const quickTourController = createQuickTourController(rootContainer);

  function recenter(notifyRuntime: boolean = true): void {
    currentX = window.innerWidth / 2;
    currentY = window.innerHeight / 2;
    effectiveX = currentX;
    effectiveY = currentY;
    const cursorRadius = (settings.cursorSize || 28) / 2;
    cursorElem.style.transform = `translate3d(${effectiveX - cursorRadius}px, ${effectiveY - cursorRadius}px, 0)`;

    // Dismiss drift toast
    edgePinnedStartTime = null;
    if (driftToast) driftToast.classList.remove('visible');

    // Show brief recenter confirmation pill
    if (recenterPill) {
      recenterPill.style.display = 'block';
      setTimeout(() => {
        recenterPill.style.display = 'none';
      }, 1200);
    }

    // Notify runtime / offscreen only if requested (breaks recursive echo loops)
    if (notifyRuntime) {
      chrome.runtime
        .sendMessage({
          type: 'COMMAND',
          payload: { command: 'recenter', source: 'ui' },
        })
        .catch(() => {});
    }
  }

  const DWELL_CIRCUMFERENCE = 2 * Math.PI * 26; // 163.3628

  function setAlertVisible(elem: HTMLElement, visible: boolean): void {
    if (visible) {
      elem.classList.add('visible');
      elem.style.setProperty('display', 'flex', 'important');
    } else {
      elem.classList.remove('visible');
      elem.style.setProperty('display', 'none', 'important');
    }
  }

  // Ensure all alerts start strictly hidden
  setAlertVisible(riskyGuardElem, false);
  setAlertVisible(permElem, false);
  setAlertVisible(warningElem, false);
  setAlertVisible(pausedElem, false);

  function updateCursorDimensions(size: number): void {
    cursorElem.style.setProperty('--hf-cursor-size', `${size}px`);
  }

  // Set initial position
  const initialRadius = (settings.cursorSize || 28) / 2;
  cursorElem.style.transform = `translate3d(${currentX - initialRadius}px, ${currentY - initialRadius}px, 0)`;

  // Load stored settings
  getSettings().then((s) => {
    settings = s;
    updateCursorDimensions(settings.cursorSize);
  });

  function mount(): void {
    const target = document.documentElement || document.body;
    if (!target) return;
    // Clean up any stale duplicate hosts
    document.querySelectorAll('#handsfree-overlay-host').forEach((el) => {
      if (el !== host) {
        el.remove();
      }
    });
    if (!document.contains(host)) {
      target.appendChild(host);
    }
  }

  function unmount(): void {
    document.querySelectorAll('#handsfree-overlay-host').forEach((el) => {
      el.remove();
    });
  }

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!document.contains(host)) {
        mount();
      }
    });
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true });
    }
  }

  mount();

  function triggerCursorRipple(): void {
    cursorRipple.classList.remove('animate');
    void cursorRipple.offsetWidth;
    cursorRipple.classList.add('animate');
  }

  function resetDwellProgress(): void {
    dwellStartTime = null;
    dwellProgressCircle.style.strokeDashoffset = `${DWELL_CIRCUMFERENCE}`;
  }

  function dismissRiskyGuard(): void {
    pendingRiskyAction = null;
    setAlertVisible(riskyGuardElem, false);
    riskyConfirmElapsed = 0;
    confirmDwellBar.style.width = '0%';
    if (riskyAutoDismissTimer !== null) {
      clearTimeout(riskyAutoDismissTimer);
      riskyAutoDismissTimer = null;
    }
  }

  function showRiskyGuard(
    target: Element,
    coords: { x: number; y: number },
    label: string,
    actionFn?: () => void,
  ): void {
    pendingRiskyAction = { target, coords, label, actionFn };
    riskyDescElem.textContent = `Action: ${label}`;
    setAlertVisible(riskyGuardElem, true);
    riskyConfirmElapsed = 0;
    confirmDwellBar.style.width = '0%';

    if (riskyAutoDismissTimer !== null) {
      clearTimeout(riskyAutoDismissTimer);
    }
    // Auto dismiss after 15 seconds if unconfirmed
    riskyAutoDismissTimer = window.setTimeout(() => {
      dismissRiskyGuard();
    }, 15000);
  }

  function executePendingRiskyAction(): void {
    if (!pendingRiskyAction) return;
    const { target, coords, actionFn } = pendingRiskyAction;
    dismissRiskyGuard();

    if (actionFn) {
      actionFn();
    } else {
      executeClick(coords, target);
    }
    lastClickTime = Date.now();
    triggerCursorRipple();
    resetDwellProgress();
  }

  // Risky Guard Button Listeners
  confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    executePendingRiskyAction();
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissRiskyGuard();
    lastClickTime = Date.now();
  });

  // Corner HUD Button & Bar Listeners
  const hudBar = rootContainer.querySelector('#hf-hud-bar') as HTMLElement;

  function toggleHandsfree(e?: Event): void {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cmd = isPipelineActive ? 'stop' : 'start';
    console.log(`[Handsfree Overlay] Toggling pipeline from HUD: sending '${cmd}'`);
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      payload: { command: cmd, source: 'ui' },
    });
  }

  toggleBtn.addEventListener('click', toggleHandsfree);

  hudBar?.addEventListener('click', (e) => {
    // If the click directly hit the recenter button, let its handler handle it
    if ((e.target as HTMLElement).closest('#hf-recenter-btn')) {
      return;
    }
    toggleHandsfree(e);
  });

  recenterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    recenter();
  });

  driftRecenterBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    recenter();
  });

  permElem.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAlertVisible(permElem, false);
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      payload: { command: 'open-setup', source: 'ui' },
    });
  });

  pausedElem.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isPipelinePaused = false;
    globalState = 'Active';
    setAlertVisible(pausedElem, false);
    cursorElem.classList.remove('paused');
    if (isPipelineActive) {
      cursorElem.classList.add('active');
    }
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      payload: { command: 'resume', source: 'ui' },
    });
  });

  /**
   * Handle incoming POSE_FRAME
   */
  function handlePoseFrame(frame: PoseFrame): void {
    if (!frame) return;

    const now = performance.now();
    const frameDelta = Math.max(1, now - lastFrameTime);
    lastFrameTime = now;

    mount();
    isPipelineActive = true;

    // Face tracking frame arrived -> camera is working, hide permission warning
    setAlertVisible(permElem, false);

    // In Paused state: cursor hides, show ONLY paused alert
    if (isPipelinePaused || globalState === 'Paused') {
      cursorElem.classList.remove('active');
      cursorElem.classList.add('paused');
      highlightElem.style.display = 'none';
      setAlertVisible(warningElem, false);
      setAlertVisible(permElem, false);
      setAlertVisible(pausedElem, true);
      resetDwellProgress();
      return;
    }

    cursorElem.classList.remove('paused');
    cursorElem.classList.add('active');
    setAlertVisible(pausedElem, false);
    setAlertVisible(permElem, false);
    recenterBtn.style.display = 'inline-block';
    toggleBtn.textContent = 'STOP';
    toggleBtn.classList.add('running');

    const isDetected = frame.confidence >= 0.5;

    // Track mode visuals
    modeElem.textContent = 'HEAD';

    if (isDetected) {
      cursorElem.classList.remove('frozen');
      setAlertVisible(warningElem, false);
      setAlertVisible(pausedElem, false);
      setAlertVisible(permElem, false);

      // 1. Raw Coordinates
      const cursorRadius = (settings.cursorSize || 28) / 2;
      currentX = Math.min(
        window.innerWidth - cursorRadius,
        Math.max(cursorRadius, frame.x * window.innerWidth),
      );
      currentY = Math.min(
        window.innerHeight - cursorRadius,
        Math.max(cursorRadius, frame.y * window.innerHeight),
      );

      // 2. High-performance Snap-to-Target Search
      // Bypass radial DOM probing when cursor is traveling rapidly to prevent layout thrashing
      const moveDistance = Math.hypot(currentX - effectiveX, currentY - effectiveY);
      const snap =
        moveDistance > 35 ? null : findSnapTarget(currentX, currentY, settings.snapRadius);
      currentSnap = snap;

      if (snap) {
        effectiveX = snap.snappedX;
        effectiveY = snap.snappedY;

        // Position target highlight outline
        highlightElem.style.top = `${snap.rect.top - 2}px`;
        highlightElem.style.left = `${snap.rect.left - 2}px`;
        highlightElem.style.width = `${snap.rect.width + 4}px`;
        highlightElem.style.height = `${snap.rect.height + 4}px`;
        highlightElem.style.display = 'block';
      } else {
        effectiveX = currentX;
        effectiveY = currentY;
        highlightElem.style.display = 'none';
      }

      // 3. Move Virtual Cursor
      cursorElem.style.transform = `translate3d(${effectiveX - cursorRadius}px, ${effectiveY - cursorRadius}px, 0)`;

      if (quickTourController.isActive()) {
        quickTourController.onCursorMove(effectiveX, effectiveY);
      }

      // Drift detection: cursor pinned to screen edge for > 4 seconds
      const isPinnedToEdge =
        effectiveX <= 3 ||
        effectiveX >= window.innerWidth - 3 ||
        effectiveY <= 3 ||
        effectiveY >= window.innerHeight - 3;

      if (isPinnedToEdge && !quickTourController.isActive()) {
        if (edgePinnedStartTime === null) {
          edgePinnedStartTime = Date.now();
        } else if (Date.now() - edgePinnedStartTime >= 4000) {
          if (driftToast) driftToast.classList.add('visible');
        }
      } else {
        edgePinnedStartTime = null;
        if (driftToast) driftToast.classList.remove('visible');
      }

      // 4. Update HUD Confidence & Dot (throttled to 4Hz for performance)
      if (now - lastMetricUpdateTime > 250) {
        lastMetricUpdateTime = now;
        const confPercent = Math.round(frame.confidence * 100);
        confElem.textContent = `${confPercent}%`;
        confDot.className = 'hf-status-indicator ' + (confPercent >= 70 ? 'green' : 'yellow');
        if (frame.fps) {
          fpsElem.textContent = `${Math.round(frame.fps)} FPS`;
        }
      }

      // 5. Risky Guard Dwell Evaluation (1.5s Confirm Dwell)
      if (pendingRiskyAction) {
        const confirmRect = confirmBtn.getBoundingClientRect();
        const isHoveringConfirm =
          effectiveX >= confirmRect.left &&
          effectiveX <= confirmRect.right &&
          effectiveY >= confirmRect.top &&
          effectiveY <= confirmRect.bottom;

        if (isHoveringConfirm) {
          riskyConfirmElapsed += frameDelta;
          const confirmProgress = Math.min(1.0, riskyConfirmElapsed / 1500);
          confirmDwellBar.style.width = `${confirmProgress * 100}%`;

          if (confirmProgress >= 1.0) {
            executePendingRiskyAction();
          }
        } else {
          riskyConfirmElapsed = Math.max(0, riskyConfirmElapsed - frameDelta * 0.5);
          confirmDwellBar.style.width = `${(riskyConfirmElapsed / 1500) * 100}%`;
        }

        resetDwellProgress();
        return;
      }

      // 6. Click Handling: Dwell Click Processing (Head Mode)

      const currentTime = Date.now();
      const cooldownRemaining = settings.dwellCooldownMs - (currentTime - lastClickTime);

      if (cooldownRemaining > 0) {
        resetDwellProgress();
      } else {
        const distFromAnchor = Math.hypot(effectiveX - dwellAnchorX, effectiveY - dwellAnchorY);

        if (distFromAnchor > settings.dwellTolerance) {
          dwellAnchorX = effectiveX;
          dwellAnchorY = effectiveY;
          dwellStartTime = currentTime;
          dwellProgressCircle.style.strokeDashoffset = `${DWELL_CIRCUMFERENCE}`;
        } else {
          if (dwellStartTime === null) {
            dwellStartTime = currentTime;
          }

          const elapsed = currentTime - dwellStartTime;
          const progress = Math.min(1.0, elapsed / settings.dwellMs);

          const offset = DWELL_CIRCUMFERENCE * (1 - progress);
          dwellProgressCircle.style.strokeDashoffset = `${offset}`;

          if (progress >= 1.0) {
            dwellStartTime = currentTime + 9999999;
            resetDwellProgress();

            const targetElement =
              currentSnap?.element ||
              document.elementFromPoint(effectiveX, effectiveY) ||
              document.body;

            const risky = isRiskyAction(targetElement);
            if (risky.isRisky) {
              showRiskyGuard(targetElement, { x: effectiveX, y: effectiveY }, risky.label);
            } else {
              if (quickTourController.isActive()) {
                quickTourController.onDwellClick(targetElement);
              }
              executeClick({ x: effectiveX, y: effectiveY }, targetElement);
              lastClickTime = Date.now();
              triggerCursorRipple();
            }
          }
        }
      }
    } else {
      // Landmark lost
      cursorElem.classList.add('frozen');
      highlightElem.style.display = 'none';
      resetDwellProgress();
      if (!isPipelinePaused) {
        const warningSpan = warningElem.querySelector('span');
        if (warningSpan) {
          warningSpan.textContent = '⚠️ Face lost: look at the camera';
        }
        setAlertVisible(warningElem, true);
        setAlertVisible(pausedElem, false);
        setAlertVisible(permElem, false);
      }
      confElem.textContent = '0%';
      confDot.className = 'hf-status-indicator red';
    }
  }

  /**
   * Handle STATUS_UPDATE events from Background
   */
  function handleStatusUpdate(status: Partial<StatusUpdate>): void {
    if (!status) return;

    if (typeof status.running === 'boolean') {
      isPipelineActive = status.running;
    }
    if (typeof status.paused === 'boolean') {
      isPipelinePaused = status.paused;
    }
    if (status.state) {
      globalState = status.state;
      if (globalState === 'Paused') {
        isPipelinePaused = true;
      } else if (globalState === 'Active') {
        isPipelinePaused = false;
      }
    }

    // Permission banner: show only when camera was explicitly denied and pipeline is not active
    if (status.cameraStatus === 'denied' && !isPipelineActive) {
      setAlertVisible(permElem, true);
    } else if (status.cameraStatus === 'running' || isPipelineActive) {
      setAlertVisible(permElem, false);
    }

    if (!isPipelineActive) {
      cursorElem.classList.remove('active');
      highlightElem.style.display = 'none';
      setAlertVisible(warningElem, false);
      setAlertVisible(pausedElem, false);
      recenterBtn.style.display = 'none';
      toggleBtn.textContent = 'START';
      toggleBtn.classList.remove('running');
      if (status.cameraStatus === 'starting') {
        confDot.className = 'hf-status-indicator yellow';
        confElem.innerHTML = '<strong>STARTING...</strong>';
      } else if (status.cameraStatus === 'denied' || status.cameraStatus === 'error') {
        confDot.className = 'hf-status-indicator red';
        confElem.innerHTML = '<strong>ERROR</strong>';
      } else {
        confDot.className = 'hf-status-indicator gray';
        confElem.innerHTML = '<strong>IDLE</strong>';
      }
      fpsElem.textContent = '-- FPS';
      micElem.innerHTML = '<strong>MIC OFF</strong>';
      dismissRiskyGuard();
      resetDwellProgress();
      return;
    }

    toggleBtn.textContent = 'STOP';
    toggleBtn.classList.add('running');
    recenterBtn.style.display = 'inline-block';

    if (status.cameraStatus === 'starting') {
      confDot.className = 'hf-status-indicator yellow';
      confElem.innerHTML = '<strong>STARTING...</strong>';
    }

    if (status.mode) {
      modeElem.textContent = status.mode.toUpperCase();
    }

    if (status.micStatus === 'running') {
      micElem.innerHTML = '<strong>MIC ON</strong>';
    } else if (status.micStatus === 'error') {
      micElem.innerHTML = '<strong style="color: #ef4444;">MIC ERR</strong>';
    } else {
      micElem.innerHTML = '<strong>MIC OFF</strong>';
    }

    if (status.fps) {
      fpsElem.textContent = `${Math.round(status.fps)} FPS`;
    }

    if (status.state) {
      globalState = status.state;
    }

    // Mutually exclusive alert banners and states
    if (status.state === 'Dictating' || globalState === 'Dictating') {
      setAlertVisible(warningElem, false);
      setAlertVisible(pausedElem, false);
      setAlertVisible(permElem, false);
      setAlertVisible(dictatingElem, true);
      modeElem.textContent = 'DICTATING';
      modeElem.className = 'hf-hud-badge state-dictating';
    } else if (isPipelinePaused || globalState === 'Paused') {
      setAlertVisible(warningElem, false);
      setAlertVisible(pausedElem, true);
      setAlertVisible(permElem, false);
      setAlertVisible(dictatingElem, false);
      cursorElem.classList.remove('active');
      cursorElem.classList.add('paused');
      highlightElem.style.display = 'none';
      dismissRiskyGuard();
      resetDwellProgress();
      modeElem.textContent = (status.mode || 'HEAD').toUpperCase();
      modeElem.className = 'hf-hud-badge state-paused';
    } else {
      setAlertVisible(pausedElem, false);
      setAlertVisible(dictatingElem, false);
      cursorElem.classList.remove('paused');
      if (isPipelineActive) {
        cursorElem.classList.add('active');
      }
      if (status.mode) {
        modeElem.textContent = status.mode.toUpperCase();
      }
      modeElem.className = 'hf-hud-badge';
    }

    // Display speech error notifications in HUD
    if (status.speechError) {
      showVoiceFeedback({
        rawText: 'Voice Input',
        recognized: false,
        message: status.speechError,
        playTone: false,
      });
    }
  }

  function updateSettings(newSettings: HandsfreeSettings): void {
    settings = newSettings;
    updateCursorDimensions(settings.cursorSize);
  }

  function togglePauseState(): void {
    chrome.runtime.sendMessage({
      type: 'COMMAND',
      payload: { command: 'toggle-pause', source: 'ui' },
    });
  }

  let voicePillTimer: number | null = null;
  const voicePill = rootContainer.querySelector('#hf-voice-hud-pill') as HTMLElement | null;
  const voiceTextElem = rootContainer.querySelector('#hf-voice-text') as HTMLElement | null;
  const voiceBadgeElem = rootContainer.querySelector('#hf-voice-badge') as HTMLElement | null;

  const helpModal = rootContainer.querySelector('#hf-help-modal') as HTMLElement | null;
  const helpCloseBtn = rootContainer.querySelector('#hf-help-close-btn') as HTMLElement | null;

  if (helpCloseBtn) {
    helpCloseBtn.addEventListener('click', () => {
      toggleHelpSheet(false);
    });
  }
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        toggleHelpSheet(false);
      }
    });
  }

  function toggleHelpSheet(visible?: boolean): void {
    if (!helpModal) return;
    const shouldShow = visible !== undefined ? visible : !helpModal.classList.contains('visible');
    if (shouldShow) {
      helpModal.style.display = 'flex';
      helpModal.classList.add('visible');
    } else {
      helpModal.classList.remove('visible');
      helpModal.style.display = 'none';
    }
  }

  function playConfirmationTone(): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Audio autoplay or permissions restriction
    }
  }

  function showVoiceFeedback(payload: VoiceFeedbackPayload): void {
    if (!voicePill || !voiceTextElem || !voiceBadgeElem) return;

    if (voicePillTimer !== null) {
      clearTimeout(voicePillTimer);
      voicePillTimer = null;
    }

    voiceTextElem.textContent = `"${payload.rawText}"`;
    voiceBadgeElem.textContent = payload.message;

    if (payload.recognized) {
      voicePill.classList.remove('rejected');
      voiceBadgeElem.className = 'hf-voice-badge success';
      if (payload.playTone && settings.confirmationTone !== false) {
        playConfirmationTone();
      }
    } else {
      voicePill.classList.add('rejected');
      voiceBadgeElem.className = 'hf-voice-badge rejected';
    }

    voicePill.classList.add('visible');
    voicePill.style.display = 'flex';

    voicePillTimer = window.setTimeout(() => {
      voicePill.classList.remove('visible');
      voicePill.style.display = 'none';
    }, 2500);
  }

  function handleSpeechResult(result: SpeechResult): void {
    if (!voicePill || !voiceTextElem || !voiceBadgeElem) return;

    if (!result.isFinal && result.text) {
      if (voicePillTimer !== null) {
        clearTimeout(voicePillTimer);
        voicePillTimer = null;
      }
      voiceTextElem.textContent = `"${result.text}..."`;
      voiceBadgeElem.textContent = 'Hearing...';
      voiceBadgeElem.className = 'hf-voice-badge interim';
      voicePill.classList.remove('rejected');
      voicePill.classList.add('visible');
      voicePill.style.display = 'flex';
    }
  }

  return {
    mount,
    unmount,
    handlePoseFrame,
    handleStatusUpdate,
    updateSettings,
    togglePauseState,
    recenter,
    startQuickTour: (onComplete?: () => void) => {
      mount();
      quickTourController.start(onComplete);
    },
    confirmPendingRisky: executePendingRiskyAction,
    dismissPendingRisky: dismissRiskyGuard,
    triggerRiskyGuard: showRiskyGuard,
    showVoiceFeedback,
    handleSpeechResult,
    toggleHelpSheet,
    getRootContainer: () => rootContainer,
  };
}
