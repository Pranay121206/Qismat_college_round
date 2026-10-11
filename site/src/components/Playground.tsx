import React, { useMemo, useState } from 'react';
import { Dwell } from './Dwell';

const PLACES = ['Gateway of India', 'Marine Drive', 'Elephanta Caves', 'Sanjay Gandhi National Park', 'Juhu Beach', 'Chhatrapati Shivaji Terminus', 'Haji Ali Dargah', 'Bandra Bandstand'];

export const Playground: React.FC = () => {
  const [count, setCount] = useState(0);
  const [on, setOn] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);

  const shown = useMemo(() => PLACES.filter((p) => p.toLowerCase().includes(q.toLowerCase())), [q]);

  return (
    <section className="block" id="try">
      <div className="wrap">
        <h2>Try the controls on a safe page</h2>
        <p className="intro">
          With the extension running, point at these with your head. Without it, your mouse works the same way: rest on a
          button and it presses.
        </p>
        <div className="lab">
          <div className="panel">
            <h3>Press things</h3>
            <p className="sub">Rest on a button for one second.</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <Dwell className="btn" onActivate={() => setCount((c) => c + 1)}>Pressed {count} times</Dwell>
              <Dwell className="btn" active={on} onActivate={() => setOn((v) => !v)}>{on ? 'Switch is on' : 'Switch is off'}</Dwell>
            </div>
          </div>

          <div className="panel">
            <h3>Find a place</h3>
            <p className="sub">Say “click search”, then “type marine”.</p>
            <div className="field">
              <label htmlFor="q">Search places</label>
              <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing" />
            </div>
            <ul className="list" aria-live="polite">
              {shown.length ? shown.map((p) => <li key={p}>{p}</li>) : <li>No match</li>}
            </ul>
          </div>

          <div className="panel">
            <h3>Fill a form</h3>
            <p className="sub">Say “start typing” in a field, then “stop typing”.</p>
            <div className="field">
              <label htmlFor="n">Name</label>
              <input id="n" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="e">Email</label>
              <input id="e" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="m">Message</label>
              <textarea id="m" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <button className="btn primary sm" onClick={() => setSent(true)}>Send message</button>
            <p className={`status${sent ? ' ok' : ''}`} aria-live="polite">{sent ? 'Nothing was sent. This is a practice form.' : ''}</p>
          </div>
        </div>
      </div>
    </section>
  );
};
