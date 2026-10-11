import { describe, it, expect } from 'vitest';
import { CommandParser, wordsToNumber, similarity, normalizeSpeech, applySpokenPunctuation } from '../src/background/commands';

describe('normalizeSpeech', () => {
  it('strips punctuation and conversational fillers', () => {
    expect(normalizeSpeech('Please, scroll down!')).toBe('scroll down');
    expect(normalizeSpeech('Hey, could you click?')).toBe('click');
    expect(normalizeSpeech('Uh, go back please.')).toBe('go back');
  });
});

describe('wordsToNumber', () => {
  it('converts digit strings to numbers', () => {
    expect(wordsToNumber('5')).toBe(5);
    expect(wordsToNumber('12')).toBe(12);
  });

  it('converts word numbers to integers', () => {
    expect(wordsToNumber('one')).toBe(1);
    expect(wordsToNumber('seven')).toBe(7);
    expect(wordsToNumber('twenty')).toBe(20);
    expect(wordsToNumber('twenty five')).toBe(25);
  });
});

describe('similarity', () => {
  it('measures Levenshtein similarity', () => {
    expect(similarity('click', 'click')).toBe(1.0);
    expect(similarity('click', 'clik')).toBeGreaterThan(0.7);
    expect(similarity('apple', 'banana')).toBeLessThan(0.3);
  });
});

describe('CommandParser', () => {
  const parser = new CommandParser();

  it('parses basic pointer commands', () => {
    expect(parser.parse('click')?.action).toBe('CLICK');
    expect(parser.parse('double click')?.action).toBe('DOUBLE_CLICK');
    expect(parser.parse('right click')?.action).toBe('RIGHT_CLICK');
  });

  it('parses scrolling commands', () => {
    expect(parser.parse('scroll down')?.action).toBe('SCROLL_DOWN');
    expect(parser.parse('scroll up')?.action).toBe('SCROLL_UP');
    expect(parser.parse('page down')?.action).toBe('SCROLL_PAGE_DOWN');
    expect(parser.parse('stop scrolling')?.action).toBe('STOP_SCROLL');
    expect(parser.parse('top of page')?.action).toBe('SCROLL_TOP');
  });

  it('parses navigation commands', () => {
    expect(parser.parse('go back')?.action).toBe('GO_BACK');
    expect(parser.parse('go forward')?.action).toBe('GO_FORWARD');
    expect(parser.parse('refresh')?.action).toBe('REFRESH');
    expect(parser.parse('new tab')?.action).toBe('NEW_TAB');
    expect(parser.parse('close tab')?.action).toBe('CLOSE_TAB');
    expect(parser.parse('next tab')?.action).toBe('NEXT_TAB');
  });

  it('parses open site shortcuts', () => {
    const google = parser.parse('open google');
    expect(google?.action).toBe('NAVIGATE');
    expect(google?.payload).toBe('https://www.google.com');

    const wiki = parser.parse('open wikipedia');
    expect(wiki?.action).toBe('NAVIGATE');
    expect(wiki?.payload).toBe('https://www.wikipedia.org');
  });

  it('parses search queries', () => {
    const search = parser.parse('search for accessibility technology');
    expect(search?.action).toBe('SEARCH');
    expect(search?.payload).toBe('accessibility technology');
  });

  it('parses hint commands with numbers or words', () => {
    const hintNum = parser.parse('click 15');
    expect(hintNum?.action).toBe('CLICK_HINT');
    expect(hintNum?.payload).toBe(15);

    const hintWords = parser.parse('click four');
    expect(hintWords?.action).toBe('CLICK_HINT');
    expect(hintWords?.payload).toBe(4);

    expect(parser.parse('show hints')?.action).toBe('SHOW_HINTS');
    expect(parser.parse('hide hints')?.action).toBe('HIDE_HINTS');
  });

  it('parses state & mode commands', () => {
    expect(parser.parse('pause')?.action).toBe('PAUSE');
    expect(parser.parse('resume')?.action).toBe('RESUME');
    expect(parser.parse('center')?.action).toBe('CENTER');
    expect(parser.parse('head mode')?.action).toBe('SET_MODE');
    expect(parser.parse('hand mode')?.payload).toBe('hand');
  });

  it('tolerates minor speech recognition mispronunciations via fuzzy matching', () => {
    // "clik" -> "click"
    expect(parser.parse('clik')?.action).toBe('CLICK');
    // "scrol down" -> "scroll down"
    expect(parser.parse('scrol down')?.action).toBe('SCROLL_DOWN');
    // "pauze" -> "pause"
    expect(parser.parse('pauze')?.action).toBe('PAUSE');
  });

  it('supports dictation mode specifically', () => {
    expect(parser.parse('new line', true)?.action).toBe('DICTATION_NEWLINE');
    expect(parser.parse('delete last word', true)?.action).toBe('DICTATION_BACKSPACE_WORD');
    expect(parser.parse('clear field', true)?.action).toBe('DICTATION_CLEAR');
    expect(parser.parse('stop typing', true)?.action).toBe('STOP_TYPING');
    expect(parser.parse('hello world', true)?.action).toBe('DICTATE_TEXT');
  });
});

describe('new voice behaviours', () => {
  const parser = new CommandParser();

  it('understands slow scrolling and feed navigation', () => {
    expect(parser.parse('scroll down slowly')?.payload).toEqual({ speed: 'slow' });
    expect(parser.parse('slower')?.action).toBe('SCROLL_SLOWER');
    expect(parser.parse('next reel')?.action).toBe('NEXT_ITEM');
    expect(parser.parse('previous video')?.action).toBe('PREV_ITEM');
  });

  it('clicks by visible label', () => {
    const r = parser.parse('click sign in');
    expect(r?.action).toBe('CLICK_TEXT');
    expect(r?.payload).toBe('sign in');
  });

  it('accepts homophones for hint numbers', () => {
    expect(parser.parse('click for')?.payload).toBe(4);
  });

  it('opens bare domains and one-shot typing', () => {
    expect(parser.parse('go to example dot com')?.payload).toBe('https://example.com');
    expect(parser.parse('type hello world')?.action).toBe('TYPE_TEXT');
  });

  it('spoken punctuation', () => {
    expect(applySpokenPunctuation('hello comma world full stop')).toBe('hello, world.');
  });

  it('does not fuzzy-match very short words', () => {
    expect(parser.parse('uh')).toBeNull();
    expect(parser.parse('banana')).toBeNull();
  });

  it('media commands', () => {
    expect(parser.parse('pause video')?.action).toBe('MEDIA_PAUSE');
    expect(parser.parse('mute')?.action).toBe('MEDIA_MUTE');
  });
});
