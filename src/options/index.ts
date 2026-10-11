import {
  DEFAULT_CUSTOM_SITES,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  resetSettings,
  type HandsfreeSettings,
  type VoiceEngine,
} from '../shared/settings';
import type { HandsfreeMessage } from '../shared/messages';

async function initOptions(): Promise<void> {
  const sensitivityInput = document.getElementById('sensitivity') as HTMLInputElement;
  const cursorSizeInput = document.getElementById('cursorSize') as HTMLInputElement;
  const snapRadiusInput = document.getElementById('snapRadius') as HTMLInputElement;
  const dwellMsInput = document.getElementById('dwellMs') as HTMLInputElement;
  const dwellToleranceInput = document.getElementById('dwellTolerance') as HTMLInputElement;
  const dwellCooldownInput = document.getElementById('dwellCooldownMs') as HTMLInputElement;
  const voiceEngineSelect = document.getElementById('voiceEngine') as HTMLSelectElement;

  // Voice command inputs
  const scrollSpeedInput = document.getElementById('scrollSpeed') as HTMLInputElement;
  const confirmationToneInput = document.getElementById('confirmationTone') as HTMLInputElement;
  const wakeWordEnabledInput = document.getElementById('wakeWordEnabled') as HTMLInputElement;
  const wakeWordInput = document.getElementById('wakeWord') as HTMLInputElement;
  const customSitesTextarea = document.getElementById('customSites') as HTMLTextAreaElement;

  const valSensitivity = document.getElementById('valSensitivity');
  const valCursorSize = document.getElementById('valCursorSize');
  const valSnapRadius = document.getElementById('valSnapRadius');
  const valDwellMs = document.getElementById('valDwellMs');
  const valDwellTolerance = document.getElementById('valDwellTolerance');
  const valDwellCooldownMs = document.getElementById('valDwellCooldownMs');
  const valScrollSpeed = document.getElementById('valScrollSpeed');

  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const toast = document.getElementById('toast');

  function updateDisplays(): void {
    if (valSensitivity)
      valSensitivity.textContent = `${parseFloat(sensitivityInput.value).toFixed(1)}x`;
    if (valCursorSize) valCursorSize.textContent = `${cursorSizeInput.value}px`;
    if (valSnapRadius) valSnapRadius.textContent = `${snapRadiusInput.value}px`;
    if (valDwellMs) valDwellMs.textContent = `${dwellMsInput.value}ms`;
    if (valDwellTolerance) valDwellTolerance.textContent = `${dwellToleranceInput.value}px`;
    if (valDwellCooldownMs) valDwellCooldownMs.textContent = `${dwellCooldownInput.value}ms`;
    if (valScrollSpeed && scrollSpeedInput)
      valScrollSpeed.textContent = `${scrollSpeedInput.value}px/s`;
  }

  function serializeSites(sites: Record<string, string>): string {
    return Object.entries(sites)
      .map(([name, url]) => `${name}=${url}`)
      .join('\n');
  }

  function parseSites(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const name = trimmed.slice(0, eqIdx).trim().toLowerCase();
        const url = trimmed.slice(eqIdx + 1).trim();
        if (name && url) {
          result[name] = url.startsWith('http') ? url : `https://${url}`;
        }
      }
    }
    return Object.keys(result).length > 0 ? result : { ...DEFAULT_CUSTOM_SITES };
  }

  function applyToForm(settings: HandsfreeSettings): void {
    const radio = document.querySelector(
      `input[name="mode"][value="${settings.mode}"]`,
    ) as HTMLInputElement;
    if (radio) radio.checked = true;

    sensitivityInput.value = String(settings.sensitivity);
    cursorSizeInput.value = String(settings.cursorSize);
    snapRadiusInput.value = String(settings.snapRadius);
    dwellMsInput.value = String(settings.dwellMs);
    dwellToleranceInput.value = String(settings.dwellTolerance ?? DEFAULT_SETTINGS.dwellTolerance);
    dwellCooldownInput.value = String(settings.dwellCooldownMs ?? DEFAULT_SETTINGS.dwellCooldownMs);
    voiceEngineSelect.value = settings.voiceEngine;

    // Voice settings fields
    if (scrollSpeedInput) {
      scrollSpeedInput.value = String(settings.scrollSpeed ?? DEFAULT_SETTINGS.scrollSpeed);
    }
    if (confirmationToneInput) {
      confirmationToneInput.checked =
        settings.confirmationTone ?? DEFAULT_SETTINGS.confirmationTone;
    }
    if (wakeWordEnabledInput) {
      wakeWordEnabledInput.checked = settings.wakeWordEnabled ?? DEFAULT_SETTINGS.wakeWordEnabled;
    }
    if (wakeWordInput) {
      wakeWordInput.value = settings.wakeWord ?? DEFAULT_SETTINGS.wakeWord;
    }
    if (customSitesTextarea) {
      customSitesTextarea.value = serializeSites(
        settings.customSites ?? DEFAULT_SETTINGS.customSites,
      );
    }

    updateDisplays();
  }

  function showToast(text: string): void {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2000);
  }

  // Bind live value updates
  sensitivityInput?.addEventListener('input', updateDisplays);
  cursorSizeInput?.addEventListener('input', updateDisplays);
  snapRadiusInput?.addEventListener('input', updateDisplays);
  dwellMsInput?.addEventListener('input', updateDisplays);
  dwellToleranceInput?.addEventListener('input', updateDisplays);
  dwellCooldownInput?.addEventListener('input', updateDisplays);
  scrollSpeedInput?.addEventListener('input', updateDisplays);

  // Load stored settings
  const current = await getSettings();
  applyToForm(current);

  // Save handler
  saveBtn?.addEventListener('click', async () => {
    const updated = await saveSettings({
      mode: 'head',
      sensitivity: parseFloat(sensitivityInput.value),
      cursorSize: parseInt(cursorSizeInput.value, 10),
      snapRadius: parseInt(snapRadiusInput.value, 10),
      dwellMs: parseInt(dwellMsInput.value, 10),
      dwellTolerance: parseInt(dwellToleranceInput.value, 10),
      dwellCooldownMs: parseInt(dwellCooldownInput.value, 10),
      voiceEngine: voiceEngineSelect.value as VoiceEngine,
      scrollSpeed: parseInt(scrollSpeedInput?.value || '400', 10),
      confirmationTone: confirmationToneInput ? confirmationToneInput.checked : true,
      wakeWordEnabled: wakeWordEnabledInput ? wakeWordEnabledInput.checked : false,
      wakeWord: wakeWordInput?.value?.trim() || 'handsfree',
      customSites: parseSites(customSitesTextarea?.value || ''),
    });

    // Notify other components
    const msg: HandsfreeMessage = {
      type: 'SETTINGS_UPDATE',
      payload: updated,
      source: 'options',
    };
    chrome.runtime.sendMessage(msg).catch(() => {});

    showToast('Settings saved successfully');
  });

  // Reset handler
  resetBtn?.addEventListener('click', async () => {
    const reset = await resetSettings();
    applyToForm(reset || DEFAULT_SETTINGS);
    showToast('Settings reset to defaults');
  });
}

document.addEventListener('DOMContentLoaded', initOptions);
