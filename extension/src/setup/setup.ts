import { loadSettings, saveSettings, HandsfreeSettings } from '../shared/settings';
import { computeCalibration, mapHead, medianPoint, smoothingToParams, toScreen, Vec2 } from '../shared/mapper';
import { OneEuroPointFilter } from '../shared/oneEuro';
import { playClickSound, playSuccessSound } from '../shared/sound';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const startTime = Date.now();
const timerEl = $('elapsedTimer');
const timerInterval = setInterval(() => (timerEl.textContent = `${((Date.now() - startTime) / 1000).toFixed(1)}s`), 100);

let settings: HandsfreeSettings;
let previewStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let meterRaf = 0;

// latest tracking sample from the offscreen pipeline
let latest: { x: number; y: number; at: number; lost: boolean } | null = null;
let sampleSink: ((p: Vec2) => void) | null = null;

function setPill(el: HTMLElement, kind: 'ok' | 'bad' | 'wait' | '', text: string) {
  el.className = `pill ${kind}`.trim();
  el.innerHTML = `<span class="d"></span>${text}`;
}

function showStep(n: number) {
  [1, 2, 3].forEach((i) => {
    $(`step${i}`).classList.toggle('on', i === n);
  });
  document.querySelectorAll<HTMLElement>('#steps li').forEach((li) => {
    const s = Number(li.dataset.step);
    li.classList.toggle('on', s === n);
    li.classList.toggle('done', s < n);
  });
}

// ---- messages from the engine ---------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg.type === 'POSE_FRAME') {
    if (msg.mode !== 'head') return;
    if (msg.faceLost) {
      latest = { x: 0, y: 0, at: performance.now(), lost: true };
      setPill($('facePill'), 'bad', 'Face not visible');
      return;
    }
    latest = { x: msg.rawX, y: msg.rawY, at: performance.now(), lost: false };
    setPill($('facePill'), 'ok', 'Face found');
    sampleSink?.({ x: msg.rawX, y: msg.rawY });
    onTestPose();
  } else if (msg.type === 'ENGINE_STATUS' || msg.type === 'OFFSCREEN_STATUS') {
    const err = msg.error as string | undefined;
    const verr = msg.voiceError as string | undefined;
    $('engineNote').textContent = err || (msg.modelReady === false && msg.cameraActive ? 'Loading face model…' : '');
    const w = $('voiceWarn');
    w.hidden = !verr;
    w.textContent = verr || '';
    if (err) {
      const n = $('calibError');
      n.hidden = false;
      n.textContent = err;
    }
  } else if (msg.type === 'SPEECH_RESULT') {
    $('heardText').textContent = `“${msg.text}”`;
  }
});

// ---- step 1: permissions --------------------------------------------------------------------

async function checkModel() {
  const pill = $('modelPill');
  try {
    const res = await fetch(chrome.runtime.getURL('models/face_landmarker.task'), { method: 'HEAD' });
    if (!res.ok) throw new Error('missing');
    setPill(pill, 'ok', 'Present');
  } catch {
    setPill(pill, 'bad', 'Missing');
    $('modelWarn').hidden = false;
  }
}
void checkModel();

function updateMeter(analyser: AnalyserNode) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  const loop = () => {
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    $('micMeterFill').style.width = `${Math.min(100, Math.round((avg / 90) * 100))}%`;
    meterRaf = requestAnimationFrame(loop);
  };
  loop();
}

$('requestPermsBtn').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('requestPermsBtn');
  btn.disabled = true;
  btn.textContent = 'Waiting for your permission…';
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const video = $<HTMLVideoElement>('webcamPreview');
    video.srcObject = previewStream;
    video.hidden = false;
    $('previewText').hidden = true;
    await video.play().catch(() => {});

    audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(previewStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser);
    updateMeter(analyser);

    setPill($('camPill'), 'ok', 'Allowed');
    setPill($('micPill'), 'ok', 'Allowed');
    $('micStatusText').textContent = 'Speak and the bar should move.';
    btn.hidden = true;
    $('step1NextBtn').hidden = false;
    playSuccessSound();
  } catch (err: any) {
    btn.disabled = false;
    btn.textContent = 'Try again';
    setPill($('camPill'), 'bad', 'Blocked');
    setPill($('micPill'), 'bad', 'Blocked');
    $('micStatusText').textContent =
      'Permission was blocked. Click the camera icon in the address bar, choose Allow, then try again.';
  }
});

$('step1NextBtn').addEventListener('click', async () => {
  // free the preview camera so the engine has it to itself
  cancelAnimationFrame(meterRaf);
  previewStream?.getTracks().forEach((t) => t.stop());
  previewStream = null;
  void audioCtx?.close();
  settings = await loadSettings();
  showStep(2);
  setPill($('facePill'), 'wait', 'Starting camera');
  chrome.runtime.sendMessage({ type: 'START_ENGINE', mode: 'head' }).catch(() => {});
});

// ---- step 2: calibration --------------------------------------------------------------------

const stage = $('stage');
const ring = $('targetRing');
const instruct = $('calibInstruct');
const sub = $('calibSub');

const TARGETS = [
  { key: 'center', text: 'Look straight at the middle', x: 50, y: 50 },
  { key: 'left', text: 'Turn your head to point at the left ring', x: 7.5, y: 50 },
  { key: 'right', text: 'Turn your head to point at the right ring', x: 92.5, y: 50 },
  { key: 'up', text: 'Tilt your head up to the top ring', x: 50, y: 9 },
  { key: 'down', text: 'Tilt your head down to the bottom ring', x: 50, y: 91 }
] as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function collect(ms: number): Promise<Vec2[]> {
  const samples: Vec2[] = [];
  sampleSink = (p) => samples.push(p);
  await wait(ms);
  sampleSink = null;
  return samples;
}

