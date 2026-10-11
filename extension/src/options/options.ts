import { DEFAULT_SETTINGS, HandsfreeSettings, loadSettings, resetSettings, saveSettings } from '../shared/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const sliders: Array<{ key: keyof HandsfreeSettings; fmt: (v: number) => string }> = [
  { key: 'sensitivity', fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'smoothing', fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'deadZone', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'cursorSize', fmt: (v) => `${v}px` },
  { key: 'snapRadius', fmt: (v) => `${v}px` },
  { key: 'dwellMs', fmt: (v) => `${(v / 1000).toFixed(1)}s` },
  { key: 'scrollSpeed', fmt: (v) => `${v}` }
];
const toggles: Array<keyof HandsfreeSettings> = ['dwellClickEnabled', 'soundFeedback', 'highContrast'];

function fill(s: HandsfreeSettings) {
  for (const { key, fmt } of sliders) {
    const input = $<HTMLInputElement>(key);
    input.value = String(s[key]);
    $(`${key}Val`).textContent = fmt(Number(s[key]));
  }
  for (const key of toggles) $<HTMLInputElement>(key).checked = !!s[key];
  $<HTMLSelectElement>('speechLang').value = s.speechLang;
  $<HTMLInputElement>('wakeWord').value = s.wakeWord;
}

for (const { key, fmt } of sliders) {
  $<HTMLInputElement>(key).addEventListener('input', (e) => {
    $(`${key}Val`).textContent = fmt(Number((e.target as HTMLInputElement).value));
  });
}

function toast(text: string) {
  const t = $('saveToast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

$('saveBtn').addEventListener('click', async () => {
  const patch: Partial<HandsfreeSettings> = {};
  for (const { key } of sliders) (patch as any)[key] = Number($<HTMLInputElement>(key).value);
  for (const key of toggles) (patch as any)[key] = $<HTMLInputElement>(key).checked;
  patch.speechLang = $<HTMLSelectElement>('speechLang').value;
  patch.wakeWord = $<HTMLInputElement>('wakeWord').value.trim().toLowerCase();
  patch.inputStyle = patch.dwellClickEnabled ? 'both' : 'voice_only';
  await saveSettings(patch);
  toast('Saved');
});

$('resetBtn').addEventListener('click', async () => {
  const current = await loadSettings();
  // keep the user's calibration, reset everything else
  await resetSettings();
  const s = await saveSettings({ ...DEFAULT_SETTINGS, calibration: current.calibration, enabled: current.enabled });
  fill(s);
  toast('Defaults restored');
});

$('exportBtn').addEventListener('click', async () => {
  const s = await loadSettings();
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'handsfree-settings.json';
  a.click();
});

void loadSettings().then(fill);
