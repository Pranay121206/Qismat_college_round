import { defineBackground } from 'wxt/utils/define-background';
import { CommandParser, ParsedCommand } from '../src/background/commands';
import { loadSettings, onSettingsChanged, saveSettings } from '../src/shared/settings';
import { EngineStatus, OffscreenStatus, SpeechResult, TrackingMode } from '../src/shared/messages';

/** Actions that carry no free-form words, so they are safe to run before the speaker has finished. */
const INTERIM_SAFE = new Set([
  'CLICK', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'SCROLL_DOWN', 'SCROLL_UP', 'SCROLL_SLOWER', 'SCROLL_FASTER', 'STOP_SCROLL',
  'SCROLL_PAGE_DOWN', 'SCROLL_PAGE_UP', 'SCROLL_TOP', 'SCROLL_BOTTOM', 'NEXT_ITEM', 'PREV_ITEM',
  'MEDIA_PLAY', 'MEDIA_PAUSE', 'MEDIA_MUTE', 'MEDIA_UNMUTE', 'PAUSE', 'RESUME', 'CENTER',
  'SHOW_HINTS', 'HIDE_HINTS', 'CONFIRM', 'CANCEL', 'ZOOM_IN', 'ZOOM_OUT', 'ZOOM_RESET', 'SHOW_HELP', 'HIDE_HELP',
  'STOP_TYPING', 'DICTATION_NEWLINE', 'DICTATION_NEWPARAGRAPH', 'DICTATION_CLEAR'
]);
const INSTANT = new Set(['STOP_SCROLL', 'PAUSE', 'RESUME', 'CANCEL']);
const INTERIM_DELAY_MS = 280;
/** Words that can be the start of a longer command, so never fire them early. */
const AMBIGUOUS_INTERIM = new Set(['scroll', 'down', 'up', 'next', 'previous', 'go', 'page', 'new', 'tab']);

