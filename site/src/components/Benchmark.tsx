import React, { useEffect, useRef, useState } from 'react';

type Task = 'iso' | 'form' | 'dictation';

interface Result {
  task: string;
  condition: string;
  seconds: number;
  throughput: string;
  wrongTarget: number;
  strayClicks: number;
  time: string;
}

const N = 9;
const RADIUS = 132; // ring radius in px
const TARGET = 52; // target diameter in px
const SENTENCE = 'Handsfree lets me browse with a webcam and my voice, without touching a mouse or keyboard.';
const CONDITIONS = ['Mouse and keyboard', 'Handsfree head tracking', 'Handsfree hand tracking', 'Handsfree head and voice'];

export const Benchmark: React.FC = () => {
  const [task, setTask] = useState<Task>('iso');
  const [condition, setCondition] = useState(CONDITIONS[1]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<Result[]>([]);

  const start = useRef(0);
  const [hits, setHits] = useState(0);
  const [next, setNext] = useState(0);
  const wrong = useRef(0);
  const stray = useRef(0);
  const [typed, setTyped] = useState('');
  const [form, setForm] = useState({ name: '', email: '' });

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((performance.now() - start.current) / 1000), 50);
    return () => window.clearInterval(id);
  }, [running]);

  const begin = () => {
    start.current = performance.now();
    wrong.current = 0;
    stray.current = 0;
    setElapsed(0);
    setHits(0);
    setNext(0);
    setTyped('');
    setForm({ name: '', email: '' });
    setRunning(true);
  };

  const add = (r: Omit<Result, 'condition' | 'time'>) =>
    setResults((prev) => [{ ...r, condition, time: new Date().toLocaleTimeString() }, ...prev]);

  const finishIso = () => {
    const sec = (performance.now() - start.current) / 1000;
    // Fitts' index of difficulty for this layout, then throughput = bits moved per second.
    const id = Math.log2((2 * RADIUS * 2) / TARGET + 1);
    add({ task: 'Pointing (9 targets)', seconds: +sec.toFixed(2), throughput: `${((id * N) / sec).toFixed(2)} bits/s`, wrongTarget: wrong.current, strayClicks: stray.current });
    setRunning(false);
  };

  const hit = (i: number) => {
    if (!running) return;
    if (i !== next) {
      wrong.current++;
      return;
    }
    const h = hits + 1;
    setHits(h);
    setNext((next + 4) % N);
    if (h >= N) finishIso();
  };

  const finishForm = () => {
    if (!form.name || !form.email) return;
    const sec = (performance.now() - start.current) / 1000;
    add({ task: 'Fill a form', seconds: +sec.toFixed(2), throughput: `${((form.name.length + form.email.length) / sec).toFixed(1)} chars/s`, wrongTarget: 0, strayClicks: stray.current });
    setRunning(false);
  };

  const finishDictation = () => {
    const sec = (performance.now() - start.current) / 1000;
    const words = SENTENCE.split(' ').length;
    const a = typed.trim().split(/\s+/);
    const b = SENTENCE.split(' ');
    const wrongWords = b.filter((w, i) => (a[i] || '').toLowerCase().replace(/[.,]/g, '') !== w.toLowerCase().replace(/[.,]/g, '')).length;
    add({ task: 'Dictate a sentence', seconds: +sec.toFixed(2), throughput: `${((words / sec) * 60).toFixed(0)} words/min`, wrongTarget: wrongWords, strayClicks: stray.current });
    setRunning(false);
  };

  const exportCsv = () => {
    const head = ['task', 'condition', 'seconds', 'throughput', 'wrong_target_or_word', 'stray_clicks', 'time'];
    const rows = results.map((r) => [r.task, r.condition, r.seconds, r.throughput, r.wrongTarget, r.strayClicks, r.time].map((v) => `"${v}"`).join(','));
    const blob = new Blob([[head.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'handsfree-benchmark-results.csv';
    a.click();
  };

  const pick = (t: Task) => {
    setTask(t);
    setRunning(false);
  };

  return (
    <section className="block white" id="measure">
      <div className="wrap">
        <h2>Measure it against a mouse</h2>
        <p className="intro">
          Run the same task with each input method. Time, throughput, wrong selections and stray clicks are logged here, in
          your browser, and can be saved as a CSV. Nothing below is pre-filled: every row is a run you did.
        </p>

        <div className="bench-bar">
          <div className="field">
            <label htmlFor="cond">Input method</label>
            <select id="cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="tabs" role="group" aria-label="Task">
            <button aria-pressed={task === 'iso'} onClick={() => pick('iso')}>Pointing</button>
            <button aria-pressed={task === 'form'} onClick={() => pick('form')}>Form</button>
            <button aria-pressed={task === 'dictation'} onClick={() => pick('dictation')}>Dictation</button>
          </div>
          <button className="btn primary" onClick={begin} disabled={running}>{running ? 'Running…' : 'Start a run'}</button>
          <span className="timer" aria-live="off">{elapsed.toFixed(1)}s</span>
        </div>

        <div className="bench-grid">
          <div
            onClick={(e) => {
              if (running && task === 'iso' && (e.target as HTMLElement).tagName !== 'BUTTON') stray.current++;
            }}
          >
            {task === 'iso' && (
              <div className="iso" aria-label="Nine targets in a ring">
                {Array.from({ length: N }, (_, i) => {
                  const a = (i / N) * Math.PI * 2 - Math.PI / 2;
                  const x = 170 + Math.cos(a) * RADIUS;
                  const y = 170 + Math.sin(a) * RADIUS;
                  return (
                    <button key={i} className={running && i === next ? 'next' : ''} style={{ left: x, top: y }} onClick={() => hit(i)} aria-label={`Target ${i + 1}`}>
                      {running && i === next ? '●' : ''}
                    </button>
                  );
                })}
                <div className="center">{running ? `${hits} of ${N} done. Press the yellow one.` : 'Press Start, then the yellow targets in turn.'}</div>
              </div>
            )}

            {task === 'form' && (
              <div className="panel">
                <p className="sub">Fill both fields, then send.</p>
                <div className="field"><label htmlFor="bn">Name</label><input id="bn" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!running} /></div>
                <div className="field"><label htmlFor="be">Email</label><input id="be" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!running} /></div>
                <button className="btn primary sm" onClick={finishForm} disabled={!running}>Send</button>
              </div>
            )}

            {task === 'dictation' && (
              <div className="panel">
                <p className="sub">Say or type this sentence:</p>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>{SENTENCE}</p>
                <textarea aria-label="Your sentence" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!running} />
                <div style={{ marginTop: 12 }}><button className="btn primary sm" onClick={finishDictation} disabled={!running}>Done</button></div>
              </div>
            )}
          </div>

          <div>
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: '1.2rem' }}>Your runs</h3>
              <button className="btn sm" onClick={exportCsv} disabled={!results.length}>Save as CSV</button>
            </div>
            {results.length ? (
              <div className="scroll-x">
                <table className="res">
                  <thead><tr><th>Task</th><th>Input</th><th>Time</th><th>Speed</th><th>Wrong</th><th>Stray</th></tr></thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}><td>{r.task}</td><td>{r.condition}</td><td>{r.seconds}s</td><td>{r.throughput}</td><td>{r.wrongTarget}</td><td>{r.strayClicks}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">No runs yet. Pick an input method and start one.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