async function runCalibration() {
  $('startCalibBtn').hidden = true;
  $('step2NextBtn').hidden = true;
  $('calibError').hidden = true;

  // wait for a face
  instruct.textContent = 'Looking for your face…';
  const t0 = performance.now();
  while (!(latest && !latest.lost && performance.now() - latest.at < 600)) {
    if (performance.now() - t0 > 20000) {
      instruct.textContent = 'No face found.';
      sub.textContent = 'Check the camera, light, and that the face model is installed. Then press Start again.';
      $('startCalibBtn').hidden = false;
      $('startCalibBtn').textContent = 'Start again';
      return;
    }
    await wait(100);
  }

  const result: Record<string, Vec2> = {};
  for (const t of TARGETS) {
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      instruct.textContent = t.text;
      sub.textContent = 'Move there…';
      ring.hidden = false;
      ring.classList.remove('hold');
      ring.style.left = `${t.x}%`;
      ring.style.top = `${t.y}%`;
      ring.textContent = String(TARGETS.indexOf(t) + 1);
      playClickSound();
      await wait(1100); // time to move
      sub.textContent = 'Hold still…';
      ring.classList.add('hold');
      const s = await collect(1100);
      if (s.length >= 8) {
        result[t.key] = medianPoint(s);
        ok = true;
      } else {
        sub.textContent = 'Lost your face, trying again…';
        await wait(700);
      }
    }
    if (!ok) {
      instruct.textContent = 'Lost track of your face.';
      sub.textContent = 'Make sure your face is lit and visible, then press Start again.';
      ring.hidden = true;
      $('startCalibBtn').hidden = false;
      $('startCalibBtn').textContent = 'Start again';
      return;
    }
  }

  ring.hidden = true;
  const res = computeCalibration({
    center: result.center, left: result.left, right: result.right, up: result.up, down: result.down
  });
  if (!res.ok) {
    instruct.textContent = 'That did not work.';
    sub.textContent = '';
    const n = $('calibError');
    n.hidden = false;
    n.textContent = res.reason;
    $('startCalibBtn').hidden = false;
    $('startCalibBtn').textContent = 'Try again';
    return;
  }

  settings = await saveSettings({ calibration: res.profile, enabled: true });
  instruct.textContent = 'Calibrated.';
  sub.textContent = 'Your range is saved.';
  playSuccessSound();
  $('step2NextBtn').hidden = false;
}

$('startCalibBtn').addEventListener('click', () => void runCalibration());

$('step2NextBtn').addEventListener('click', () => {
  showStep(3);
  testFilter.reset();
  const total = ((Date.now() - startTime) / 1000).toFixed(1);
  $('finalTime').textContent = `Setup took ${total} seconds.`;
});

// ---- step 3: live test ----------------------------------------------------------------------

const testStage = $('testStage');
const testDot = $('testDot');
const testFilter = new OneEuroPointFilter(1.2, 0.012);
const buttons = ['pgBtn1', 'pgBtn2', 'pgBtn3'].map((id) => $<HTMLButtonElement>(id));
let dwell: { btn: HTMLButtonElement; start: number } | null = null;
let count = 0;

function onTestPose() {
  if (!$('step3').classList.contains('on') || !latest || latest.lost || !settings) return;
  const rect = testStage.getBoundingClientRect();
  const n = mapHead({ x: latest.x, y: latest.y }, settings.calibration, settings.sensitivity, settings.deadZone);
  const p = toScreen(n, rect.width, rect.height, 10);
  const s = testFilter.filter(p.x, p.y, performance.now());
  testDot.style.left = `${s.x}px`;
  testDot.style.top = `${s.y}px`;

  const gx = s.x + rect.left;
  const gy = s.y + rect.top;
  const over = buttons.find((b) => {
    const r = b.getBoundingClientRect();
    return gx >= r.left - 8 && gx <= r.right + 8 && gy >= r.top - 8 && gy <= r.bottom + 8;
  });

  buttons.forEach((b) => ((b.querySelector('.fill') as HTMLElement).style.width = '0'));
  if (!over) {
    dwell = null;
    return;
  }
  if (!dwell || dwell.btn !== over) dwell = { btn: over, start: performance.now() };
  const frac = Math.min(1, (performance.now() - dwell.start) / settings.dwellMs);
  (over.querySelector('.fill') as HTMLElement).style.width = `${frac * 100}%`;
  if (frac >= 1) {
    dwell = { btn: over, start: performance.now() + 700 }; // short pause before it can fire again
    over.click();
  }
}

$('pgBtn1').addEventListener('click', () => {
  count++;
  $('pgBtn1').firstChild!.textContent = `Count: ${count}`;
  playClickSound();
});
$('pgBtn2').addEventListener('click', () => {
  $('pgBtn2').classList.toggle('hit');
  playClickSound();
});
$('pgBtn3').addEventListener('click', () => {
  $('testMsg').textContent = 'Nice. That is all it takes.';
  playSuccessSound();
});

$('recalibBtn').addEventListener('click', () => {
  showStep(2);
  $('startCalibBtn').hidden = false;
  $('startCalibBtn').textContent = 'Start';
  $('step2NextBtn').hidden = true;
  instruct.textContent = 'Press Start when you are ready.';
  sub.textContent = '';
});

$('finishBtn').addEventListener('click', async () => {
  clearInterval(timerInterval);
  await chrome.tabs.create({ url: 'https://en.wikipedia.org' });
  window.close();
});

void loadSettings().then((s) => {
  settings = s;
  const p = smoothingToParams(s.smoothing);
  testFilter.setParams(p.minCutoff, p.beta);
});
