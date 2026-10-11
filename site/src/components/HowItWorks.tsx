import React from 'react';

export const HowItWorks: React.FC = () => (
  <section className="block" id="how">
    <div className="wrap">
      <h2>How a head turn becomes a click</h2>
      <p className="intro">Everything below runs inside your browser. The only network use is Chrome’s own speech-to-text.</p>
      <div className="how">
        <ol>
          <li>
            <b>The camera finds your face</b>
            <span>A face-landmark model from MediaPipe runs on your computer, about thirty times a second.</span>
          </li>
          <li>
            <b>Two ratios describe where you are facing</b>
            <span>Where your nose sits between your cheeks gives left and right. Where it sits between your eyes and chin gives up and down. Ratios ignore how far you are from the screen.</span>
          </li>
          <li>
            <b>Calibration learns your range</b>
            <span>You point at five rings. Handsfree records how far you actually move, so a small turn can reach the whole screen.</span>
          </li>
          <li>
            <b>A filter removes the shake</b>
            <span>The One Euro filter smooths tiny tremors when you are still and stays quick when you move on purpose.</span>
          </li>
          <li>
            <b>Resting on a button presses it</b>
            <span>A ring fills for about a second. Risky words like “pay” or “delete” ask for a spoken “yes” first.</span>
          </li>
        </ol>

        <div className="diagram">
          <svg viewBox="0 0 440 330" role="img" aria-label="Pipeline from webcam and microphone to pointer and commands">
            <g fontFamily="Public Sans, sans-serif" fontSize="14" fontWeight="600" fill="#131a2a">
              <rect x="10" y="20" width="120" height="48" rx="8" fill="#fff" stroke="#131a2a" strokeWidth="2.5" />
              <text x="70" y="49" textAnchor="middle">Webcam</text>
              <rect x="160" y="20" width="120" height="48" rx="8" fill="#fff" stroke="#131a2a" strokeWidth="2.5" />
              <text x="220" y="49" textAnchor="middle">Face landmarks</text>
              <rect x="310" y="20" width="120" height="48" rx="8" fill="#fff" stroke="#131a2a" strokeWidth="2.5" />
              <text x="370" y="49" textAnchor="middle">Two ratios</text>
              <path d="M130 44h27M280 44h27" stroke="#131a2a" strokeWidth="2.5" markerEnd="url(#a)" />

              <rect x="310" y="110" width="120" height="48" rx="8" fill="#ffd60a" stroke="#131a2a" strokeWidth="2.5" />
              <text x="370" y="139" textAnchor="middle">Your range</text>
              <path d="M370 68v42" stroke="#131a2a" strokeWidth="2.5" markerEnd="url(#a)" />
              <rect x="160" y="110" width="120" height="48" rx="8" fill="#fff" stroke="#131a2a" strokeWidth="2.5" />
              <text x="220" y="139" textAnchor="middle">Smoothing</text>
              <path d="M310 134h-27" stroke="#131a2a" strokeWidth="2.5" markerEnd="url(#a)" />
              <rect x="10" y="110" width="120" height="48" rx="8" fill="#2540e8" stroke="#131a2a" strokeWidth="2.5" />
              <text x="70" y="139" textAnchor="middle" fill="#fff">Pointer</text>
              <path d="M160 134h-27" stroke="#131a2a" strokeWidth="2.5" markerEnd="url(#a)" />

              <rect x="10" y="220" width="120" height="48" rx="8" fill="#fff" stroke="#131a2a" strokeWidth="2.5" />
              <text x="70" y="249" textAnchor="middle">Microphone</text>
              <rect x="160" y="220" width="120" height="48" rx="8" fill="#fff" stroke="#131a2a" strokeWidth="2.5" />
              <text x="220" y="249" textAnchor="middle">Speech to text</text>
              <rect x="310" y="220" width="120" height="48" rx="8" fill="#fff" stroke="#131a2a" strokeWidth="2.5" />
              <text x="370" y="249" textAnchor="middle">Command match</text>
              <path d="M130 244h27M280 244h27" stroke="#131a2a" strokeWidth="2.5" markerEnd="url(#a)" />

              <rect x="160" y="290" width="270" height="34" rx="8" fill="#ffd60a" stroke="#131a2a" strokeWidth="2.5" />
              <text x="295" y="312" textAnchor="middle">Click, scroll, type, navigate</text>
              <path d="M370 268v22" stroke="#131a2a" strokeWidth="2.5" markerEnd="url(#a)" />
              <path d="M70 158v62" stroke="#131a2a" strokeWidth="2.5" strokeDasharray="5 5" />
              <text x="78" y="196" fontSize="12" fontWeight="500">point, then speak</text>
            </g>
            <defs>
              <marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="#131a2a" />
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  </section>
);
