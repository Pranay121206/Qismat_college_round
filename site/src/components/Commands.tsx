import React from 'react';

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Point and click',
    rows: [
      ['rest on a button', 'Presses after about a second. Resting on plain text never clicks.'],
      ['click', 'Clicks where the pointer is. Also “double click” and “right click”.'],
      ['click sign in', 'Finds a button or link by its label and clicks it.'],
      ['show hints, click 4', 'Numbers every link on screen. Say the number to press it.'],
      ['center', 'Treat the way you sit right now as the middle.']
    ]
  },
  {
    title: 'Scroll, reels and video',
    rows: [
      ['scroll down', 'Smooth scroll under the pointer. Add “slowly” or “fast”.'],
      ['slower, faster, stop', 'Adjust or stop while it is moving.'],
      ['next, previous', 'Move one reel, short or post at a time.'],
      ['page down, top, bottom', 'Jump a screen, or to either end.'],
      ['pause video, play video, mute', 'Controls the video on the page.']
    ]
  },
  {
    title: 'Gestures (no voice needed)',
    rows: [
      ['pinch (hand mode)', 'Click where the pointer is.'],
      ['open mouth for 0.3s (head mode)', 'Click. The pointer freezes while your mouth is open.'],
      ['swipe open palm left / right', 'Previous / next browser tab.'],
      ['tilt head left / right and hold', 'Previous / next browser tab.'],
      ['swipe open palm up / down', 'Page up / page down.'],
      ['thumbs up (hold)', 'Search this website: focuses its search box and starts dictation.'],
      ['thumbs down (hold)', 'Go back one page.'],
      ['raise both eyebrows (hold)', 'Browser search: opens Google in a new tab and starts dictation.'],
      ['peace sign, raise or lower hand', 'Scroll up or down. Drop the sign to stop.']
    ]
  },
  {
    title: 'Type',
    rows: [
      ['type hello world', 'Types into the field you are pointing at.'],
      ['start typing', 'Keeps dictating. Say “comma”, “full stop”, “new line”.'],
      ['delete last word, clear field', 'Edit while dictating.'],
      ['stop typing', 'Return to commands.']
    ]
  },
  {
    title: 'Browse',
    rows: [
      ['search for monsoon recipes', 'Opens a web search.'],
      ['go to youtube', 'Opens a site by name, or any address like “example dot com”.'],
      ['go back, refresh, new tab', 'Browser controls.'],
      ['tab 2, next tab, close tab', 'Switch and close tabs. Also “first tab”, “last tab”, “duplicate tab”, “close other tabs”.'],
      ['go to tab youtube', 'Jumps to an open tab by its title or address.'],
      ['google cats, search youtube for lofi', 'Browser-level search: Google, YouTube, Wikipedia, Maps, Amazon, GitHub.'],
      ['search in new tab weather', 'Runs the search in a fresh tab.'],
      ['search browser / browser search', 'Opens Google in a new tab, then dictate your query and say “submit”.'],
      ['second tab, tab number 3', 'Jump to a tab by position.'],
      ['search on this site for shoes', 'Uses the website’s own search box.'],
      ['sleep, wake up', 'Pause and resume listening and tracking.']
    ]
  }
];

export const Commands: React.FC = () => (
  <section className="block white" id="voice">
    <div className="wrap">
      <h2>Say what you want to happen</h2>
      <p className="intro">
        Commands are short and forgiving. Handsfree matches close misspellings, accepts “for” when you meant “four”, and
        acts on simple commands before you finish the sentence. Say “help” on any page to see this list.
      </p>
      <div className="cmd-grid">
        {GROUPS.map((g) => (
          <div className="cmd-group" key={g.title}>
            <h3>{g.title}</h3>
            {g.rows.map(([say, does]) => (
              <div className="cmd" key={say}>
                <b>{say}</b>
                <span>{does}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </section>
);
