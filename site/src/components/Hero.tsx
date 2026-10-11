import React, { useState } from 'react';
import { Dwell } from './Dwell';

const REELS = [
  { bg: '#ffd60a', title: 'Cooking in 30 seconds' },
  { bg: '#9fb4ff', title: 'Street piano, Mumbai' },
  { bg: '#9de3c1', title: 'Five-minute desk stretch' },
  { bg: '#ffb4a8', title: 'Monsoon timelapse' }
];

export const Hero: React.FC = () => {
  const [i, setI] = useState(0);
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState('');
  const reel = REELS[i % REELS.length];

  return (
    <section className="hero" id="top">
      <div className="wrap">
        <div>
          <h1>Browse with your head and your voice.</h1>
          <p className="lede">
            Handsfree is a browser extension. Turn your head and the pointer follows. Rest it on a button and it presses. Say
            “scroll down”, “next reel” or “click sign in” for everything else. It needs a webcam and a microphone, nothing more.
          </p>
          <div className="actions">
            <a className="btn primary" href="#install">Install the extension</a>
            <a className="btn" href="#try">Try the controls</a>
          </div>
          <p className="fine">Video and audio stay on your computer. Chrome or Edge on desktop.</p>
        </div>

        <div className="stage" aria-label="Interactive demo">
          <p className="hint">Rest your mouse on a button for one second. It presses itself, like Handsfree does.</p>
          <div className="reel" style={{ background: reel.bg }}>
            {`Reel ${(i % REELS.length) + 1}`}
            <small>{reel.title}</small>
            <span className="heart">{liked[i % REELS.length] ? 'Liked' : ''}{saved[i % REELS.length] ? ' · Saved' : ''}</span>
          </div>
          <div className="targets">
            <Dwell active={!!liked[i % REELS.length]} onActivate={() => { setLiked((l) => ({ ...l, [i % REELS.length]: !l[i % REELS.length] })); setNote('Liked'); }}>Like</Dwell>
            <Dwell onActivate={() => { setI((n) => n + 1); setNote('Next reel'); }}>Next</Dwell>
            <Dwell active={!!saved[i % REELS.length]} onActivate={() => { setSaved((l) => ({ ...l, [i % REELS.length]: !l[i % REELS.length] })); setNote('Saved'); }}>Save</Dwell>
          </div>
          <p className="stage-note" aria-live="polite">{note}</p>
        </div>
      </div>
    </section>
  );
};
