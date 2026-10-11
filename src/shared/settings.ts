export type TrackingMode = 'head';
export type VoiceEngine = 'webspeech' | 'vosk';
export type InputStyle = 'both' | 'dwell' | 'voice';

export interface FilterSettings {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export interface HandsfreeSettings {
  mode: TrackingMode;
  dwellMs: number;
  dwellTolerance: number;
  snapRadius: number;
  dwellCooldownMs: number;
  sensitivity: number;
  cursorSize: number;
  voiceEngine: VoiceEngine;
  filter: FilterSettings;
  // Voice command settings
  wakeWordEnabled: boolean;
  wakeWord: string;
  confirmationTone: boolean;
  scrollSpeed: number; // pixels per second
  dwellEnabled: boolean;
  inputStyle: InputStyle;
  cancelWindowEnabled: boolean;
  cancelWindowMs: number;
  customSites: Record<string, string>;
}

export const DEFAULT_CUSTOM_SITES: Record<string, string> = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  gmail: 'https://mail.google.com',
  wikipedia: 'https://www.wikipedia.org',
  github: 'https://github.com',
  reddit: 'https://www.reddit.com',
  twitter: 'https://x.com',
};

export const DEFAULT_SETTINGS: HandsfreeSettings = {
  mode: 'head',
  dwellMs: 800,
  dwellTolerance: 25,
  snapRadius: 40,
  dwellCooldownMs: 600,
  sensitivity: 1.0,
  cursorSize: 28,
  voiceEngine: 'webspeech',
  filter: {
    minCutoff: 1.0,
    beta: 0.007,
    dCutoff: 1.0,
  },
  // Voice defaults
  wakeWordEnabled: false,
  wakeWord: 'handsfree',
  confirmationTone: true,
  scrollSpeed: 400,
  dwellEnabled: true,
  inputStyle: 'both',
  cancelWindowEnabled: true,
  cancelWindowMs: 400,
  customSites: { ...DEFAULT_CUSTOM_SITES },
};

const SETTINGS_STORAGE_KEY = 'handsfree_settings';

/**
 * Load settings from chrome.storage.local with defaults fallback.
 */
export async function getSettings(): Promise<HandsfreeSettings> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return { ...DEFAULT_SETTINGS };
    }
    const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    const stored = result?.[SETTINGS_STORAGE_KEY] as Partial<HandsfreeSettings> | undefined;

    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      filter: {
        ...DEFAULT_SETTINGS.filter,
        ...(stored.filter || {}),
      },
      customSites: {
        ...DEFAULT_SETTINGS.customSites,
        ...(stored.customSites || {}),
      },
    };
  } catch (error) {
    console.warn('[Handsfree] Failed to load settings from storage, using defaults:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save partial or full settings to chrome.storage.local.
 */
export async function saveSettings(
  partial: Partial<HandsfreeSettings>,
): Promise<HandsfreeSettings> {
  try {
    const current = await getSettings();
    const updated: HandsfreeSettings = {
      ...current,
      ...partial,
      filter: {
        ...current.filter,
        ...(partial.filter || {}),
      },
      customSites: {
        ...current.customSites,
        ...(partial.customSites || {}),
      },
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: updated });
    }
    return updated;
  } catch (error) {
    console.warn('[Handsfree] Failed to save settings to storage:', error);
    throw error;
  }
}

/**
 * Reset settings back to default values in chrome.storage.local.
 */
export async function resetSettings(): Promise<HandsfreeSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS });
    }
    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.warn('[Handsfree] Failed to reset settings in storage:', error);
    throw error;
  }
}
