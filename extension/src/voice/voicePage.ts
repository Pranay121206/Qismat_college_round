import { VoiceEngine } from '../offscreen/voice';
import { loadSettings } from '../shared/settings';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const voice = new VoiceEngine();
let listening = false;

function report(micActive: boolean, voiceError?: string) {
  chrome.runtime.sendMessage({ type: 'VOICE_STATUS', micActive, voiceError }).catch(() => {});
}

async function begin() {
  const s = await loadSettings();
  // make sure the microphone is allowed for this page; recognition fails silently otherwise
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true });
    st.getTracks().forEach((t) => t.stop());
  } catch {
    $('state').textContent = 'Microphone blocked';
    const e = $('err');
    e.hidden = false;
    e.textContent = 'Allow the microphone: click the lock icon in this window or run the setup page again.';
    ($('retry') as HTMLButtonElement).hidden = false;
    report(false, 'Microphone is blocked. Run setup again and allow it.');
    return;
  }
  ($('retry') as HTMLButtonElement).hidden = true;
  listening = voice.start(
    (r) => {
      $('heard').textContent = `“${r.text}”`;
      chrome.runtime.sendMessage(r).catch(() => {});
    },
    (msg) => {
      const e = $('err');
      e.hidden = !msg;
      e.textContent = msg || '';
      $('state').textContent = msg ? 'Voice problem' : 'Listening';
      report(!msg, msg);
    },
    s.speechLang
  );
  if (listening) {
    $('state').textContent = 'Listening';
    report(true);
  }
}

$('retry').addEventListener('click', () => void begin());
chrome.runtime.onMessage.addListener((m: any) => {
  if (m.type === 'SET_SPEECH_LANG') voice.setLang(m.lang);
  if (m.type === 'STOP_VOICE') {
    voice.stop();
    window.close();
  }
});
void begin();

// keep the background worker alive while listening
setInterval(() => chrome.runtime.sendMessage({ type: 'KEEPALIVE' }).catch(() => {}), 20000);
