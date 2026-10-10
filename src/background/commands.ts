import type { HandsfreeState } from '../shared/messages';
import { DEFAULT_CUSTOM_SITES } from '../shared/settings';

export interface CommandDefinition {
  command: string;
  category:
    'pointer' | 'scroll' | 'navigation' | 'hints' | 'modes' | 'confirmation' | 'help' | 'unknown';
  phrases: string[];
}

export interface ParseResult {
  recognized: boolean;
  command?: string;
  category?: CommandDefinition['category'];
  args?: Record<string, any>;
  confidence: number;
  rawText: string;
  normalizedText: string;
  message: string;
}

export interface ParseOptions {
  state?: HandsfreeState;
  wakeWordEnabled?: boolean;
  wakeWord?: string;
  customSites?: Record<string, string>;
  threshold?: number;
}

// Fixed grammar vocabulary
export const COMMAND_GRAMMAR: CommandDefinition[] = [
  // Pointer
  {
    command: 'click',
    category: 'pointer',
    phrases: ['click', 'clik', 'left click', 'single click'],
  },
  {
    command: 'double-click',
    category: 'pointer',
    phrases: ['double click', 'doubleclick', 'twice click', 'dubble click'],
  },
  {
    command: 'right-click',
    category: 'pointer',
    phrases: ['right click', 'rite click', 'context menu', 'rightclick'],
  },
  {
    command: 'drag',
    category: 'pointer',
    phrases: ['drag', 'start drag', 'drag start', 'pick up'],
  },
  {
    command: 'drop',
    category: 'pointer',
    phrases: ['drop', 'drag end', 'stop drag', 'release drag'],
  },
  {
    command: 'select',
    category: 'pointer',
    phrases: ['select', 'select this', 'select item', 'choose'],
  },
  {
    command: 'open',
    category: 'pointer',
    phrases: ['open', 'open link', 'open this', 'open this link', 'open target'],
  },
  {
    command: 'open-new-tab',
    category: 'pointer',
    phrases: [
      'open new tab',
      'open in new tab',
      'open link in new tab',
      'open this in new tab',
      'open link new tab',
    ],
  },
  {
    command: 'copy-link',
    category: 'pointer',
    phrases: ['copy link', 'copy link address', 'copy url', 'copy this link'],
  },
  {
    command: 'read-this',
    category: 'pointer',
    phrases: ['read this', 'read text', 'read element', 'read out loud', 'speak this'],
  },
  {
    command: 'zoom-here',
    category: 'pointer',
    phrases: ['zoom here', 'zoom this', 'magnify here', 'focus here'],
  },

  // Scroll
  {
    command: 'scroll-down',
    category: 'scroll',
    phrases: ['scroll down', 'scrolling down', 'scroll downward', 'skroll down'],
  },
  {
    command: 'scroll-up',
    category: 'scroll',
    phrases: ['scroll up', 'scrolling up', 'scroll upward', 'skroll up'],
  },
  { command: 'page-down', category: 'scroll', phrases: ['page down', 'pagedown'] },
  { command: 'page-up', category: 'scroll', phrases: ['page up', 'pageup'] },
  {
    command: 'scroll-top',
    category: 'scroll',
    phrases: ['top', 'scroll top', 'scroll to top', 'go to top'],
  },
  {
    command: 'scroll-bottom',
    category: 'scroll',
    phrases: ['bottom', 'scroll bottom', 'scroll to bottom', 'go to bottom'],
  },
  {
    command: 'scroll-stop',
    category: 'scroll',
    phrases: ['stop', 'stop scrolling', 'stop scroll', 'halt', 'freeze'],
  },
  {
    command: 'scroll-here',
    category: 'scroll',
    phrases: ['scroll here', 'scroll this', 'scroll container'],
  },

  // Navigation
  {
    command: 'history-back',
    category: 'navigation',
    phrases: ['go back', 'back', 'previous page'],
  },
  {
    command: 'history-forward',
    category: 'navigation',
    phrases: ['go forward', 'forward', 'next page'],
  },
  { command: 'refresh', category: 'navigation', phrases: ['refresh', 'reload', 'reload page'] },
  { command: 'new-tab', category: 'navigation', phrases: ['new tab', 'open tab', 'create tab'] },
  { command: 'close-tab', category: 'navigation', phrases: ['close tab', 'close window'] },
  { command: 'next-tab', category: 'navigation', phrases: ['next tab', 'switch next tab'] },
  {
    command: 'previous-tab',
    category: 'navigation',
    phrases: ['previous tab', 'prev tab', 'switch prev tab'],
  },

  // Hints
  {
    command: 'show-hints',
    category: 'hints',
    phrases: ['show hints', 'hints', 'show numbers', 'display hints'],
  },
  {
    command: 'hide-hints',
    category: 'hints',
    phrases: ['hide hints', 'hints off', 'hide numbers', 'clear hints'],
  },

  // Modes & Toggles
  {
    command: 'pause',
    category: 'modes',
    phrases: ['pause', 'sleep', 'pause tracking', 'pause handsfree'],
  },
  {
    command: 'resume',
    category: 'modes',
    phrases: ['resume', 'wake up', 'wake', 'start listening', 'activate'],
  },
  {
    command: 'set-mode-head',
    category: 'modes',
    phrases: ['head mode', 'head tracking', 'switch to head mode', 'hed mode'],
  },
  {
    command: 'set-mode-hand',
    category: 'modes',
    phrases: ['hand mode', 'hand tracking', 'switch to hand mode'],
  },
  {
    command: 'set-mode-eye',
    category: 'modes',
    phrases: ['eye mode', 'eye tracking', 'switch to eye mode'],
  },
  {
    command: 'dwell-on',
    category: 'modes',
    phrases: ['dwell on', 'enable dwell', 'turn on dwell'],
  },
  {
    command: 'dwell-off',
    category: 'modes',
    phrases: ['dwell off', 'disable dwell', 'turn off dwell'],
  },
  {
    command: 'recenter',
    category: 'modes',
    phrases: ['center', 'recenter', 're-center', 'reset center'],
  },
  {
    command: 'start-typing',
    category: 'modes',
    phrases: ['start typing', 'type', 'type here', 'start dictation', 'dictate'],
  },
  {
    command: 'stop-typing',
    category: 'modes',
    phrases: ['stop typing', 'end typing', 'stop dictation'],
  },
  { command: 'zoom-in', category: 'modes', phrases: ['zoom in', 'zoom in page', 'enlarge'] },
  { command: 'zoom-out', category: 'modes', phrases: ['zoom out', 'zoom out page', 'shrink'] },

  // Confirmation
  {
    command: 'submit',
    category: 'confirmation',
    phrases: ['submit', 'press enter', 'hit enter', 'enter', 'submit form'],
  },
  {
    command: 'confirm',
    category: 'confirmation',
    phrases: ['yes', 'confirm', 'proceed', 'accept', 'ok', 'okay', 'sure'],
  },
  {
    command: 'cancel',
    category: 'confirmation',
    phrases: ['no', 'cancel', 'abort', 'reject', 'nevermind'],
  },

  // Help
  {
    command: 'show-help',
    category: 'help',
    phrases: [
      'what can i say',
      'help',
      'show commands',
      'commands help',
      'what can you do',
      'commands',
    ],
  },
];

