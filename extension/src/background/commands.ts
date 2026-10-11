export interface ParsedCommand {
  action: string;
  payload?: any;
  confidence: number;
  matchedText: string;
  originalText: string;
  /** True when the phrase matched exactly (not by fuzzy similarity). Only exact matches may run from interim speech. */
  exact: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

// Words speech recognition often returns instead of a number. Only used right after "click" / "tab" / "type".
const NUMBER_HOMOPHONES: Record<string, number> = { won: 1, to: 2, too: 2, for: 4, fore: 4, ate: 8, tree: 3, free: 3 };

export function wordsToNumber(phrase: string, allowHomophones = false): number | null {
  const clean = phrase.trim().toLowerCase();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);

  const parts = clean.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return null;
  let total = 0;
  for (const part of parts) {
    if (NUMBER_WORDS[part] !== undefined) total += NUMBER_WORDS[part];
    else if (allowHomophones && NUMBER_HOMOPHONES[part] !== undefined) total += NUMBER_HOMOPHONES[part];
    else return null; // any non-number word means this is not a number phrase
  }
  return total;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshteinDistance(a, b) / maxLen;
}

export function normalizeSpeech(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ')
    .replace(/\b(please|can you|could you|would you|uh|um|hey|just|the|kindly)\b/g, ' ')
    .replace(/^\s*(?:(?:okay|ok|now|then|and|so|yeah|go ahead)\s+)+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Things speech recognition commonly mishears for our command words. */
const MISHEARD: Array<[RegExp, string]> = [
  [/\b(?:scroll|scrolled|scrolling|stroll|scrawl|school)\s+(?:down|dawn|town|don|done|dun|downward|downwards|dowel)\b/g, 'scroll down'],
  [/\b(?:scroll|scrolled|scrolling|stroll|scrawl|school)\s+(?:up|op|app|upp|upward|upwards)\b/g, 'scroll up'],
  [/\b(?:switch|change|move|go)\s+(?:to\s+)?next\s+(?:tab|tap|top|tub|tabs)\b/g, 'next tab'],
  [/\b(?:switch|change|move|go)\s+(?:to\s+)?(?:previous|prev|last|back)\s+(?:tab|tap|top|tub|tabs)\b/g, 'previous tab'],
  [/\b(?:open|make)\s+(?:a\s+)?new\s+(?:tab|tap|top|tub)\b/g, 'new tab'],
  [/\bnew\s*(?:tab|tap|top|tub)\b/g, 'new tab'],
  [/\b(?:next|new)\s+(?:tabs)\b/g, 'next tab'],
  [/\b(?:back\s?ward|backwards|go\s+backward)\b/g, 'go back'],
  [/\bpages?\s+(?:down|dawn|town)\b/g, 'page down'],
  [/\bpages?\s+(?:up|op|app)\b/g, 'page up'],
  [/\b(?:stop\s+scroll(?:ing|ed)?|stops|stopped|stopping)\b/g, 'stop'],
  [/\b(?:clicks|clicked|clicking|lick)\b/g, 'click'],
  [/\bscroll (town|dawn|don|done)\b/g, 'scroll down'],
  [/\bscroll (op|app|upp)\b/g, 'scroll up'],
  [/\b(clique|clic|click on|klick|quick)\b/g, 'click'],
  [/\bnext (tap|top|time)\b/g, 'next tab'],
  [/\bprevious (tap|top)\b/g, 'previous tab'],
  [/\b(close|clothes) (tap|top)\b/g, 'close tab'],
  [/\bnew (tap|top)\b/g, 'new tab'],
  [/\bswitch to (tap|top)\b/g, 'switch to tab'],
  [/\b(tap|top) (\d+|one|two|three|four|five|six|seven|eight|nine)\b/g, 'tab $2'],
  [/\b(go|goes) back\b/g, 'go back'],
  [/\bgo (to )?(the )?previous (page)\b/g, 'go back'],
  [/\bre ?load\b/g, 'reload'],
  [/\bsearch (the )?(web|google) (for )?/g, 'google '],
  [/\bpage (town|dawn)\b/g, 'page down'],
  [/\bshow (hence|hind|hence)\b/g, 'show hints'],
  [/\bshow (hint)\b/g, 'show hints']
];
export function fixMisheard(text: string): string {
  let t = text;
  for (const [re, rep] of MISHEARD) t = t.replace(re, rep);
  return t.replace(/\s+/g, ' ').trim();
}

/** Turn spoken punctuation into symbols while dictating: "hello comma world full stop" -> "hello, world." */
export function applySpokenPunctuation(text: string): string {
  const rules: Array<[RegExp, string]> = [
    [/\s*\b(full stop|period)\b/gi, '.'],
    [/\s*\bcomma\b/gi, ','],
    [/\s*\bquestion mark\b/gi, '?'],
    [/\s*\bexclamation (?:mark|point)\b/gi, '!'],
    [/\s*\bcolon\b/gi, ':'],
    [/\s*\bsemicolon\b/gi, ';'],
    [/\s*\bat sign\b\s*/gi, '@'],
    [/\s*\bdash\b\s*/gi, ' - ']
  ];
  let out = text;
  for (const [re, sym] of rules) out = out.replace(re, sym);
  return out.replace(/\s+([.,?!:;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

export const COMMON_SITES: Record<string, string> = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  wikipedia: 'https://www.wikipedia.org',
  github: 'https://github.com',
  reddit: 'https://www.reddit.com',
  twitter: 'https://x.com',
  x: 'https://x.com',
  gmail: 'https://mail.google.com',
  instagram: 'https://www.instagram.com',
  facebook: 'https://www.facebook.com',
  linkedin: 'https://www.linkedin.com',
  amazon: 'https://www.amazon.in',
  netflix: 'https://www.netflix.com',
  whatsapp: 'https://web.whatsapp.com',
  maps: 'https://maps.google.com',
  news: 'https://news.google.com'
};

type Entry = { action: string; payload?: any };

const EXACT: Record<string, Entry> = {
  // pointer
  click: { action: 'CLICK' }, select: { action: 'CLICK' }, tap: { action: 'CLICK' }, press: { action: 'CLICK' },
  'click here': { action: 'CLICK' }, 'click that': { action: 'CLICK' },
  'double click': { action: 'DOUBLE_CLICK' },
  'right click': { action: 'RIGHT_CLICK' }, 'context menu': { action: 'RIGHT_CLICK' },

  // scrolling (continuous)
  'scroll down': { action: 'SCROLL_DOWN' }, down: { action: 'SCROLL_DOWN' },
  'scroll up': { action: 'SCROLL_UP' }, up: { action: 'SCROLL_UP' },
  'scroll down slowly': { action: 'SCROLL_DOWN', payload: { speed: 'slow' } },
  'scroll slowly down': { action: 'SCROLL_DOWN', payload: { speed: 'slow' } },
  'slowly scroll down': { action: 'SCROLL_DOWN', payload: { speed: 'slow' } },
  'scroll up slowly': { action: 'SCROLL_UP', payload: { speed: 'slow' } },
  'scroll down fast': { action: 'SCROLL_DOWN', payload: { speed: 'fast' } },
  'scroll up fast': { action: 'SCROLL_UP', payload: { speed: 'fast' } },
  slower: { action: 'SCROLL_SLOWER' }, 'slow down': { action: 'SCROLL_SLOWER' },
  faster: { action: 'SCROLL_FASTER' }, 'speed up': { action: 'SCROLL_FASTER' },
  stop: { action: 'STOP_SCROLL' }, 'stop scrolling': { action: 'STOP_SCROLL' }, 'stop scroll': { action: 'STOP_SCROLL' }, hold: { action: 'STOP_SCROLL' },

  // scrolling (one page / one item)
  'page down': { action: 'SCROLL_PAGE_DOWN' }, 'page up': { action: 'SCROLL_PAGE_UP' },
  'scroll top': { action: 'SCROLL_TOP' }, top: { action: 'SCROLL_TOP' }, 'top of page': { action: 'SCROLL_TOP' }, 'go to top': { action: 'SCROLL_TOP' },
  'scroll bottom': { action: 'SCROLL_BOTTOM' }, bottom: { action: 'SCROLL_BOTTOM' }, 'bottom of page': { action: 'SCROLL_BOTTOM' }, 'go to bottom': { action: 'SCROLL_BOTTOM' },

  // reels / shorts / feeds
  next: { action: 'NEXT_ITEM' }, 'next reel': { action: 'NEXT_ITEM' }, 'next video': { action: 'NEXT_ITEM' },
  'next short': { action: 'NEXT_ITEM' }, 'next one': { action: 'NEXT_ITEM' }, 'next post': { action: 'NEXT_ITEM' },
  previous: { action: 'PREV_ITEM' }, 'previous reel': { action: 'PREV_ITEM' }, 'previous video': { action: 'PREV_ITEM' },
  'previous short': { action: 'PREV_ITEM' }, 'previous one': { action: 'PREV_ITEM' }, 'last one': { action: 'PREV_ITEM' },

  // media
  play: { action: 'MEDIA_PLAY' }, 'play video': { action: 'MEDIA_PLAY' },
  'pause video': { action: 'MEDIA_PAUSE' }, 'pause playback': { action: 'MEDIA_PAUSE' },
  mute: { action: 'MEDIA_MUTE' }, unmute: { action: 'MEDIA_UNMUTE' },

  // browser
  'go back': { action: 'GO_BACK' }, back: { action: 'GO_BACK' }, 'previous page': { action: 'GO_BACK' }, 'last page': { action: 'GO_BACK' }, 'go to previous page': { action: 'GO_BACK' }, 'go to last page': { action: 'GO_BACK' },
  'next page': { action: 'CLICK_TEXT', payload: 'next' }, search: { action: 'FOCUS_SEARCH' }, 'open search': { action: 'FOCUS_SEARCH' }, 'search box': { action: 'FOCUS_SEARCH' },
  like: { action: 'CLICK_TEXT', payload: 'like' }, subscribe: { action: 'CLICK_TEXT', payload: 'subscribe' }, 'open first result': { action: 'CLICK_TEXT', payload: 'first' },
  'play next': { action: 'NEXT_ITEM' }, 'skip': { action: 'NEXT_ITEM' }, 'skip video': { action: 'NEXT_ITEM' }, 'go down': { action: 'SCROLL_DOWN' }, 'go up': { action: 'SCROLL_UP' }, 'scroll': { action: 'SCROLL_DOWN' }, 'move down': { action: 'SCROLL_DOWN' }, 'move up': { action: 'SCROLL_UP' },
  'full screen': { action: 'FULLSCREEN' }, fullscreen: { action: 'FULLSCREEN' },
  'go forward': { action: 'GO_FORWARD' }, forward: { action: 'GO_FORWARD' },
  refresh: { action: 'REFRESH' }, reload: { action: 'REFRESH' },
  'new tab': { action: 'NEW_TAB' }, 'open new tab': { action: 'NEW_TAB' }, 'close tab': { action: 'CLOSE_TAB' }, 'close this tab': { action: 'CLOSE_TAB' },
  'duplicate tab': { action: 'DUPLICATE_TAB' }, 'new window': { action: 'NEW_WINDOW' }, 'close other tabs': { action: 'CLOSE_OTHER_TABS' },
  'first tab': { action: 'FIRST_TAB' }, 'last tab': { action: 'LAST_TAB' }, 'switch tab': { action: 'NEXT_TAB' }, 'change tab': { action: 'NEXT_TAB' },
  'tab right': { action: 'NEXT_TAB' }, 'tab left': { action: 'PREV_TAB' }, 'go to next tab': { action: 'NEXT_TAB' }, 'go to previous tab': { action: 'PREV_TAB' },
  'search here': { action: 'FOCUS_SEARCH' }, 'focus search': { action: 'FOCUS_SEARCH' }, 'type in search': { action: 'FOCUS_SEARCH' },
  'next tab': { action: 'NEXT_TAB' }, 'previous tab': { action: 'PREV_TAB' }, 'prev tab': { action: 'PREV_TAB' },

  // more natural phrasings
  'scroll downward': { action: 'SCROLL_DOWN' }, 'scroll upward': { action: 'SCROLL_UP' },
  'move page down': { action: 'SCROLL_PAGE_DOWN' }, 'move page up': { action: 'SCROLL_PAGE_UP' },
  'next screen': { action: 'SCROLL_PAGE_DOWN' }, 'previous screen': { action: 'SCROLL_PAGE_UP' },
  'go to the top': { action: 'SCROLL_TOP' }, 'go to the bottom': { action: 'SCROLL_BOTTOM' },
  'move back': { action: 'GO_BACK' }, 'navigate back': { action: 'GO_BACK' }, 'navigate forward': { action: 'GO_FORWARD' },
  'open tab': { action: 'NEW_TAB' }, 'close current tab': { action: 'CLOSE_TAB' },
  'switch to next tab': { action: 'NEXT_TAB' }, 'switch to previous tab': { action: 'PREV_TAB' },
  'start dictation': { action: 'START_TYPING' }, 'start typing here': { action: 'START_TYPING' },

  // hints
  'show hints': { action: 'SHOW_HINTS' }, hints: { action: 'SHOW_HINTS' }, 'show numbers': { action: 'SHOW_HINTS' }, numbers: { action: 'SHOW_HINTS' },
  'hide hints': { action: 'HIDE_HINTS' }, 'cancel hints': { action: 'HIDE_HINTS' },

  // engine
  pause: { action: 'PAUSE' }, sleep: { action: 'PAUSE' }, 'stop listening': { action: 'PAUSE' }, 'pause tracking': { action: 'PAUSE' },
  resume: { action: 'RESUME' }, 'wake up': { action: 'RESUME' }, wake: { action: 'RESUME' }, 'start listening': { action: 'RESUME' }, 'resume tracking': { action: 'RESUME' },
  center: { action: 'CENTER' }, recenter: { action: 'CENTER' }, 'center cursor': { action: 'CENTER' },
  'head mode': { action: 'SET_MODE', payload: 'head' }, 'hand mode': { action: 'SET_MODE', payload: 'hand' },

  // typing
  'start typing': { action: 'START_TYPING' }, dictate: { action: 'START_TYPING' }, dictation: { action: 'START_TYPING' },

  // confirmation of sensitive actions
  yes: { action: 'CONFIRM' }, confirm: { action: 'CONFIRM' }, 'do it': { action: 'CONFIRM' },
  no: { action: 'CANCEL' }, cancel: { action: 'CANCEL' },

  // view
  'zoom in': { action: 'ZOOM_IN' }, 'zoom out': { action: 'ZOOM_OUT' }, 'reset zoom': { action: 'ZOOM_RESET' },
  'what can i say': { action: 'SHOW_HELP' }, help: { action: 'SHOW_HELP' }, commands: { action: 'SHOW_HELP' },
  'close help': { action: 'HIDE_HELP' }, 'hide help': { action: 'HIDE_HELP' }
};

const DICTATION_EXACT: Record<string, string> = {
  'stop typing': 'STOP_TYPING', 'done typing': 'STOP_TYPING', 'exit typing': 'STOP_TYPING', 'stop dictation': 'STOP_TYPING',
  'new line': 'DICTATION_NEWLINE', 'new paragraph': 'DICTATION_NEWPARAGRAPH',
  'delete last word': 'DICTATION_BACKSPACE_WORD', 'delete that': 'DICTATION_BACKSPACE_WORD', backspace: 'DICTATION_BACKSPACE_WORD',
  'clear field': 'DICTATION_CLEAR', 'clear all': 'DICTATION_CLEAR', 'clear text': 'DICTATION_CLEAR',
  'select all': 'DICTATION_SELECT_ALL',
  undo: 'DICTATION_UNDO',
  submit: 'DICTATION_SUBMIT', 'press enter': 'DICTATION_SUBMIT', enter: 'DICTATION_SUBMIT', 'send it': 'DICTATION_SUBMIT'
};

export class CommandParser {
  private wakeWord = '';

  constructor(wakeWord: string = '') {
    this.wakeWord = wakeWord.toLowerCase().trim();
  }

  public setWakeWord(wakeWord: string): void {
    this.wakeWord = (wakeWord || '').toLowerCase().trim();
  }

  private make(action: string, payload: any, text: string, raw: string, exact: boolean, confidence = 1.0): ParsedCommand {
    return { action, payload, confidence, matchedText: text, originalText: raw, exact };
  }

  public parse(rawText: string, isDictating: boolean = false): ParsedCommand | null {
    let text = fixMisheard(normalizeSpeech(rawText));
    if (!text) return null;

    if (this.wakeWord) {
      if (!text.startsWith(this.wakeWord)) return null;
      text = text.substring(this.wakeWord.length).trim();
      if (!text) return null;
    }

    if (!isDictating) {
      // Browser-level search: open a new tab on Google and dictate into it.
      if (/^(?:browser search|search (?:browser|web|internet|google)|new search|open search tab|search in browser|search on web)$/.test(text)) {
        return this.make('BROWSER_SEARCH_OPEN', undefined, text, rawText, true);
      }
      const bs = text.match(/^search\s+(?:in\s+|on\s+)?(?:browser|web|internet)\s+(?:for\s+)?(.+)$/);
      if (bs) return this.make('BROWSER_SEARCH', { query: bs[1].trim(), engine: 'google' }, text, rawText, true);
      // "second tab", "go to third tab", "tab number 2"
      const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 };
      const ord = text.match(/^(?:go to |switch to |open |show )?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\s+tab$/);
      if (ord) return this.make('SWITCH_TAB', ORD[ord[1]], text, rawText, true, 0.95);
      const tabNo = text.match(/^(?:go to |switch to |open |show )?tab\s+(?:number\s+)?(.+)$/);
      if (tabNo) {
        const n = wordsToNumber(tabNo[1], true);
        if (n !== null && n > 0) return this.make('SWITCH_TAB', n, text, rawText, true, 0.95);
      }
    }

    if (isDictating) {
      const d = DICTATION_EXACT[text];
      if (d) return this.make(d, undefined, text, rawText, true);
      const cleaned = applySpokenPunctuation(rawText.trim());
      return this.make('DICTATE_TEXT', cleaned, rawText, rawText, false, 0.95);
    }

    // "open google", "go to youtube", "open example dot com"
    const siteMatch = text.match(/^(?:open|go to|goto|visit|launch)\s+(.+)$/);
    if (siteMatch) {
      const target = siteMatch[1].replace(/\s+dot\s+/g, '.').replace(/\s+/g, '');
      const key = siteMatch[1].trim();
      if (COMMON_SITES[key]) return this.make('NAVIGATE', COMMON_SITES[key], text, rawText, true);
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(target)) {
        return this.make('NAVIGATE', `https://${target}`, text, rawText, true);
      }
    }

    // Browser-level search (whole web / a named site), e.g. "google cats", "search youtube for lofi",
    // "search wikipedia for tigers", "search in new tab cats"
    const ENGINES = 'youtube|wikipedia|maps|amazon|github|google';
    const newTabSearch = text.match(/^(?:search|google|look up)\s+(?:in\s+)?(?:a\s+)?new tab\s+(?:for\s+)?(.+)$/);
    if (newTabSearch) return this.make('BROWSER_SEARCH', { query: newTabSearch[1].trim(), engine: 'google', newTab: true }, text, rawText, true);
    const engineSearch = text.match(new RegExp(`^(?:search|find|look up)\\s+(?:on\\s+|in\\s+)?(${ENGINES})\\s+(?:for\\s+)?(.+)$`));
    if (engineSearch) return this.make('BROWSER_SEARCH', { query: engineSearch[2].trim(), engine: engineSearch[1] }, text, rawText, true);
    const engineSearch2 = text.match(new RegExp(`^(?:search|find)\\s+(.+?)\\s+(?:on|in)\\s+(${ENGINES})$`));
    if (engineSearch2) return this.make('BROWSER_SEARCH', { query: engineSearch2[1].trim(), engine: engineSearch2[2] }, text, rawText, true);
    const google = text.match(/^(?:google|look up|web search)\s+(.+)$/);
    if (google) return this.make('BROWSER_SEARCH', { query: google[1].trim(), engine: 'google' }, text, rawText, true);
    // "search on this site for shoes" / "search site shoes" -> the page's own search box
    const siteSearch = text.match(/^search\s+(?:on\s+)?(?:this\s+)?(?:site|page|here)\s+(?:for\s+)?(.+)$/);
    if (siteSearch) return this.make('SEARCH', siteSearch[1].trim(), text, rawText, true);
    // "search for cats" / "search cats": the site's own box if there is one, else Google
    const search = text.match(/^search(?:\s+for)?\s+(.+)$/);
    if (search) return this.make('SEARCH', search[1].trim(), text, rawText, true);

    // "go to tab youtube", "switch to tab gmail" (by name); numbers are handled below
    const tabName = text.match(/^(?:go to|switch to|open|show)\s+tab\s+(.+)$/);
    if (tabName && wordsToNumber(tabName[1], true) === null) return this.make('FIND_TAB', tabName[1].trim(), text, rawText, true, 0.9);

    // numbered hints: "click 4", "click four", "number 12", "link 3"
    const hint = text.match(/^(?:click|open|number|link|select|tap|press)\s+(.+)$/);
    if (hint) {
      const num = wordsToNumber(hint[1], true);
      if (num !== null) return this.make('CLICK_HINT', num, text, rawText, true, 0.95);
    }

    const typeNum = text.match(/^type\s+(.+)$/);
    if (typeNum) {
      const num = wordsToNumber(typeNum[1], true);
      if (num !== null) return this.make('TYPE_HINT', num, text, rawText, true, 0.95);
    }

    const tab = text.match(/^(?:tab|switch to tab|go to tab|open tab|show tab)\s+(.+)$/);
    if (tab) {
      const num = wordsToNumber(tab[1], true);
      if (num !== null) return this.make('SWITCH_TAB', num, text, rawText, true, 0.95);
    }

    // "scroll down 3 times" is not supported; but "scroll down a bit" is
    if (/^scroll down (a bit|a little)$/.test(text)) return this.make('SCROLL_NUDGE', 'down', text, rawText, true);
    if (/^scroll up (a bit|a little)$/.test(text)) return this.make('SCROLL_NUDGE', 'up', text, rawText, true);

    // Exact phrase
    const hit = EXACT[text];
    if (hit) return this.make(hit.action, hit.payload, text, rawText, true);

    // One-shot typing: "type hello world" or "write hello world"
    const typeText = rawText.trim().match(/^(?:please\s+)?(?:type|write|enter)\s+(.+)$/i);
    if (typeText) {
      return this.make('TYPE_TEXT', applySpokenPunctuation(typeText[1]), text, rawText, true, 0.9);
    }

    // Click something by its visible label: "click sign in", "press submit"
    const byLabel = text.match(/^(?:click|press|tap|select|open)\s+(?:on\s+)?(.{2,})$/);
    if (byLabel) {
      return this.make('CLICK_TEXT', byLabel[1].trim(), text, rawText, true, 0.85);
    }

    // Command buried at the end of a few extra words: "yeah so scroll down" -> "scroll down"
    const words = text.split(' ');
    if (words.length > 1 && words.length <= 6) {
      for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
        const tail = words.slice(-n).join(' ');
        const e = EXACT[tail];
        if (e && (n > 1 || tail.length >= 5)) return this.make(e.action, e.payload, tail, rawText, false, 0.8);
      }
    }

    // Command at the START of the phrase: "scroll down now", "next tab please thanks"
    if (words.length > 1 && words.length <= 6) {
      for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
        const head = words.slice(0, n).join(' ');
        const e = EXACT[head];
        if (e && words.length - n <= 2 && (n > 1 || head.length >= 5)) return this.make(e.action, e.payload, head, rawText, false, 0.75);
      }
    }

    // Fuzzy match to tolerate recognition slips, only for phrases long enough to be unambiguous.
    let best: { cmd: string; score: number } | null = null;
    for (const cmd of Object.keys(EXACT)) {
      if (cmd.length < 4) continue;
      const score = similarity(text, cmd);
      if (score >= 0.8 && (!best || score > best.score)) best = { cmd, score };
    }
    if (best) {
      const e = EXACT[best.cmd];
      return this.make(e.action, e.payload, best.cmd, rawText, false, best.score);
    }

    return null;
  }
}
