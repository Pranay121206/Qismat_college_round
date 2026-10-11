import type { HandsfreeMessage, StatusUpdate } from '../shared/messages';
import { createHandsfreeOverlay } from '../shared/overlay';
import { getSettings, saveSettings, type HandsfreeSettings } from '../shared/settings';
import {
  executeAction,
  executeClick,
  executeDoubleClick,
  executeDragEnd,
  executeDragStart,
  executeRightClick,
  scrollPage,
  scrollToBottom,
  scrollToTop,
  startContinuousScroll,
  stopContinuousScroll,
} from './actions';
import { DictationController, executePageSearch, handleSubmitWithRiskyGuard } from './dictation';
import { clickHintNumber, hideHints, openHintLinkNumber, showHints } from './hints';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const isTopFrame = window === window.top;

    if (!isTopFrame) {
      // Listen for forwarded actions from top frame to execute in child iframe context
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'HANDSFREE_IFRAME_ACTION' && event.data.payload) {
          const { action, x, y, deltaX, deltaY } = event.data.payload;
          executeAction(action, { x, y }, deltaX, deltaY);
        }
      });
      return;
    }

    // Purge any stale overlay hosts from earlier content script injections
    document.querySelectorAll('#handsfree-overlay-host').forEach((el) => {
      el.remove();
    });

    console.log('[Handsfree Content] Mounting virtual cursor & HUD in top frame');

    const overlay = createHandsfreeOverlay();
    let currentSettings: HandsfreeSettings | null = null;
    let lastCursorCoords = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const dictation = new DictationController({
      onStateChange: (state) => {
        overlay.handleStatusUpdate({ state });
        chrome.runtime
          .sendMessage({
            type: 'COMMAND',
            payload: { command: 'set-state', args: { state }, source: 'ui' },
            source: 'content',
          } as HandsfreeMessage)
          .catch(() => {});
      },
      showVoiceFeedback: (payload) => {
        overlay.showVoiceFeedback(payload);
      },
      triggerRiskyGuard: (target, coords, label, actionFn) => {
        overlay.triggerRiskyGuard(target, coords, label, actionFn);
      },
    });

    getSettings().then((s) => {
      currentSettings = s;
    });

    // 1. Direct runtime message listener from background
    chrome.runtime.onMessage.addListener((message: HandsfreeMessage, _sender, _sendResponse) => {
      if (!message || !message.type) return;

      switch (message.type) {
        case 'POSE_FRAME': {
          lastCursorCoords = {
            x: message.payload.x * window.innerWidth,
            y: message.payload.y * window.innerHeight,
          };
          overlay.handlePoseFrame(message.payload);
          break;
        }

        case 'STATUS_UPDATE':
          overlay.handleStatusUpdate(message.payload);
          break;

        case 'SETTINGS_UPDATE':
          getSettings().then((s) => {
            currentSettings = s;
            overlay.updateSettings(s);
          });
          break;

        case 'VOICE_FEEDBACK': {
          overlay.showVoiceFeedback(message.payload);
          break;
        }

        case 'SPEECH_RESULT': {
          overlay.handleSpeechResult(message.payload);
          if (dictation.isActive()) {
            dictation.handleSpeechResult(message.payload.text, Boolean(message.payload.isFinal));
          }
          break;
        }

        case 'EXECUTE_CONTENT_COMMAND': {
          const { action, args } = message.payload;
          const speed = currentSettings?.scrollSpeed ?? 400;

          switch (action) {
            case 'click':
              executeClick(lastCursorCoords);
              break;
            case 'double-click':
              executeDoubleClick(lastCursorCoords);
              break;
            case 'right-click':
              executeRightClick(lastCursorCoords);
              break;
            case 'drag':
              executeDragStart(lastCursorCoords);
              break;
            case 'drop':
              executeDragEnd(lastCursorCoords);
              break;
            case 'scroll-down':
              startContinuousScroll('down', speed);
              break;
            case 'scroll-up':
              startContinuousScroll('up', speed);
              break;
            case 'scroll-stop':
              stopContinuousScroll();
              break;
            case 'page-down':
              scrollPage('down');
              break;
            case 'page-up':
              scrollPage('up');
              break;
            case 'scroll-top':
              scrollToTop();
              break;
            case 'scroll-bottom':
              scrollToBottom();
              break;
            case 'show-hints':
              showHints(overlay.getRootContainer());
              break;
            case 'hide-hints':
              hideHints();
              break;
            case 'click-hint':
              if (typeof args?.hintNumber === 'number') {
                clickHintNumber(args.hintNumber);
              }
              break;
            case 'open-hint-link':
              if (typeof args?.hintNumber === 'number') {
                openHintLinkNumber(args.hintNumber);
              }
              break;
            case 'show-help':
              overlay.toggleHelpSheet(true);
              break;
            case 'confirm':
              overlay.confirmPendingRisky();
              break;
            case 'cancel':
              overlay.dismissPendingRisky();
              hideHints();
              overlay.toggleHelpSheet(false);
              if (dictation.isActive()) {
                dictation.stopDictating('user');
              }
              break;
            case 'dwell-on':
              saveSettings({ dwellEnabled: true });
              break;
            case 'dwell-off':
              saveSettings({ dwellEnabled: false });
              break;
            case 'start-typing': {
              dictation.startDictating(lastCursorCoords);
              break;
            }
            case 'stop-typing':
              dictation.stopDictating('user');
              break;
            case 'submit': {
              const target =
                dictation.getTarget() ||
                (document.activeElement as HTMLElement) ||
                (document.elementFromPoint(lastCursorCoords.x, lastCursorCoords.y) as HTMLElement);
              handleSubmitWithRiskyGuard(target, (el, coords, label, actionFn) => {
                overlay.triggerRiskyGuard(el, coords, label, actionFn);
              });
              break;
            }
            case 'search-page': {
              const query = (args?.query as string) || '';
              const handled = executePageSearch(query);
              if (handled) {
                overlay.showVoiceFeedback({
                  rawText: `search for ${query}`,
                  recognized: true,
                  message: `Searching for "${query}"`,
                  playTone: true,
                });
              }
              _sendResponse?.({ handled });
              return true;
            }
            case 'recenter':
              overlay.recenter(true);
              break;
            default:
              break;
          }
          break;
        }

        case 'COMMAND':
          if (message.payload.command === 'pause') {
            stopContinuousScroll();
            if (dictation.isActive()) {
              dictation.stopDictating('user');
            }
            overlay.handleStatusUpdate({ paused: true, state: 'Paused' });
          } else if (message.payload.command === 'resume') {
            overlay.handleStatusUpdate({ paused: false, state: 'Active' });
          } else if (message.payload.command === 'toggle-pause') {
            stopContinuousScroll();
            if (dictation.isActive()) {
              dictation.stopDictating('user');
            }
            overlay.togglePauseState();
          } else if (message.payload.command === 'start-typing') {
            dictation.startDictating(lastCursorCoords);
          } else if (message.payload.command === 'stop-typing') {
            dictation.stopDictating('user');
          } else if (message.payload.command === 'submit') {
            const target =
              dictation.getTarget() ||
              (document.activeElement as HTMLElement) ||
              (document.elementFromPoint(lastCursorCoords.x, lastCursorCoords.y) as HTMLElement);
            handleSubmitWithRiskyGuard(target, (el, coords, label, actionFn) => {
              overlay.triggerRiskyGuard(el, coords, label, actionFn);
            });
          } else if (message.payload.command === 'recenter') {
            overlay.recenter(false);
          } else if (message.payload.command === 'show-help') {
            overlay.toggleHelpSheet(true);
          }
          break;

        default:
          break;
      }
    });

    // 2. Direct keyboard shortcut listeners (Alt+Shift+H, Alt+Shift+C, Alt+Shift+M)
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.altKey && e.shiftKey && (e.code === 'KeyH' || e.key === 'H' || e.key === 'h')) {
          e.preventDefault();
          chrome.runtime.sendMessage({
            type: 'COMMAND',
            payload: { command: 'toggle-pause', source: 'keyboard' },
          });
        } else if (
          e.altKey &&
          e.shiftKey &&
          (e.code === 'KeyC' || e.key === 'C' || e.key === 'c')
        ) {
          e.preventDefault();
          overlay.recenter(true);
        }
      },
      true,
    );

    // 4. Query background for current status on script startup
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response: StatusUpdate | undefined) => {
      if (response) {
        overlay.handleStatusUpdate(response);
      }
    });
  },
});