const NUMBER_MAP: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

const FILLER_WORDS = [
  'please',
  'can you',
  'could you',
  'would you',
  'hey',
  'uh',
  'um',
  'ah',
  'er',
  'just',
  'kind of',
  'sort of',
  'like',
  'you know',
  'hello',
  'hi',
];

/**
 * Converts English number words (e.g. "three", "twenty one") to digits ("3", "21").
 */
export function convertNumberWordsToDigits(text: string): string {
  const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const units = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

  let result = text;
  for (const t of tens) {
    for (const u of units) {
      const compound = `${t} ${u}`;
      const val = (NUMBER_MAP[t] || 0) + (NUMBER_MAP[u] || 0);
      result = result.replace(new RegExp(`\\b${compound}\\b`, 'gi'), String(val));
    }
  }

  result = result.replace(/\b(one\s+hundred|a\s+hundred)\b/gi, '100');

  for (const [word, val] of Object.entries(NUMBER_MAP)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), String(val));
  }

  return result;
}

/**
 * Strips conversational filler words and leading/trailing punctuation.
 */
export function stripFillerWords(text: string): string {
  let cleaned = text;
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    cleaned = cleaned.replace(regex, ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes input: lowercases, converts numbers to digits, strips fillers and extra whitespace.
 */
export function normalizeText(raw: string): string {
  if (!raw) return '';
  let text = raw.toLowerCase().trim();
  text = text.replace(/[^a-z0-9\s]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  text = stripFillerWords(text);
  text = convertNumberWordsToDigits(text);
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Damerau-Levenshtein distance (supports transpositions of adjacent characters).
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const width = n + 1;
  const d = new Int32Array((m + 1) * width);

  for (let i = 0; i <= m; i++) {
    d[i * width] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (d[(i - 1) * width + j] ?? 0) + 1;
      const ins = (d[i * width + (j - 1)] ?? 0) + 1;
      const sub = (d[(i - 1) * width + (j - 1)] ?? 0) + cost;
      let minCost = Math.min(del, ins, sub);

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        const trans = (d[(i - 2) * width + (j - 2)] ?? 0) + 1;
        minCost = Math.min(minCost, trans);
      }
      d[i * width + j] = minCost;
    }
  }

  return d[m * width + n] ?? 0;
}

/**
 * Computes normalized string similarity in range [0, 1].
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Simplified phonetic code generator (handles common speech-to-text substitutions).
 */
export function phoneticCode(str: string): string {
  let s = str.toLowerCase();
  s = s.replace(/gh/g, ''); // silent gh in right, light, night
  s = s.replace(/ph/g, 'f');
  s = s.replace(/ck/g, 'k');
  s = s.replace(/c(?=[eiy])/g, 's');
  s = s.replace(/c/g, 'k');
  s = s.replace(/q/g, 'k');
  s = s.replace(/x/g, 'ks');
  s = s.replace(/z/g, 's');
  s = s.replace(/sh/g, 'x');
  s = s.replace(/ch/g, 'x');
  s = s.replace(/ee/g, 'i');
  s = s.replace(/ea/g, 'i');
  s = s.replace(/oo/g, 'u');
  s = s.replace(/ou/g, 'u');
  s = s.replace(/au/g, 'o');
  s = s.replace(/aw/g, 'o');
  // Collapse duplicate letters
  s = s.replace(/(.)\1+/g, '$1');
  return s.trim();
}

/**
 * Blended similarity combining edit distance and phonetic representation.
 */
export function matchSimilarity(input: string, target: string): number {
  if (input === target) return 1.0;
  const textSim = stringSimilarity(input, target);
  const pInput = phoneticCode(input);
  const pTarget = phoneticCode(target);
  const phonSim = stringSimilarity(pInput, pTarget);

  if (pInput === pTarget) {
    return Math.max(textSim, 0.95);
  }
  return Math.max(textSim, phonSim * 0.95);
}

const DEFAULT_THRESHOLD = 0.72;

/**
 * Parses user spoken utterance into a structured command.
 */
export function parseCommand(rawText: string, options: ParseOptions = {}): ParseResult {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const state = options.state ?? 'Active';
  const customSites = { ...DEFAULT_CUSTOM_SITES, ...(options.customSites || {}) };

  let normalized = normalizeText(rawText);

  // 1. Wake word check (setting: wakeWordEnabled)
  if (options.wakeWordEnabled) {
    const wakeWord = (options.wakeWord || 'handsfree').toLowerCase().trim();
    const wakePrefix = new RegExp(`^${wakeWord}\\s*`, 'i');

    if (normalized === wakeWord || normalized === 'wake up' || normalized === 'resume') {
      return {
        recognized: true,
        command: 'resume',
        category: 'modes',
        confidence: 1.0,
        rawText,
        normalizedText: normalized,
        message: 'Resuming Handsfree',
      };
    }

    if (normalized === 'pause') {
      return filterByState(
        {
          recognized: true,
          command: 'pause',
          category: 'modes',
          confidence: 1.0,
          rawText,
          normalizedText: normalized,
          message: 'Handsfree Paused',
        },
        state,
      );
    }

    if (wakePrefix.test(normalized)) {
      normalized = normalized.replace(wakePrefix, '').trim();
    } else {
      return {
        recognized: false,
        confidence: 0,
        rawText,
        normalizedText: normalized,
        message: `Didn't catch that (Say '${wakeWord}' first)`,
      };
    }
  }

  if (!normalized) {
    return {
      recognized: false,
      confidence: 0,
      rawText,
      normalizedText: normalized,
      message: "Didn't catch that",
    };
  }

  // 2. Parameterized Commands

  // A. "click <number>" (e.g. "click 3", "click 12")
  const clickHintMatch = normalized.match(/^(?:click|select|press)\s+(\d+)$/i);
  if (clickHintMatch && clickHintMatch[1]) {
    const num = parseInt(clickHintMatch[1], 10);
    return filterByState(
      {
        recognized: true,
        command: 'click-hint',
        category: 'hints',
        args: { hintNumber: num },
        confidence: 0.95,
        rawText,
        normalizedText: normalized,
        message: `Click hint ${num}`,
      },
      state,
    );
  }

  // B. "open link <number>" (e.g. "open link 5")
  const openLinkMatch = normalized.match(/^(?:open\s+link|link)\s+(\d+)$/i);
  if (openLinkMatch && openLinkMatch[1]) {
    const num = parseInt(openLinkMatch[1], 10);
    return filterByState(
      {
        recognized: true,
        command: 'open-hint-link',
        category: 'hints',
        args: { hintNumber: num },
        confidence: 0.95,
        rawText,
        normalizedText: normalized,
        message: `Open link ${num}`,
      },
      state,
    );
  }

  // C. "tab <number>" (e.g. "tab 3", "tab 1")
  const tabNumMatch = normalized.match(/^(?:tab|go\s+to\s+tab|switch\s+tab)\s+(\d+)$/i);
  if (tabNumMatch && tabNumMatch[1]) {
    const num = parseInt(tabNumMatch[1], 10);
    return filterByState(
      {
        recognized: true,
        command: 'switch-tab',
        category: 'navigation',
        args: { tabIndex: num },
        confidence: 0.95,
        rawText,
        normalizedText: normalized,
        message: `Switch to tab ${num}`,
      },
      state,
    );
  }

  // D. "open <site name>"
  const openSiteMatch = normalized.match(/^open\s+([a-z0-9._\-\s]+)$/i);
  if (openSiteMatch && openSiteMatch[1]) {
    const siteKey = openSiteMatch[1].trim().toLowerCase();
    const targetlessOpenWords = [
      'tab',
      'new tab',
      'in new tab',
      'link in new tab',
      'this',
      'this link',
      'here',
    ];
    if (!siteKey.startsWith('link') && !targetlessOpenWords.includes(siteKey)) {
      let matchedSiteUrl: string | undefined = customSites[siteKey];

      if (!matchedSiteUrl) {
        let bestSite = '';
        let bestSiteScore = 0;
        for (const siteName of Object.keys(customSites)) {
          const score = matchSimilarity(siteKey, siteName);
          if (score > bestSiteScore) {
            bestSiteScore = score;
            bestSite = siteName;
          }
        }
        if (bestSiteScore >= 0.75) {
          matchedSiteUrl = customSites[bestSite];
        }
      }

      const siteUrl =
        matchedSiteUrl ||
        (siteKey.includes('.') ? `https://${siteKey}` : `https://www.${siteKey}.com`);

      return filterByState(
        {
          recognized: true,
          command: 'open-site',
          category: 'navigation',
          args: { site: siteKey, url: siteUrl },
          confidence: matchedSiteUrl ? 0.95 : 0.85,
          rawText,
          normalizedText: normalized,
          message: `Opening ${siteKey}`,
        },
        state,
      );
    }
  }

  // E. "search for <query>"
  const searchMatch = normalized.match(/^(?:search\s+for|search|look\s+up|google)\s+(.+)$/i);
  if (searchMatch && searchMatch[1]) {
    const query = searchMatch[1].trim();
    if (query) {
      return filterByState(
        {
          recognized: true,
          command: 'search',
          category: 'navigation',
          args: { query },
          confidence: 0.95,
          rawText,
          normalizedText: normalized,
          message: `Searching for "${query}"`,
        },
        state,
      );
    }
  }

  // 3. Grammar Matching with Fuzzy Comparison
  let bestMatch: CommandDefinition | null = null;
  let bestScore = 0;

  for (const entry of COMMAND_GRAMMAR) {
    for (const phrase of entry.phrases) {
      const score = matchSimilarity(normalized, phrase);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
  }

  // 4. Threshold Evaluation
  if (bestMatch && bestScore >= threshold) {
    const result: ParseResult = {
      recognized: true,
      command: bestMatch.command,
      category: bestMatch.category,
      confidence: Math.round(bestScore * 100) / 100,
      rawText,
      normalizedText: normalized,
      message: formatCommandMessage(bestMatch.command),
    };
    return filterByState(result, state);
  }

  // 5. Rejected below threshold
  return {
    recognized: false,
    confidence: Math.round(bestScore * 100) / 100,
    rawText,
    normalizedText: normalized,
    message: "Didn't catch that",
  };
}

function formatCommandMessage(command: string): string {
  switch (command) {
    case 'click':
      return 'Click';
    case 'double-click':
      return 'Double Click';
    case 'right-click':
      return 'Right Click';
    case 'open':
      return 'Open Link';
    case 'open-new-tab':
      return 'Open in New Tab';
    case 'select':
      return 'Select';
    case 'scroll-here':
      return 'Scroll Here';
    case 'zoom-here':
      return 'Zoom Here';
    case 'copy-link':
      return 'Link Copied';
    case 'read-this':
      return 'Reading Text';
    case 'drag':
      return 'Dragging';
    case 'drop':
      return 'Dropped';
    case 'scroll-down':
      return 'Scrolling Down';
    case 'scroll-up':
      return 'Scrolling Up';
    case 'page-down':
      return 'Page Down';
    case 'page-up':
      return 'Page Up';
    case 'scroll-top':
      return 'Scrolled to Top';
    case 'scroll-bottom':
      return 'Scrolled to Bottom';
    case 'scroll-stop':
      return 'Scroll Stopped';
    case 'history-back':
      return 'Navigated Back';
    case 'history-forward':
      return 'Navigated Forward';
    case 'refresh':
      return 'Page Refreshed';
    case 'new-tab':
      return 'New Tab Opened';
    case 'close-tab':
      return 'Tab Closed';
    case 'next-tab':
      return 'Next Tab';
    case 'previous-tab':
      return 'Previous Tab';
    case 'show-hints':
      return 'Hints Displayed';
    case 'hide-hints':
      return 'Hints Hidden';
    case 'pause':
      return 'Handsfree Paused';
    case 'resume':
      return 'Handsfree Resumed';
    case 'set-mode-head':
      return 'Switched to Head Mode';
    case 'set-mode-hand':
      return 'Switched to Hand Mode';
    case 'set-mode-eye':
      return 'Switched to Eye Mode';
    case 'dwell-on':
      return 'Dwell Clicking Enabled';
    case 'dwell-off':
      return 'Dwell Clicking Disabled';
    case 'recenter':
      return 'Neutral Pose Re-centered';
    case 'start-typing':
      return 'Typing Started';
    case 'stop-typing':
      return 'Typing Stopped';
    case 'zoom-in':
      return 'Zoomed In';
    case 'zoom-out':
      return 'Zoomed Out';
    case 'submit':
      return 'Submitted';
    case 'confirm':
      return 'Confirmed';
    case 'cancel':
      return 'Cancelled';
    case 'show-help':
      return 'Opening Voice Commands';
    default:
      return command;
  }
}

function filterByState(result: ParseResult, state: HandsfreeState): ParseResult {
  if (state === 'Paused') {
    if (result.command === 'resume' || result.command === 'pause') {
      return result;
    }
    return {
      recognized: false,
      confidence: result.confidence,
      rawText: result.rawText,
      normalizedText: result.normalizedText,
      message: "Paused: Say 'resume' or 'wake up' to activate",
    };
  }
  if (state === 'Dictating') {
    const allowedCommands = ['stop-typing', 'submit', 'pause', 'cancel', 'confirm'];
    if (result.command && allowedCommands.includes(result.command)) {
      return result;
    }
    return {
      recognized: false,
      confidence: result.confidence,
      rawText: result.rawText,
      normalizedText: result.normalizedText,
      message: 'Dictating',
    };
  }
  return result;
}
