import { EngineStatus, TrackingMode } from '../shared/messages';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const toggleBtn = $<HTMLButtonElement>('toggleEngineBtn');
const modeBtns = document.querySelectorAll<HTMLButtonElement>('.mode-btn');

let running = false;
let mode: TrackingMode = 'head';

function pill(el: HTMLElement, kind: 'ok' | 'bad' | 'wait' | '') {
  el.className = `pill ${kind}`.trim();
}

function render(s: EngineStatus) {
  running = s.running;
  mode = s.mode;

  const badge = $('statusBadge');
  if (!s.running) {
    pill(badge, '');
    $('statusText').textContent = 'Off';
    toggleBtn.textContent = 'Start Handsfree';
    toggleBtn.className = 'btn primary wide';
  } else {
    pill(badge, s.asleep ? 'wait' : 'ok');
    $('statusText').textContent = s.asleep ? 'Sleeping' : 'On';
    toggleBtn.textContent = 'Stop Handsfree';
    toggleBtn.className = 'btn danger wide';
  }

  if (!s.running) {
    pill($('camPill'), '');
    $('camText').textContent = 'Off';
    pill($('micPill'), '');
    $('micText').textContent = 'Off';
  } else {
    pill($('camPill'), s.cameraActive ? (s.modelReady ? 'ok' : 'wait') : 'bad');
    $('camText').textContent = !s.cameraActive ? 'No access' : s.modelReady ? `${s.fps || 0} fps` : 'Loading model';
    pill($('micPill'), s.micActive && !s.voiceError ? 'ok' : s.voiceError ? 'bad' : 'wait');
    $('micText').textContent = s.voiceError ? 'Problem' : s.micActive ? 'Listening' : 'Starting';
  }

  const problem = s.running ? s.error || s.voiceError : '';
  const box = $('problem');
  box.hidden = !problem;
  box.textContent = problem || '';
  box.style.marginBottom = problem ? '12px' : '0';

  if (s.speechTranscript) $('transcriptText').textContent = `“${s.speechTranscript}”`;
  modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
}

function refresh() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res) render(res);
  });
}

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg.type === 'ENGINE_STATUS') render(msg);
  else if (msg.type === 'SPEECH_RESULT') $('transcriptText').textContent = `“${msg.text}”`;
});

toggleBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: running ? 'STOP_ENGINE' : 'START_ENGINE', mode }, () => refresh());
});

modeBtns.forEach((b) =>
  b.addEventListener('click', () => {
    const m = b.dataset.mode as TrackingMode;
    chrome.runtime.sendMessage({ type: 'SET_MODE', mode: m }, () => refresh());
  })
);

$('calibrateBtn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') }));
$('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

refresh();
