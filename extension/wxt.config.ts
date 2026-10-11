import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Handsfree: voice and webcam browsing',
    description: 'Browse without a mouse or keyboard. Move the pointer with your head, speak commands, and dictate text. Runs on-device.',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'tabs', 'offscreen', 'scripting'],
    host_permissions: [
      '<all_urls>'
    ],
    commands: {
      'toggle-handsfree': {
        suggested_key: {
          default: 'Alt+Shift+H'
        },
        description: 'Toggle Handsfree Active / Paused'
      },
      'recenter-handsfree': {
        suggested_key: {
          default: 'Alt+Shift+C'
        },
        description: 'Recenter Head Neutral Pose'
      },
      'toggle-mode': {
        suggested_key: {
          default: 'Alt+Shift+M'
        },
        description: 'Switch between head and hand tracking'
      }
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    }
  }
});
