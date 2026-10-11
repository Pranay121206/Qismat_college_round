import { TrackingMode } from './messages';

/**
 * Head calibration, in the raw feature units produced by the vision pipeline.
 * "center" is the neutral pose. The four spans are how far the user's head moves
 * from center to reach each screen edge, measured during calibration.
 */
export interface CalibrationProfile {
  calibrated: boolean;
  cx: number;
  cy: number;
  /** Raw change when moving toward screen-right / screen-left / screen-down / screen-up. Always positive. */
  spanRight: number;
  spanLeft: number;
  spanDown: number;
  spanUp: number;
  /** +1 or -1: which direction in raw x means "screen right". Same for y. */
  dirX: 1 | -1;
  dirY: 1 | -1;
  timestamp: number;
}

export interface HandsfreeSettings {
  enabled: boolean;
  mode: TrackingMode;
  sensitivity: number;        // 0.5 - 2.5, multiplies how far the cursor travels per head movement
  deadZone: number;           // fraction of the screen (0 - 0.05) ignored around the resting position
  dwellMs: number;            // dwell-to-click duration
  tolerancePx: number;        // how still the cursor must stay while dwelling
  snapRadius: number;         // magnetic snap to clickable things (0 disables)
  cursorSize: number;
  smoothing: number;          // 0 (responsive) .. 1 (very smooth)
  scrollSpeed: number;        // px per second for continuous scroll
  voiceEnabled: boolean;
  speechLang: string;         // BCP-47, e.g. en-US, en-IN, en-GB
  soundFeedback: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  wakeWord: string;
  dwellClickEnabled: boolean;
  inputStyle: 'both' | 'dwell_only' | 'voice_only';
  calibration: CalibrationProfile;
}

export const DEFAULT_CALIBRATION: CalibrationProfile = {
  calibrated: false,
  cx: 0.5,
  cy: 0.5,
  spanRight: 0.12,
  spanLeft: 0.12,
  spanDown: 0.06,
  spanUp: 0.06,
  dirX: -1,
  dirY: 1,
  timestamp: 0
};

export const DEFAULT_SETTINGS: HandsfreeSettings = {
  enabled: false,
  mode: 'head',
  sensitivity: 1.0,
  deadZone: 0.01,
  dwellMs: 1000,
  tolerancePx: 30,
  snapRadius: 28,
  cursorSize: 28,
  smoothing: 0.5,
  scrollSpeed: 260,
  voiceEnabled: true,
  speechLang: typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US',
  soundFeedback: true,
  highContrast: false,
  reducedMotion: false,
  wakeWord: '',
  dwellClickEnabled: true,
  inputStyle: 'both',
  calibration: { ...DEFAULT_CALIBRATION }
};

const STORAGE_KEY = 'handsfree_settings_v2';

export async function loadSettings(): Promise<HandsfreeSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const stored = data && data[STORAGE_KEY];
      if (stored) {
        return {
          ...DEFAULT_SETTINGS,
          ...stored,
          calibration: { ...DEFAULT_CALIBRATION, ...(stored.calibration || {}) }
        };
      }
    }
  } catch (err) {
    console.warn('[Handsfree] Could not read settings:', err);
  }
  return { ...DEFAULT_SETTINGS, calibration: { ...DEFAULT_CALIBRATION } };
}

export async function saveSettings(patch: Partial<HandsfreeSettings>): Promise<HandsfreeSettings> {
  const current = await loadSettings();
  const updated: HandsfreeSettings = {
    ...current,
    ...patch,
    calibration: { ...current.calibration, ...(patch.calibration || {}) }
  };
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    }
  } catch (err) {
    console.warn('[Handsfree] Could not save settings:', err);
  }
  return updated;
}

export async function resetSettings(): Promise<HandsfreeSettings> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS, calibration: { ...DEFAULT_CALIBRATION } };
}

export function onSettingsChanged(cb: (s: HandsfreeSettings) => void): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        const v = changes[STORAGE_KEY].newValue;
        if (v) {
          cb({ ...DEFAULT_SETTINGS, ...v, calibration: { ...DEFAULT_CALIBRATION, ...(v.calibration || {}) } });
        }
      }
    });
  } catch {
    /* not in an extension context */
  }
}
