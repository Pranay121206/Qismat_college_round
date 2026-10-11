import { parseCommand } from './commands';
import type { HandsfreeCommand, HandsfreeMessage, StatusUpdate } from '../shared/messages';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../shared/settings';

export default defineBackground(() => {
  console.log('[Handsfree Background] Service worker initialized');

  const OFFSCREEN_PATH = 'offscreen.html';
  const VOICE_HOST_PATH = 'voice-host.html';

  let currentState: import('../shared/messages').HandsfreeState = 'Active';

  let currentStatus: StatusUpdate = {
    running: false,
    paused: false,
    state: 'Active',
    mode: 'head',
    cameraStatus: 'idle',
    micStatus: 'idle',
    speechStatus: 'idle',
    speechEngine: 'none',
    fps: 0,
  };

  // Sync mode with stored settings initially
  getSettings().then((s) => {
    currentStatus.mode = s.mode || 'head';
  });

  async function switchMode(
    mode: 'head' = 'head',
    source?: 'keyboard' | 'ui' | 'voice' | 'setup',
  ): Promise<void> {
    console.log(`[Handsfree Background] Ensuring tracking mode (${source || 'internal'}): ${mode}`);
    currentStatus.mode = 'head';
    await saveSettings({ mode: 'head' });
    broadcastStatus();

    const modeCmd: HandsfreeMessage = {
      type: 'COMMAND',
      payload: { command: 'set-mode-head', source },
      source: 'background',
    };
    chrome.runtime.sendMessage(modeCmd).catch(() => {});
  }

  async function toggleTrackingMode(source?: 'keyboard' | 'ui' | 'voice' | 'setup'): Promise<void> {
    await switchMode('head', source);
  }

  let creatingOffscreenPromise: Promise<void> | null = null;
  let voiceHostTabId: number | null = null;
  const activeTabIds = new Set<number>();

  /**
   * Refreshes the set of active tabs across all browser windows.
   */
  async function refreshActiveTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true });
      activeTabIds.clear();
      for (const t of tabs) {
        if (t.id) activeTabIds.add(t.id);
      }
    } catch {
      // Ignored: extension contexts during shutdown
    }
  }

  // Update active tab tracking on tab activation and window focus
  chrome.tabs.onActivated?.addListener((info) => {
    activeTabIds.clear();
    activeTabIds.add(info.tabId);
  });

  chrome.windows?.onFocusChanged?.addListener(() => {
    refreshActiveTabs();
  });

  refreshActiveTabs();

  /**
   * Injects content-scripts/content.js into all open web tabs so users do not
   * have to manually refresh tabs after installing or updating the extension.
   */
  async function injectIntoAllTabs(): Promise<void> {
    if (!chrome.scripting || !chrome.tabs) return;
    try {
      const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id, allFrames: true },
              files: ['content-scripts/content.js'],
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[Handsfree Background] Tab scan error for injection:', err);
    }
  }

  // Auto-inject on background initialization
  injectIntoAllTabs();

  /**
   * Checks if the offscreen document is already created
   */
  async function hasOffscreenDocument(): Promise<boolean> {
    if (chrome.offscreen && 'hasDocument' in chrome.offscreen) {
      return await chrome.offscreen.hasDocument();
    }
    const runtimeWithContexts = chrome.runtime as unknown as {
      getContexts?: (filter: object) => Promise<unknown[]>;
    };
    const contexts = await runtimeWithContexts.getContexts?.({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
    });
    return Boolean(contexts && contexts.length > 0);
  }

  /**
   * Ensures only one offscreen document exists
   */
  async function ensureOffscreenDocument(): Promise<void> {
    if (await hasOffscreenDocument()) {
      return;
    }

    if (creatingOffscreenPromise) {
      await creatingOffscreenPromise;
      return;
    }

    creatingOffscreenPromise = (async () => {
      try {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_PATH,
          reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
          justification:
            'Captures webcam stream for touchless cursor navigation and microphone for voice commands on-device.',
        });
        console.log('[Handsfree Background] Offscreen document created successfully');
      } catch (err: unknown) {
        const error = err as Error;
        if (!error?.message?.includes('single offscreen document')) {
          console.error('[Handsfree Background] Error creating offscreen document:', error);
          throw error;
        }
      } finally {
        creatingOffscreenPromise = null;
      }
    })();

    await creatingOffscreenPromise;
  }

  /**
   * Closes the offscreen document to release camera and mic hardware resources
   */
  async function closeOffscreenDocument(): Promise<void> {
    if (await hasOffscreenDocument()) {
      try {
        await chrome.offscreen.closeDocument();
        console.log('[Handsfree Background] Offscreen document closed');
      } catch (err) {
        console.warn('[Handsfree Background] Error closing offscreen document:', err);
      }
    }
  }

  /**
   * Ensures the pinned Voice Host tab exists for the Web Speech fallback
   */
  async function ensureVoiceHostTab(): Promise<void> {
    if (voiceHostTabId !== null) {
      try {
        const tab = await chrome.tabs.get(voiceHostTabId);
        if (tab) return;
      } catch {
        voiceHostTabId = null;
      }
    }

    // Check if any tab already has voice-host URL open
    const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL(VOICE_HOST_PATH) });
    if (tabs.length > 0 && tabs[0]?.id) {
      voiceHostTabId = tabs[0].id;
      return;
    }

    try {
      const tab = await chrome.tabs.create({
        url: chrome.runtime.getURL(VOICE_HOST_PATH),
        pinned: true,
        active: false,
      });
      voiceHostTabId = tab.id ?? null;
      console.log(
        '[Handsfree Background] Voice host tab opened as pinned fallback:',
        voiceHostTabId,
      );
    } catch (err) {
      console.warn('[Handsfree Background] Could not create voice-host tab:', err);
    }
  }

  /**
   * Broadcasts status update to all extension components and active tab
   */
  function broadcastStatus(): void {
    const msg: HandsfreeMessage = {
      type: 'STATUS_UPDATE',
      payload: { ...currentStatus },
      source: 'background',
    };

    chrome.runtime.sendMessage(msg).catch(() => {});

    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
      }
    });
  }

  /**
   * Starts the Handsfree media pipeline
   */
  async function startPipeline(source?: 'keyboard' | 'ui' | 'voice' | 'setup'): Promise<void> {
    console.log(`[Handsfree Background] Starting pipeline triggered by ${source || 'system'}`);

    currentState = 'Active';
    currentStatus.running = true;
    currentStatus.paused = false;
    currentStatus.state = 'Active';
    currentStatus.cameraStatus = 'starting';
    currentStatus.micStatus = 'starting';
    currentStatus.speechStatus = 'starting';
    broadcastStatus();

    // If permissions have not been granted yet, direct user to setup page
    try {
      const storageRes = await chrome.storage?.local?.get('permissionsGranted');
      if (!storageRes?.permissionsGranted && source !== 'setup') {
        console.log('[Handsfree Background] Permissions not yet granted, opening setup page');
        const setupUrl = chrome.runtime.getURL('setup.html');
        await chrome.tabs.create({ url: setupUrl });
        currentStatus.running = false;
        currentStatus.cameraStatus = 'idle';
        currentStatus.micStatus = 'idle';
        broadcastStatus();
        return;
      }
    } catch {
      // Best-effort check
    }

    try {
      injectIntoAllTabs();
      await ensureOffscreenDocument();

      const startCmd: HandsfreeMessage = {
        type: 'COMMAND',
        payload: { command: 'start', source },
        source: 'background',
      };

      // Send start with retry loop to eliminate offscreen module script loading race condition
      const sendStartWithRetry = async (retries = 6, delayMs = 150) => {
        for (let i = 0; i < retries; i++) {
          try {
            const resp = await chrome.runtime.sendMessage(startCmd);
            if (resp?.status === 'starting' || currentStatus.cameraStatus === 'running') {
              console.log('[Handsfree Background] Offscreen acknowledged start command');
              return;
            }
          } catch {
            // Offscreen module still loading
          }
          await new Promise((r) => setTimeout(r, delayMs));
          if (!currentStatus.running || currentStatus.cameraStatus === 'running') return;
        }
      };
      sendStartWithRetry();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[Handsfree Background] Failed to start pipeline:', error);
      currentStatus.running = false;
      currentStatus.cameraStatus = 'error';
      currentStatus.micStatus = 'error';
      currentStatus.errorMessage = error?.message || 'Failed to start offscreen pipeline';
      broadcastStatus();
    }
  }

  /**
   * Stops the Handsfree media pipeline
   */
  async function stopPipeline(source?: 'keyboard' | 'ui' | 'voice' | 'setup'): Promise<void> {
    console.log(`[Handsfree Background] Stopping pipeline triggered by ${source || 'system'}`);

    currentStatus.running = false;
    currentStatus.paused = false;
    currentStatus.state = 'Active';
    currentStatus.cameraStatus = 'idle';
    currentStatus.micStatus = 'idle';
    currentStatus.speechStatus = 'idle';
    broadcastStatus();

    const stopCmd: HandsfreeMessage = {
      type: 'COMMAND',
      payload: { command: 'stop', source },
      source: 'background',
    };
    chrome.runtime.sendMessage(stopCmd).catch(() => {});

    // Close offscreen document to ensure camera LED is turned off
    await closeOffscreenDocument();
  }

  /**
   * Toggles between Active and Paused states via Alt+Shift+H.
   * If not running, starts in Active.
   */
  async function toggleActivePaused(source?: 'keyboard' | 'ui' | 'voice' | 'setup'): Promise<void> {
    if (!currentStatus.running) {
      await startPipeline(source);
      return;
    }

    if (currentState === 'Active') {
      currentState = 'Paused';
      currentStatus.paused = true;
      currentStatus.state = 'Paused';
      console.log(
        `[Handsfree Background] State transition: Active -> Paused (${source || 'shortcut'})`,
      );
    } else {
      currentState = 'Active';
      currentStatus.paused = false;
      currentStatus.state = 'Active';
      console.log(
        `[Handsfree Background] State transition: ${currentState} -> Active (${source || 'shortcut'})`,
      );
    }
    broadcastStatus();
  }

  // 1. Keyboard shortcut listener (Alt+Shift+H toggles Active/Paused, Alt+Shift+M toggles mode)
  if (chrome.commands?.onCommand?.addListener) {
    chrome.commands.onCommand.addListener(async (command) => {
      console.log(`[Handsfree Background] Keyboard shortcut received: ${command}`);
      if (command === 'toggle-handsfree') {
        await toggleActivePaused('keyboard');
      } else if (command === 'toggle-mode') {
        await toggleTrackingMode('keyboard');
      } else if (command === 'recenter') {
        const recenterMsg: HandsfreeMessage = {
          type: 'COMMAND',
          payload: { command: 'recenter', source: 'keyboard' },
          source: 'background',
        };
        chrome.runtime.sendMessage(recenterMsg).catch(() => {});
        chrome.tabs.query({ active: true }, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) chrome.tabs.sendMessage(tab.id, recenterMsg).catch(() => {});
          }
        });
      }
    });
  }

  // 2. First-run install/update listener: check permissions
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Handsfree Background] Extension event:', details.reason);
    injectIntoAllTabs();
    try {
      const storageRes = await chrome.storage?.local?.get('permissionsGranted');
      if (!storageRes?.permissionsGranted) {
        console.log('[Handsfree Background] Permissions not yet granted, opening setup page');
        const setupUrl = chrome.runtime.getURL('setup.html');
        await chrome.tabs.create({ url: setupUrl });
      }
    } catch {
      const setupUrl = chrome.runtime.getURL('setup.html');
      await chrome.tabs.create({ url: setupUrl });
    }
  });

  /**
   * Processes voice utterances via command parser and executes browser or content actions.
   */
  async function handleVoiceCommand(rawText: string): Promise<void> {
    const settings = await getSettings();
    const parsed = parseCommand(rawText, {
      state: currentState,
      wakeWordEnabled: settings.wakeWordEnabled,
      wakeWord: settings.wakeWord,
      customSites: settings.customSites,
    });

    console.log('[Handsfree Background] Spoken text:', rawText, '-> Parsed:', parsed);

    const feedbackMsg: HandsfreeMessage = {
      type: 'VOICE_FEEDBACK',
      payload: {
        rawText,
        recognized: parsed.recognized,
        command: parsed.command,
        message: parsed.message,
        confidence: parsed.confidence,
        playTone: parsed.recognized && settings.confirmationTone !== false,
      },
      source: 'background',
    };

    // Broadcast feedback to active tabs so Corner HUD displays result and chime plays
    chrome.tabs.query({ active: true }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, feedbackMsg).catch(() => {});
        }
      }
    });

    if (!parsed.recognized || !parsed.command) {
      return;
    }

    // Execute recognized command
    switch (parsed.command) {
      // 1. Modes & Lifecycle
      case 'pause':
        currentState = 'Paused';
        currentStatus.paused = true;
        currentStatus.state = 'Paused';
        broadcastStatus();
        chrome.runtime
          .sendMessage({
            type: 'COMMAND',
            payload: { command: 'pause', source: 'voice' },
            source: 'background',
          } as HandsfreeMessage)
          .catch(() => {});
        break;

      case 'resume':
        if (!currentStatus.running) {
          await startPipeline('voice');
        } else {
          currentState = 'Active';
          currentStatus.paused = false;
          currentStatus.state = 'Active';
          broadcastStatus();
          chrome.runtime
            .sendMessage({
              type: 'COMMAND',
              payload: { command: 'resume', source: 'voice' },
              source: 'background',
            } as HandsfreeMessage)
            .catch(() => {});
        }
        break;

      case 'set-mode-head':
        await switchMode('head', 'voice');
        break;

      case 'set-mode-hand':
      case 'set-mode-eye':
        console.log(`[Handsfree Background] Tracking mode voice request: ${parsed.command}`);
        break;

      case 'recenter': {
        const recenterMsg: HandsfreeMessage = {
          type: 'COMMAND',
          payload: { command: 'recenter', source: 'voice' },
          source: 'background',
        };
        chrome.runtime.sendMessage(recenterMsg).catch(() => {});
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, recenterMsg).catch(() => {});
          }
        });
        break;
      }

      // 2. Browser Navigation via chrome.tabs & chrome.history
      case 'history-back': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.goBack(tabs[0].id).catch(() => {});
        }
        break;
      }

      case 'history-forward': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.goForward(tabs[0].id).catch(() => {});
        }
        break;
      }

      case 'refresh': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.reload(tabs[0].id).catch(() => {});
        }
        break;
      }

      case 'new-tab':
        await chrome.tabs.create({});
        break;

      case 'close-tab': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          await chrome.tabs.remove(tabs[0].id).catch(() => {});
        }
        break;
      }

      case 'next-tab': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        if (tabs.length > 1) {
          const idx = tabs.findIndex((t) => t.active);
          const nextTab = tabs[(idx + 1) % tabs.length];
          if (nextTab?.id) {
            await chrome.tabs.update(nextTab.id, { active: true });
          }
        }
        break;
      }

      case 'previous-tab': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        if (tabs.length > 1) {
          const idx = tabs.findIndex((t) => t.active);
          const prevTab = tabs[(idx - 1 + tabs.length) % tabs.length];
          if (prevTab?.id) {
            await chrome.tabs.update(prevTab.id, { active: true });
          }
        }
        break;
      }

      case 'switch-tab': {
        const tabIndex = parsed.args?.tabIndex;
        if (typeof tabIndex === 'number') {
          const tabs = await chrome.tabs.query({ currentWindow: true });
          const target = tabs[Math.max(0, Math.min(tabs.length - 1, tabIndex - 1))];
          if (target?.id) {
            await chrome.tabs.update(target.id, { active: true });
          }
        }
        break;
      }

      case 'open-site': {
        const url = parsed.args?.url;
        if (url) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          if (activeTab?.url === 'chrome://newtab/' || activeTab?.url === 'about:blank') {
            await chrome.tabs.update(activeTab.id!, { url });
          } else {
            await chrome.tabs.create({ url });
          }
        }
        break;
      }

      case 'stop-typing': {
        currentState = 'Active';
        currentStatus.state = 'Active';
        broadcastStatus();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs
              .sendMessage(tabs[0].id, {
                type: 'EXECUTE_CONTENT_COMMAND',
                payload: { action: 'stop-typing' },
                source: 'background',
              } as HandsfreeMessage)
              .catch(() => {});
          }
        });
        break;
      }

      case 'search': {
        const query = parsed.args?.query;
        if (query) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = tabs[0]?.id;
          if (tabId) {
            chrome.tabs.sendMessage(
              tabId,
              {
                type: 'EXECUTE_CONTENT_COMMAND',
                payload: {
                  action: 'search-page',
                  args: { query },
                },
                source: 'background',
              } as HandsfreeMessage,
              async (response) => {
                if (chrome.runtime.lastError || !response?.handled) {
                  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                  await chrome.tabs.create({ url: searchUrl });
                }
              },
            );
          } else {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            await chrome.tabs.create({ url: searchUrl });
          }
        }
        break;
      }

      case 'zoom-in': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          const currentZoom = await chrome.tabs.getZoom(tabs[0].id);
          await chrome.tabs.setZoom(tabs[0].id, Math.min(3.0, currentZoom + 0.15));
        }
        break;
      }

      case 'zoom-out': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          const currentZoom = await chrome.tabs.getZoom(tabs[0].id);
          await chrome.tabs.setZoom(tabs[0].id, Math.max(0.3, currentZoom - 0.15));
        }
        break;
      }

      // 3. Content-side Commands (Pointer, Scroll, Hints, Confirmation, Typing, Help)
      default: {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs
              .sendMessage(tabs[0].id, {
                type: 'EXECUTE_CONTENT_COMMAND',
                payload: {
                  action: parsed.command,
                  args: parsed.args,
                },
                source: 'background',
              } as HandsfreeMessage)
              .catch(() => {});
          }
        });
        break;
      }
    }
  }

  // 3. Central message bus relay
  chrome.runtime.onMessage.addListener((message: HandsfreeMessage, _sender, sendResponse) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'GET_STATUS':
        sendResponse({ ...currentStatus });
        return true;

      case 'GET_SETTINGS': {
        getSettings()
          .then((s) => sendResponse(s))
          .catch(() => sendResponse({ ...DEFAULT_SETTINGS }));
        return true;
      }

      case 'COMMAND': {
        const cmd = message.payload.command as HandsfreeCommand;
        const src = message.payload.source as 'keyboard' | 'ui' | 'voice' | 'setup' | undefined;
        if (cmd === 'toggle') {
          toggleActivePaused(src);
        } else if (cmd === 'toggle-pause') {
          toggleActivePaused(src);
        } else if (cmd === 'toggle-mode') {
          toggleTrackingMode(src);
        } else if (cmd === 'set-mode-head') {
          switchMode('head', src);
        } else if (cmd === 'start') {
          startPipeline(src);
        } else if (cmd === 'resume') {
          if (!currentStatus.running) {
            startPipeline(src);
          } else {
            currentState = 'Active';
            currentStatus.paused = false;
            currentStatus.state = 'Active';
            broadcastStatus();
            chrome.runtime.sendMessage(message).catch(() => {});
          }
        } else if (cmd === 'pause') {
          currentState = 'Paused';
          currentStatus.paused = true;
          currentStatus.state = 'Paused';
          broadcastStatus();
          chrome.runtime.sendMessage(message).catch(() => {});
        } else if (cmd === 'stop') {
          stopPipeline(src);
        } else if (cmd === 'recalibrate' || cmd === 'recenter') {
          chrome.runtime.sendMessage(message).catch(() => {});
        } else if (cmd === 'open-setup') {
          chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
        } else if (cmd === 'offscreen-ready') {
          console.log('[Handsfree Background] Offscreen document reported ready');
          if (currentStatus.running) {
            chrome.runtime
              .sendMessage({
                type: 'COMMAND',
                payload: { command: 'start', source: 'background' },
                source: 'background',
              })
              .catch(() => {});
          }
        } else if (cmd === 'set-state') {
          const nextState = message.payload.args
            ?.state as import('../shared/messages').HandsfreeState;
          if (nextState) {
            currentState = nextState;
            currentStatus.state = nextState;
            broadcastStatus();
          }
        } else if (cmd === 'stop-typing') {
          currentState = 'Active';
          currentStatus.state = 'Active';
          broadcastStatus();
        } else if (cmd === 'open-new-tab') {
          const targetUrl = message.payload.args?.url as string | undefined;
          if (targetUrl) {
            chrome.tabs.create({ url: targetUrl });
          } else {
            chrome.tabs.create({});
          }
        } else if (cmd === 'permissions-granted') {
          console.log('[Handsfree Background] Permissions granted in setup. Starting pipeline...');
          currentStatus.cameraStatus = 'starting';
          currentStatus.micStatus = 'starting';
          broadcastStatus();
          startPipeline('setup');
        }

        // Forward command to active tab content script
        chrome.tabs.query({ active: true }, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
          }
        });
        break;
      }

      case 'SETTINGS_UPDATE': {
        if (message.payload.mode) {
          currentStatus.mode = message.payload.mode;
        }
        chrome.runtime.sendMessage(message).catch(() => {});
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
          }
        });
        break;
      }

      case 'STATUS_UPDATE': {
        currentStatus = {
          ...currentStatus,
          ...message.payload,
        };
        broadcastStatus();

        if (message.payload.cameraStatus === 'denied') {
          console.warn('[Handsfree Background] Camera permission denied. Opening setup page...');
          chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
        }
        break;
      }

      case 'POSE_FRAME': {
        // Forward pose frame to active tab top frame with zero-latency cached lookup (frameId: 0 avoids iframe message explosion)
        const frameOptions = { frameId: 0 };
        if (activeTabIds.size > 0) {
          for (const tabId of activeTabIds) {
            chrome.tabs.sendMessage(tabId, message, frameOptions).catch(() => {});
          }
        } else {
          chrome.tabs.query({ active: true }, (tabs) => {
            for (const tab of tabs) {
              if (tab.id) {
                activeTabIds.add(tab.id);
                chrome.tabs.sendMessage(tab.id, message, frameOptions).catch(() => {});
              }
            }
          });
        }
        break;
      }

      case 'SPEECH_ONSET': {
        chrome.tabs.query({ active: true }, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
          }
        });
        break;
      }

      case 'SPEECH_RESULT': {
        const text = message.payload?.text?.trim();
        const isFinal = Boolean(message.payload?.isFinal);

        // Relay live transcript to active tabs
        chrome.tabs.query({ active: true }, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
          }
        });

        // Parse and execute command on final result (or substantive utterance)
        if (text && isFinal) {
          handleVoiceCommand(text).catch(console.error);
        }
        break;
      }

      case 'SPEECH_SPIKE_EVENT': {
        console.log(
          `[Handsfree Background] Speech Spike Event (${message.payload.engine}):`,
          message.payload.event,
          message.payload.error || message.payload.details || '',
        );

        // If offscreen document encountered error (e.g. 'not-allowed' due to Chromium limitation)
        // and pipeline is active, automatically activate the Voice Host fallback!
        if (
          message.payload.engine === 'offscreen' &&
          message.payload.event === 'error' &&
          currentStatus.running
        ) {
          console.log(
            '[Handsfree Background] Offscreen Web Speech error detected. Activating Voice Host fallback...',
          );
          currentStatus.speechEngine = 'voice-host';
          ensureVoiceHostTab().catch(console.error);
        }
        break;
      }

      default:
        break;
    }
  });
});
