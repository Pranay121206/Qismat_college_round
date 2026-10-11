// Copies the MediaPipe WASM runtime out of node_modules and downloads the two
// model files into public/, so the extension never loads code from a CDN.
// (Manifest V3 blocks remote scripts, which is why head tracking never started
// when the runtime was fetched from jsDelivr.)
import { cpSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = join(root, 'public', 'mediapipe', 'wasm');
const modelDir = join(root, 'public', 'models');

const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    minBytes: 2_000_000,
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    minBytes: 3_000_000,
  },
];

function copyWasm() {
  if (!existsSync(wasmSrc)) {
    console.error('[setup] @mediapipe/tasks-vision is not installed. Run "npm install" first.');
    process.exit(1);
  }
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log('[setup] MediaPipe WASM runtime copied to public/mediapipe/wasm');
}

async function download({ file, url, minBytes }) {
  const target = join(modelDir, file);
  if (existsSync(target) && statSync(target).size >= minBytes) {
    console.log(`[setup] ${file} already present`);
    return true;
  }
  mkdirSync(modelDir, { recursive: true });
  try {
    console.log(`[setup] downloading ${file} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < minBytes) throw new Error(`file too small (${buf.length} bytes)`);
    const tmp = target + '.part';
    writeFileSync(tmp, buf);
    renameSync(tmp, target);
    console.log(`[setup] saved ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
    return true;
  } catch (err) {
    console.error(`[setup] could not download ${file}: ${err.message}`);
    console.error(`        Download it manually from:\n        ${url}\n        and save it as extension/public/models/${file}`);
    return false;
  }
}

copyWasm();
const results = [];
for (const m of MODELS) results.push(await download(m));
// The face model is essential. The hand model only matters for hand mode.
if (!results[0]) {
  console.error('\n[setup] Face model missing. Head tracking will not work until it is in public/models/.');
  process.exit(1);
}
