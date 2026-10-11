import { describe, expect, it } from 'vitest';
import {
  convertNumberWordsToDigits,
  normalizeText,
  parseCommand,
  stripFillerWords,
} from '../commands';

describe('Command Parser - Normalization & Number Conversion', () => {
  it('converts single digits in words to digits', () => {
    expect(convertNumberWordsToDigits('tab three')).toBe('tab 3');
    expect(convertNumberWordsToDigits('click five')).toBe('click 5');
    expect(convertNumberWordsToDigits('open link twelve')).toBe('open link 12');
  });

  it('converts compound numbers to digits', () => {
    expect(convertNumberWordsToDigits('click twenty four')).toBe('click 24');
    expect(convertNumberWordsToDigits('tab ninety nine')).toBe('tab 99');
    expect(convertNumberWordsToDigits('open link one hundred')).toBe('open link 100');
  });

  it('strips conversational filler words cleanly', () => {
    expect(stripFillerWords('please click')).toBe('click');
    expect(stripFillerWords('could you scroll down')).toBe('scroll down');
    expect(stripFillerWords('can you please go back')).toBe('go back');
    expect(stripFillerWords('hey pause')).toBe('pause');
  });

  it('normalizes mixed case, punctuation, and fillers', () => {
    expect(normalizeText('Please Click!!')).toBe('click');
    expect(normalizeText('Could you SCROLL DOWN?')).toBe('scroll down');
    expect(normalizeText('Open Link Twenty Five...')).toBe('open link 25');
  });
});

