import React, { useState } from 'react';

const Code: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <pre className="code">
      <button className="copy" onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }}>{done ? 'Copied' : 'Copy'}</button>
      {text}
    </pre>
  );
};

export const Install: React.FC = () => (
  <section className="block" id="install">
    <div className="wrap">
      <h2>Install it in five minutes</h2>
      <p className="intro">You need Node.js 18 or newer, and Chrome or Edge. The first build downloads two small model files, so be online.</p>
      <div className="steps">
        <div className="step">
          <h3>Build the extension</h3>
          <Code text={'cd extension\nnpm install\nnpm run build'} />
        </div>
        <div className="step">
          <h3>Load it in Chrome or Edge</h3>
          <p>Open <code>chrome://extensions</code>, switch on Developer mode, choose Load unpacked, and pick <code>extension/.output/chrome-mv3</code>.</p>
        </div>
        <div className="step">
          <h3>Run setup</h3>
          <p>The setup page opens by itself. Allow the camera and microphone, then point at the five rings. It takes under a minute.</p>
        </div>
        <div className="step">
          <h3>Open this website (optional)</h3>
          <Code text={'cd site\nnpm install\nnpm run dev'} />
        </div>
      </div>

      <div className="fixes">
        <h3>If something does not work</h3>
        <dl>
          <dt>The pointer never appears</dt>
          <dd>Reload the page. Handsfree cannot run on chrome:// pages, the Chrome Web Store, or the new-tab page.</dd>
          <dt>Setup says the face model is missing</dt>
          <dd>Run <code>npm run setup</code> inside the extension folder while online, rebuild, then reload the extension.</dd>
          <dt>Voice stays on “Starting” or shows an error</dt>
          <dd>Chrome sends speech to Google to transcribe it, so voice needs internet. Allow the microphone on the setup page.</dd>
          <dt>The pointer drifts to one side</dt>
          <dd>Sit as you normally do and say “center”, or press Alt+Shift+C.</dd>
          <dt>It is dim or the face is lost</dt>
          <dd>Face a light. A window behind you makes the camera image too dark to track.</dd>
        </dl>
      </div>
    </div>
  </section>
);