export default defineBackground(() => {
  const parser = new CommandParser();

  let running = false;
  let asleep = false;
  let mode: TrackingMode = 'head';
  let dictating = false;
  let speechLang = 'en-US';

  let lastCommand = '';
  let lastCommandSuccess = true;
  let transcript = '';
  let fps = 0;
  let confidence = 0;
  let cameraActive = false;
  let micActive = false;
  let modelReady = false;
  let error: string | undefined;
  let voiceError: string | undefined;

  let activeTabId: number | undefined;

  // ---- tab helpers -------------------------------------------------------------------------

  let voiceWindowId: number | undefined;

  async function normalWindowId(): Promise<number | undefined> {
    try {
      const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      return w.id;
    } catch {
      return undefined;
    }
  }

  async function refreshActiveTab(): Promise<void> {
    try {
      const windowId = await normalWindowId();
      const [tab] = await chrome.tabs.query(windowId !== undefined ? { active: true, windowId } : { active: true, windowType: 'normal' });
      activeTabId = tab?.id;
    } catch {
      /* ignore */
    }
  }

  async function openVoiceWindow(): Promise<void> {
    try {
      if (voiceWindowId !== undefined) {
        await chrome.windows.get(voiceWindowId);
        return;
      }
    } catch {
      voiceWindowId = undefined;
    }
    try {
      const w = await chrome.windows.create({
        url: chrome.runtime.getURL('voice.html'), type: 'popup', width: 330, height: 210, left: 20, top: 20, focused: false
      });
      voiceWindowId = w.id;
    } catch (e: any) {
      voiceError = `Could not open the voice window: ${e?.message || e}`;
    }
  }

  async function closeVoiceWindow(): Promise<void> {
    chrome.runtime.sendMessage({ type: 'STOP_VOICE' }).catch(() => {});
    if (voiceWindowId !== undefined) await chrome.windows.remove(voiceWindowId).catch(() => {});
    voiceWindowId = undefined;
  }

  chrome.windows.onRemoved.addListener((id) => {
    if (id === voiceWindowId) {
      voiceWindowId = undefined;
      micActive = false;
      if (running) {
        voiceError = 'The voice window was closed. Start Handsfree again to bring it back.';
        broadcastStatus();
      }
    }
  });

  function toActiveTab(message: unknown): void {
    if (activeTabId === undefined) return;
    chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
  }

  /** Make sure the content script is present in a tab opened before the extension was installed. */
  async function ensureContentScript(tabId: number | undefined): Promise<void> {
    if (tabId === undefined) return;
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/content.js'] });
      } catch {
        /* chrome:// pages, the Web Store and the PDF viewer cannot be scripted */
      }
    }
  }

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    if (windowId === voiceWindowId) return;
    activeTabId = tabId;
    if (running) {
      void ensureContentScript(tabId).then(() => broadcastStatus());
    }
  });
  chrome.windows.onFocusChanged.addListener((id) => { if (id !== voiceWindowId) void refreshActiveTab(); });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'complete' && tabId === activeTabId && running) {
      setTimeout(() => broadcastStatus(), 150);
    }
  });

  // ---- offscreen document ------------------------------------------------------------------

  async function ensureOffscreen(): Promise<boolean> {
    try {
      if (typeof chrome.offscreen === 'undefined') {
        error = 'This browser does not support offscreen documents. Use a current version of Chrome or Edge.';
        return false;
      }
      if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: [chrome.offscreen.Reason.USER_MEDIA],
          justification: 'Read the webcam for head tracking and the microphone for voice commands.'
        });
      }
      return true;
    } catch (err: any) {
      console.error('[Handsfree] offscreen document failed:', err);
      error = `Could not start the camera and microphone page: ${err?.message || err}`;
      return false;
    }
  }

  async function closeOffscreen(): Promise<void> {
    try {
      if (typeof chrome.offscreen !== 'undefined' && (await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.closeDocument();
      }
    } catch {
      /* ignore */
    }
  }

  async function sendStartToOffscreen(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await chrome.runtime.sendMessage({ type: 'START_OFFSCREEN_CAPTURE', mode, lang: speechLang });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // ---- status ------------------------------------------------------------------------------

  function getStatus(): EngineStatus {
    return {
      type: 'ENGINE_STATUS',
      running,
      asleep,
      mode,
      cameraActive,
      micActive,
      modelReady,
      confidence,
      fps,
      lastCommand,
      lastCommandSuccess,
      error,
      voiceError,
      speechTranscript: transcript,
      isDictating: dictating
    };
  }

  function broadcastStatus(): void {
    const status = getStatus();
    toActiveTab(status);
    chrome.runtime.sendMessage(status).catch(() => {});
  }

  // ---- engine lifecycle --------------------------------------------------------------------

  async function startEngine(requested?: TrackingMode): Promise<void> {
    if (requested) mode = requested;
    running = true;
    asleep = false;
    error = undefined;
    voiceError = undefined;
    await saveSettings({ enabled: true, mode });
    await refreshActiveTab();
    await ensureContentScript(activeTabId);
    broadcastStatus();
    if (await ensureOffscreen()) await sendStartToOffscreen();
    await openVoiceWindow();
    broadcastStatus();
  }

  async function stopEngine(): Promise<void> {
    running = false;
    asleep = false;
    dictating = false;
    cameraActive = micActive = modelReady = false;
    fps = 0;
    await saveSettings({ enabled: false });
    chrome.runtime.sendMessage({ type: 'STOP_OFFSCREEN_CAPTURE' }).catch(() => {});
    await closeOffscreen();
    await closeVoiceWindow();
    broadcastStatus();
  }

  const boot = (async () => {
    const settings = await loadSettings();
    parser.setWakeWord(settings.wakeWord || '');
    speechLang = settings.speechLang || 'en-US';
    mode = settings.mode || 'head';
    await refreshActiveTab();
    if (settings.enabled) await startEngine(mode);
  })();

  onSettingsChanged((s) => {
    parser.setWakeWord(s.wakeWord || '');
    if (s.speechLang && s.speechLang !== speechLang) {
      speechLang = s.speechLang;
      chrome.runtime.sendMessage({ type: 'SET_SPEECH_LANG', lang: speechLang }).catch(() => {});
    }
  });

  // ---- keyboard shortcuts ------------------------------------------------------------------

  chrome.commands.onCommand.addListener(async (command) => {
    await boot;
    if (command === 'toggle-handsfree') {
      if (running) await stopEngine();
      else await startEngine();
    } else if (command === 'recenter-handsfree') {
      toActiveTab({ type: 'RECENTER' });
    } else if (command === 'toggle-mode') {
      mode = mode === 'head' ? 'hand' : 'head';
      await saveSettings({ mode });
      chrome.runtime.sendMessage({ type: 'SET_MODE', mode }).catch(() => {});
      broadcastStatus();
    }
  });

  // ---- voice -------------------------------------------------------------------------------

  const executed = new Set<string>();
  let interimTimer: ReturnType<typeof setTimeout> | null = null;
  let interimKey = '';

  function remember(id: string): void {
    executed.add(id);
    if (executed.size > 60) executed.delete(executed.values().next().value as string);
  }

  function clearInterim(): void {
    if (interimTimer) clearTimeout(interimTimer);
    interimTimer = null;
    interimKey = '';
  }

  function onSpeech(msg: SpeechResult): void {
    transcript = msg.text;
    toActiveTab(msg); // the HUD shows what was heard

    if (!running || executed.has(msg.utteranceId)) return;

    // Try the top transcript and every alternative; an exact phrase beats a fuzzy one.
    let parsed = parser.parse(msg.text, dictating);
    if ((!parsed || !parsed.exact) && msg.alts && !dictating) {
      for (const alt of msg.alts) {
        const p = parser.parse(alt, dictating);
        if (p && p.exact) { parsed = p; break; }
        if (p && !parsed) parsed = p;
      }
    }
    // Fuzzy guesses from low-confidence speech are how accidental actions happen: ignore them.
    if (parsed && !parsed.exact && !dictating && (msg.confidence || 0.8) < 0.5) parsed = null;
    if (!parsed) {
      if (msg.isFinal) clearInterim();
      return;
    }
    if (asleep && parsed.action !== 'RESUME') return;

    if (msg.isFinal) {
      clearInterim();
      remember(msg.utteranceId);
      void runCommand(parsed);
      return;
    }

    // Interim result: only act early on exact, word-free commands that stay stable for a moment.
    if (!parsed.exact || !INTERIM_SAFE.has(parsed.action)) return;
    if (AMBIGUOUS_INTERIM.has(parsed.matchedText)) return;
    const key = `${msg.utteranceId}|${parsed.matchedText}`;
    if (key === interimKey) return;
    clearInterim();
    interimKey = key;
    interimTimer = setTimeout(
      () => {
        interimTimer = null;
        remember(msg.utteranceId);
        void runCommand(parsed);
      },
      INSTANT.has(parsed.action) ? 0 : INTERIM_DELAY_MS
    );
  }

  async function runCommand(cmd: ParsedCommand): Promise<void> {
    lastCommand = cmd.matchedText;
    lastCommandSuccess = true;
    const tabId = activeTabId;

    switch (cmd.action) {
      case 'PAUSE':
        asleep = true;
        toActiveTab({ type: 'COMMAND_ACTION', action: 'STOP_SCROLL', timestamp: Date.now() });
        break;
      case 'RESUME':
        asleep = false;
        break;
      case 'SET_MODE':
        if (cmd.payload === 'head' || cmd.payload === 'hand') {
          mode = cmd.payload;
          await saveSettings({ mode });
          chrome.runtime.sendMessage({ type: 'SET_MODE', mode }).catch(() => {});
        }
        break;
      case 'NEW_TAB':
        await chrome.tabs.create({ url: 'https://www.google.com' });
        break;
      case 'DUPLICATE_TAB':
        if (tabId !== undefined) await chrome.tabs.duplicate(tabId).catch(() => {});
        break;
      case 'NEW_WINDOW':
        await chrome.windows.create({ url: 'https://www.google.com' }).catch(() => {});
        break;
      case 'CLOSE_OTHER_TABS': {
        const all = await chrome.tabs.query({ currentWindow: true });
        const ids = all.filter((t) => !t.active && t.id !== undefined).map((t) => t.id as number);
        if (ids.length) await chrome.tabs.remove(ids).catch(() => {});
        break;
      }
      case 'FIND_TAB': {
        // "go to tab youtube": match against tab titles and addresses
        const q = String(cmd.payload || '').toLowerCase();
        const all = await chrome.tabs.query({});
        const hit = all.find((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
        if (hit?.id !== undefined) {
          await chrome.tabs.update(hit.id, { active: true });
          if (hit.windowId !== undefined) await chrome.windows.update(hit.windowId, { focused: true }).catch(() => {});
        } else {
          lastCommandSuccess = false;
        }
        break;
      }
      case 'BROWSER_SEARCH_OPEN':
        await openBrowserSearch();
        break;
      case 'BROWSER_SEARCH': {
        // search the whole web (address bar style), never the page's own search box
        const { query, engine, newTab } = cmd.payload as { query: string; engine: string; newTab?: boolean };
        const q = encodeURIComponent(query);
        const url = engine === 'youtube' ? `https://www.youtube.com/results?search_query=${q}`
          : engine === 'wikipedia' ? `https://en.wikipedia.org/w/index.php?search=${q}`
          : engine === 'maps' ? `https://www.google.com/maps/search/${q}`
          : engine === 'amazon' ? `https://www.amazon.in/s?k=${q}`
          : engine === 'github' ? `https://github.com/search?q=${q}`
          : `https://www.google.com/search?q=${q}`;
        if (newTab || tabId === undefined) await chrome.tabs.create({ url });
        else await chrome.tabs.update(tabId, { url }).catch(() => {});
        break;
      }
      case 'FIRST_TAB':
      case 'LAST_TAB':
        await switchTab(cmd);
        break;
      case 'CLOSE_TAB':
        if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => {});
        break;
      case 'NEXT_TAB':
      case 'PREV_TAB':
      case 'SWITCH_TAB':
        await switchTab(cmd);
        break;
      case 'GO_BACK':
        if (tabId !== undefined) await chrome.tabs.goBack(tabId).catch(() => {});
        break;
      case 'GO_FORWARD':
        if (tabId !== undefined) await chrome.tabs.goForward(tabId).catch(() => {});
        break;
      case 'REFRESH':
        if (tabId !== undefined) await chrome.tabs.reload(tabId).catch(() => {});
        break;
      case 'NAVIGATE':
        if (tabId !== undefined && cmd.payload) await chrome.tabs.update(tabId, { url: cmd.payload }).catch(() => {});
        break;
      case 'SEARCH':
        // try the site's own search box first; the page reports back with WEB_SEARCH if there is none
        toActiveTab({ type: 'COMMAND_ACTION', action: 'SITE_SEARCH', payload: cmd.payload, timestamp: Date.now() });
        break;
      case 'WEB_SEARCH':
        if (tabId !== undefined && cmd.payload) {
          await chrome.tabs
            .update(tabId, { url: `https://www.google.com/search?q=${encodeURIComponent(cmd.payload)}` })
            .catch(() => {});
        }
        break;
      default:
        // everything else happens on the page
        toActiveTab({
          type: 'COMMAND_ACTION',
          action: cmd.action,
          payload: cmd.payload,
          timestamp: Date.now(),
          rawTranscript: cmd.originalText
        });
        break;
    }
    broadcastStatus();
  }

  async function switchTab(cmd: ParsedCommand): Promise<void> {
    try {
      const wid = await normalWindowId();
      const tabs = await chrome.tabs.query(wid !== undefined ? { windowId: wid } : { currentWindow: true });
      if (tabs.length <= 1) return;
      tabs.sort((a, b) => a.index - b.index);
      const current = tabs.findIndex((t) => t.active);
      let target = current;
      if (cmd.action === 'NEXT_TAB') target = (current + 1) % tabs.length;
      else if (cmd.action === 'PREV_TAB') target = (current - 1 + tabs.length) % tabs.length;
      else if (cmd.action === 'FIRST_TAB') target = 0;
      else if (cmd.action === 'LAST_TAB') target = tabs.length - 1;
      else if (typeof cmd.payload === 'number') target = Math.min(cmd.payload, tabs.length) - 1;
      const id = tabs[target]?.id;
      if (id !== undefined) await chrome.tabs.update(id, { active: true });
    } catch (e) {
      console.warn('[Handsfree] tab switch failed', e);
    }
  }

  /** Open a new tab on a search engine, then focus its search box and start dictating into it. */
  async function openBrowserSearch(): Promise<void> {
    try {
      const tab = await chrome.tabs.create({ url: 'https://www.google.com' });
      const id = tab.id;
      if (id === undefined) return;
      const onUpd = (tid: number, info: chrome.tabs.TabChangeInfo) => {
        if (tid !== id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpd);
        activeTabId = id;
        setTimeout(() => {
          chrome.tabs.sendMessage(id, { type: 'COMMAND_ACTION', action: 'FOCUS_SEARCH', timestamp: Date.now() }).catch(() => {});
        }, 700);
      };
      chrome.tabs.onUpdated.addListener(onUpd);
    } catch (e) {
      console.warn('[Handsfree] browser search failed', e);
    }
  }

  // ---- message hub -------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    switch (message?.type) {
      case 'POSE_FRAME':
        confidence = message.confidence;
        toActiveTab(message);
        return false;

      case 'VOICE_STATUS':
        micActive = !!message.micActive;
        voiceError = message.voiceError;
        broadcastStatus();
        return false;

      case 'OFFSCREEN_STATUS': {
        const s = message as OffscreenStatus;
        cameraActive = s.cameraActive;
        fps = s.fps;
        modelReady = s.modelReady;
        confidence = s.confidence;
        error = s.error;
        broadcastStatus();
        return false;
      }

      case 'OFFSCREEN_READY':
        // The offscreen page (re)loaded, for example after the worker restarted. Start it again.
        if (running) void sendStartToOffscreen();
        return false;

      case 'SPEECH_RESULT':
        onSpeech(message as SpeechResult);
        return false;

      case 'WEB_SEARCH':
        void runCommand({ action: 'WEB_SEARCH', payload: message.query, confidence: 1, matchedText: 'search', originalText: '', exact: true });
        return false;

      case 'KEEPALIVE':
        return false;

      case 'GESTURE': {
        if (!running || asleep) return false;
        const g = message.gesture as string;
        const note = (t: string) => toActiveTab({ type: 'COMMAND_ACTION', action: 'HUD_NOTE', payload: t, timestamp: Date.now() });
        if (g === 'SWIPE_RIGHT' || g === 'TILT_RIGHT') { note('Next tab'); void switchTab({ action: 'NEXT_TAB' } as ParsedCommand); }
        else if (g === 'SWIPE_LEFT' || g === 'TILT_LEFT') { note('Previous tab'); void switchTab({ action: 'PREV_TAB' } as ParsedCommand); }
        else if (g === 'SWIPE_DOWN') { note('Page down'); toActiveTab({ type: 'COMMAND_ACTION', action: 'SCROLL_PAGE_DOWN', timestamp: Date.now() }); }
        else if (g === 'SWIPE_UP') { note('Page up'); toActiveTab({ type: 'COMMAND_ACTION', action: 'SCROLL_PAGE_UP', timestamp: Date.now() }); }
        else if (g === 'THUMB_UP') { note('Search this page'); toActiveTab({ type: 'COMMAND_ACTION', action: 'FOCUS_SEARCH', timestamp: Date.now() }); }
        else if (g === 'THUMB_DOWN') { note('Back'); void runCommand({ action: 'GO_BACK', confidence: 1, matchedText: 'back', originalText: '', exact: true }); }
        else if (g === 'BROW_RAISE') { note('Browser search'); void openBrowserSearch(); }
        else if (g === 'MOUTH_CLICK') toActiveTab({ type: 'COMMAND_ACTION', action: 'CLICK', timestamp: Date.now() });
        else if (g === 'SCROLL_DOWN' || g === 'SCROLL_UP' || g === 'SCROLL_STOP') {
          toActiveTab({ type: 'COMMAND_ACTION', action: g === 'SCROLL_STOP' ? 'STOP_SCROLL' : g, payload: { speed: 'normal' }, timestamp: Date.now() });
        }
        return false;
      }

      case 'DICTATION_STATE':
        dictating = !!message.active;
        broadcastStatus();
        return false;

      case 'START_ENGINE':
        startEngine(message.mode).then(() => sendResponse({ success: true }));
        return true;
      case 'STOP_ENGINE':
        stopEngine().then(() => sendResponse({ success: true }));
        return true;
      case 'TOGGLE_ENGINE':
        (running ? stopEngine() : startEngine()).then(() => sendResponse({ running }));
        return true;

      case 'SET_MODE':
        // From the popup. The offscreen page also hears this broadcast and switches its tracker.
        if (message.mode === 'head' || message.mode === 'hand') {
          mode = message.mode;
          void saveSettings({ mode });
          broadcastStatus();
        }
        sendResponse({ success: true });
        return false;

      case 'RECENTER':
        toActiveTab({ type: 'RECENTER' });
        sendResponse({ success: true });
        return false;

      case 'GET_STATUS':
        boot.then(() => sendResponse(getStatus()));
        return true;

      case 'START_TYPING':
      case 'STOP_TYPING':
        toActiveTab({ type: message.type });
        sendResponse({ success: true });
        return false;

      default:
        return false;
    }
  });

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
    }
    // Reach tabs that were already open so the user does not have to reload each one.
    try {
      const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      for (const t of tabs) if (t.id !== undefined) await ensureContentScript(t.id);
    } catch {
      /* ignore */
    }
  });
});