describe('Command Parser - Full Command Set (At least 40 phrases)', () => {
  // 1-5: Pointer Commands
  it('parses pointer "click"', () => {
    const res = parseCommand('click');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('click');
    expect(res.category).toBe('pointer');
  });

  it('parses pointer "clik" with phonetic/fuzzy matching', () => {
    const res = parseCommand('clik');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('click');
  });

  it('parses pointer "double click"', () => {
    const res = parseCommand('double click');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('double-click');
  });

  it('parses pointer "dubble click" with phonetic tolerance', () => {
    const res = parseCommand('dubble click');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('double-click');
  });

  it('parses pointer "right click"', () => {
    const res = parseCommand('right click');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('right-click');
  });

  it('parses pointer "rite click" with phonetic tolerance', () => {
    const res = parseCommand('rite click');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('right-click');
  });

  it('parses pointer "drag"', () => {
    const res = parseCommand('drag');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('drag');
  });

  it('parses pointer "drop"', () => {
    const res = parseCommand('drop');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('drop');
  });

  // 6-12: Scroll Commands
  it('parses scroll "scroll down"', () => {
    const res = parseCommand('scroll down');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('scroll-down');
    expect(res.category).toBe('scroll');
  });

  it('parses scroll "skroll down" with phonetic spelling', () => {
    const res = parseCommand('skroll down');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('scroll-down');
  });

  it('parses scroll "scroll up"', () => {
    const res = parseCommand('scroll up');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('scroll-up');
  });

  it('parses scroll "page down"', () => {
    const res = parseCommand('page down');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('page-down');
  });

  it('parses scroll "page up"', () => {
    const res = parseCommand('page up');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('page-up');
  });

  it('parses scroll "top"', () => {
    const res = parseCommand('top');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('scroll-top');
  });

  it('parses scroll "bottom"', () => {
    const res = parseCommand('bottom');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('scroll-bottom');
  });

  it('parses scroll "stop"', () => {
    const res = parseCommand('stop');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('scroll-stop');
  });

  it('parses scroll "stop scrolling"', () => {
    const res = parseCommand('stop scrolling');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('scroll-stop');
  });

  // 13-20: Navigation Commands
  it('parses navigation "go back"', () => {
    const res = parseCommand('go back');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('history-back');
  });

  it('parses navigation "go forward"', () => {
    const res = parseCommand('go forward');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('history-forward');
  });

  it('parses navigation "refresh"', () => {
    const res = parseCommand('refresh');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('refresh');
  });

  it('parses navigation "refrish" with fuzzy error', () => {
    const res = parseCommand('refrish');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('refresh');
  });

  it('parses navigation "new tab"', () => {
    const res = parseCommand('new tab');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('new-tab');
  });

  it('parses navigation "close tab"', () => {
    const res = parseCommand('close tab');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('close-tab');
  });

  it('parses navigation "next tab"', () => {
    const res = parseCommand('next tab');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('next-tab');
  });

  it('parses navigation "previous tab"', () => {
    const res = parseCommand('previous tab');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('previous-tab');
  });

  // 21-25: Tab by number
  it('parses navigation "tab 3"', () => {
    const res = parseCommand('tab 3');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('switch-tab');
    expect(res.args?.tabIndex).toBe(3);
  });

  it('parses navigation "tab three" with number word', () => {
    const res = parseCommand('tab three');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('switch-tab');
    expect(res.args?.tabIndex).toBe(3);
  });

  it('parses navigation "tab seven" with number word', () => {
    const res = parseCommand('tab seven');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('switch-tab');
    expect(res.args?.tabIndex).toBe(7);
  });

  // 26-30: Open Site & Search
  it('parses open site "open google"', () => {
    const res = parseCommand('open google');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('open-site');
    expect(res.args?.url).toBe('https://www.google.com');
  });

  it('parses open site "open youtube"', () => {
    const res = parseCommand('open youtube');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('open-site');
    expect(res.args?.url).toBe('https://www.youtube.com');
  });

  it('parses open site "open github"', () => {
    const res = parseCommand('open github');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('open-site');
    expect(res.args?.url).toBe('https://github.com');
  });

  it('parses open site "open wikipedia"', () => {
    const res = parseCommand('open wikipedia');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('open-site');
    expect(res.args?.url).toBe('https://www.wikipedia.org');
  });

  it('parses search "search for cute puppies"', () => {
    const res = parseCommand('search for cute puppies');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('search');
    expect(res.args?.query).toBe('cute puppies');
  });

  // 31-35: Hints
  it('parses hints "show hints"', () => {
    const res = parseCommand('show hints');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('show-hints');
  });

  it('parses hints "hide hints"', () => {
    const res = parseCommand('hide hints');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('hide-hints');
  });

  it('parses hints "click 5"', () => {
    const res = parseCommand('click 5');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('click-hint');
    expect(res.args?.hintNumber).toBe(5);
  });

  it('parses hints "click five" with number word', () => {
    const res = parseCommand('click five');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('click-hint');
    expect(res.args?.hintNumber).toBe(5);
  });

  it('parses hints "open link 12"', () => {
    const res = parseCommand('open link 12');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('open-hint-link');
    expect(res.args?.hintNumber).toBe(12);
  });

  it('parses hints "open link twelve" with number word', () => {
    const res = parseCommand('open link twelve');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('open-hint-link');
    expect(res.args?.hintNumber).toBe(12);
  });

  // 36-47: Modes & Toggles
  it('parses mode "pause"', () => {
    const res = parseCommand('pause');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('pause');
  });

  it('parses mode "pasue" with typo', () => {
    const res = parseCommand('pasue');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('pause');
  });

  it('parses mode "resume"', () => {
    const res = parseCommand('resume');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('resume');
  });

  it('parses mode "wake up"', () => {
    const res = parseCommand('wake up');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('resume');
  });

  it('parses mode "head mode"', () => {
    const res = parseCommand('head mode');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('set-mode-head');
  });

  it('parses mode "hed mode" with phonetic error', () => {
    const res = parseCommand('hed mode');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('set-mode-head');
  });

  it('parses mode "hand mode"', () => {
    const res = parseCommand('hand mode');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('set-mode-hand');
  });

  it('parses mode "eye mode"', () => {
    const res = parseCommand('eye mode');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('set-mode-eye');
  });

  it('parses mode "switch to head mode"', () => {
    const res = parseCommand('switch to head mode');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('set-mode-head');
  });

  it('parses mode "dwell on"', () => {
    const res = parseCommand('dwell on');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('dwell-on');
  });

  it('parses mode "dwell off"', () => {
    const res = parseCommand('dwell off');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('dwell-off');
  });

  it('parses mode "center"', () => {
    const res = parseCommand('center');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('recenter');
  });

  it('parses mode "start typing"', () => {
    const res = parseCommand('start typing');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('start-typing');
  });

  it('parses mode "stop typing"', () => {
    const res = parseCommand('stop typing');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('stop-typing');
  });

  it('parses mode "zoom in"', () => {
    const res = parseCommand('zoom in');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('zoom-in');
  });

  it('parses mode "zoom out"', () => {
    const res = parseCommand('zoom out');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('zoom-out');
  });

  // 48-49: Confirmation
  it('parses confirmation "yes"', () => {
    const res = parseCommand('yes');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('confirm');
  });

  it('parses confirmation "no"', () => {
    const res = parseCommand('no');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('cancel');
  });

  // 50: Help Command
  it('parses help "what can I say"', () => {
    const res = parseCommand('what can I say');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('show-help');
    expect(res.category).toBe('help');
  });
});

