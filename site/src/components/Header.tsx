import React from 'react';

export const Header: React.FC = () => (
  <header className="top">
    <div className="wrap">
      <a className="brand" href="#top" aria-label="Handsfree home">
        <span className="mark" aria-hidden="true" />
        Handsfree
      </a>
      <nav aria-label="Sections">
        <a href="#voice">Commands</a>
        <a href="#how">How it works</a>
        <a href="#try">Try it</a>
        <a href="#measure">Measure</a>
        <a href="#install">Install</a>
      </nav>
    </div>
  </header>
);
