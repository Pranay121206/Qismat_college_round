import { getSettings } from '../shared/settings';
import type { HandsfreeMessage, StatusUpdate } from '../shared/messages';

let isRunning = false;

function updateStatusUI(status: Partial<StatusUpdate>): void {
  const statusBadge = document.getElementById('statusBadge');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleBtnText = document.getElementById('toggleBtnText');

  if (typeof status.running === 'boolean') {
    isRunning = status.running;
  }

  if (toggleBtnText) {
    toggleBtnText.textContent = isRunning ? 'Stop' : 'Start';
  }

  if (toggleBtn) {
    if (isRunning) {
      toggleBtn.classList.add('running');
    } else {
      toggleBtn.classList.remove('running');
    }
  }

  if (statusBadge) {
    if (isRunning) {
      statusBadge.textContent = 'Active';
      statusBadge.className = 'status-badge active';
    } else {
      statusBadge.textContent = 'Handsfree ready';
      statusBadge.className = 'status-badge idle';
    }
  }

  if (status.mode) {
    updateModeUI(status.mode);
  }
}

function updateModeUI(_mode?: string): void {
  const currentModeDesc = document.getElementById('currentModeDesc');
  if (currentModeDesc) {
    currentModeDesc.textContent = 'Head Motion';
  }
}

async function initPopup(): Promise<void> {
  const toggleBtn = document.getElementById('toggleBtn');
  const openSetupBtn = document.getElementById('openSetupBtn');
  const openOptionsBtn = document.getElementById('openOptionsBtn');

  // Load current settings
  const settings = await getSettings();
  updateModeUI(settings.mode || 'head');

  // Fetch initial status from background
  try {
    const status = (await chrome.runtime.sendMessage({
      type: 'GET_STATUS',
      source: 'popup',
    } as HandsfreeMessage)) as StatusUpdate;

    if (status) {
      updateStatusUI(status);
    }
  } catch {
    // Background not responding yet
  }

  // Listen for real-time status changes from background
  chrome.runtime.onMessage.addListener((message: HandsfreeMessage) => {
    if (!message || !message.type) return;

    if (message.type === 'STATUS_UPDATE') {
      updateStatusUI(message.payload);
    } else if (message.type === 'SETTINGS_UPDATE' && message.payload.mode) {
      updateModeUI(message.payload.mode);
    }
  });

  // Handle start/stop toggle
  toggleBtn?.addEventListener('click', async () => {
    const nextCommand = isRunning ? 'stop' : 'start';

    // Optimistic UI update
    updateStatusUI({ running: !isRunning });

    const commandMsg: HandsfreeMessage = {
      type: 'COMMAND',
      payload: {
        command: nextCommand,
        source: 'ui',
      },
      source: 'popup',
    };

    try {
      await chrome.runtime.sendMessage(commandMsg);
    } catch {
      // Background will re-sync on next message
    }
  });

  // Recenter button
  const recenterBtn = document.getElementById('recenterBtn');
  recenterBtn?.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'COMMAND',
        payload: { command: 'recenter', source: 'ui' },
        source: 'popup',
      });
    } catch {
      // Background will handle
    }
  });

  // Open permissions setup page
  openSetupBtn?.addEventListener('click', () => {
    const setupUrl = chrome.runtime.getURL('setup.html');
    chrome.tabs.create({ url: setupUrl });
  });

  // Commands Sheet controls
  const openCommandsBtn = document.getElementById('openCommandsBtn');
  const closeCommandsBtn = document.getElementById('closeCommandsBtn');
  const commandsSheet = document.getElementById('commandsSheet');
  const showOnPageBtn = document.getElementById('showOnPageBtn');

  openCommandsBtn?.addEventListener('click', () => {
    commandsSheet?.classList.add('open');
  });

  closeCommandsBtn?.addEventListener('click', () => {
    commandsSheet?.classList.remove('open');
  });

  showOnPageBtn?.addEventListener('click', async () => {
    commandsSheet?.classList.remove('open');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            type: 'COMMAND',
            payload: { command: 'show-help', source: 'ui' },
            source: 'popup',
          } as HandsfreeMessage)
          .catch(() => {});
      }
    });
    window.close();
  });

  // Open settings options page
  openOptionsBtn?.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