describe('Command Parser - Wake Behavior & State Gating', () => {
  it('rejects commands when Paused except pause and resume / wake up ("pause works always")', () => {
    const clickPaused = parseCommand('click', { state: 'Paused' });
    expect(clickPaused.recognized).toBe(false);
    expect(clickPaused.message).toContain('Paused');

    const scrollPaused = parseCommand('scroll down', { state: 'Paused' });
    expect(scrollPaused.recognized).toBe(false);

    // "pause" works always
    const pausePaused = parseCommand('pause', { state: 'Paused' });
    expect(pausePaused.recognized).toBe(true);
    expect(pausePaused.command).toBe('pause');

    const resumePaused = parseCommand('resume', { state: 'Paused' });
    expect(resumePaused.recognized).toBe(true);
    expect(resumePaused.command).toBe('resume');

    const wakeUpPaused = parseCommand('wake up', { state: 'Paused' });
    expect(wakeUpPaused.recognized).toBe(true);
    expect(wakeUpPaused.command).toBe('resume');
  });

  it('handles optional wake word "handsfree" and allows pause always', () => {
    // When wakeWordEnabled is false, "click" works directly
    const directRes = parseCommand('click', { wakeWordEnabled: false });
    expect(directRes.recognized).toBe(true);

    // When wakeWordEnabled is true and wake word is provided
    const withWake = parseCommand('handsfree scroll down', {
      wakeWordEnabled: true,
      wakeWord: 'handsfree',
    });
    expect(withWake.recognized).toBe(true);
    expect(withWake.command).toBe('scroll-down');

    // When wakeWordEnabled is true and wake word is missing
    const missingWake = parseCommand('scroll down', {
      wakeWordEnabled: true,
      wakeWord: 'handsfree',
    });
    expect(missingWake.recognized).toBe(false);
    expect(missingWake.message).toContain("Say 'handsfree' first");

    // "pause" works always even when wake word is enabled without saying wake word first
    const alwaysPause = parseCommand('pause', {
      wakeWordEnabled: true,
      wakeWord: 'handsfree',
    });
    expect(alwaysPause.recognized).toBe(true);
    expect(alwaysPause.command).toBe('pause');

    // "handsfree" wake word alone triggers resume
    const wakeAlone = parseCommand('handsfree', {
      wakeWordEnabled: true,
      wakeWord: 'handsfree',
    });
    expect(wakeAlone.recognized).toBe(true);
    expect(wakeAlone.command).toBe('resume');
  });

  it('parses navigation to common site "open gmail"', () => {
    const res = parseCommand('open gmail');
    expect(res.recognized).toBe(true);
    expect(res.command).toBe('open-site');
    expect(res.args?.url).toBe('https://mail.google.com');
  });

  it('rejects unrecognizable utterances below threshold and shows "Didn\'t catch that"', () => {
    const gibberish1 = parseCommand('banana telephone');
    expect(gibberish1.recognized).toBe(false);
    expect(gibberish1.message).toBe("Didn't catch that");

    const gibberish2 = parseCommand('supercalifragilistic');
    expect(gibberish2.recognized).toBe(false);
    expect(gibberish2.message).toBe("Didn't catch that");

    const gibberish3 = parseCommand('astronomy telescope cosmic');
    expect(gibberish3.recognized).toBe(false);
    expect(gibberish3.message).toBe("Didn't catch that");
  });

  it('parses form submit and press enter commands', () => {
    const submitRes = parseCommand('submit');
    expect(submitRes.recognized).toBe(true);
    expect(submitRes.command).toBe('submit');

    const pressEnterRes = parseCommand('press enter');
    expect(pressEnterRes.recognized).toBe(true);
    expect(pressEnterRes.command).toBe('submit');
  });

  it('filters commands appropriately when state is Dictating', () => {
    // "stop typing" and "submit" are recognized during dictation
    const stopRes = parseCommand('stop typing', { state: 'Dictating' });
    expect(stopRes.recognized).toBe(true);
    expect(stopRes.command).toBe('stop-typing');

    const submitRes = parseCommand('submit', { state: 'Dictating' });
    expect(submitRes.recognized).toBe(true);
    expect(submitRes.command).toBe('submit');

    // General navigation commands (like scroll-down, click) are filtered out so they are not accidentally triggered
    const scrollRes = parseCommand('scroll down', { state: 'Dictating' });
    expect(scrollRes.recognized).toBe(false);
    expect(scrollRes.message).toBe('Dictating');
  });
});
