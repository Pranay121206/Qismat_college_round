import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '.',
  manifest: {
    name: 'Handsfree',
    description: 'Control any website with head movement and voice with zero specialized hardware.',
    version: '0.1.0',
    permissions: ['offscreen', 'storage', 'tabs', 'scripting', 'activeTab', 'commands', 'history'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    web_accessible_resources: [
      {
        resources: ['mediapipe/*', 'mediapipe/wasm/*', 'mediapipe/models/*'],
        matches: ['<all_urls>'],
      },
    ],
    commands: {
      'toggle-handsfree': {
        suggested_key: {
          default: 'Alt+Shift+H',
          mac: 'Alt+Shift+H',
        },
        description: 'Toggle Handsfree control on or off',
      },
      recenter: {
        suggested_key: {
          default: 'Alt+Shift+C',
          mac: 'Alt+Shift+C',
        },
        description: 'Reset neutral pose to current head position',
      },
    },
  },
});
