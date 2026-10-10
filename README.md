# Handsfree 🖐️👀

> Control any website with head movement and voice commands — 100% on-device, free, and private.

Handsfree is a Manifest V3 browser extension for Google Chrome and Microsoft Edge designed for touchless computer interaction without specialized assistive hardware.

For the comprehensive technical specification, architecture, and implementation details, see [PROJECT_OVERVIEW.md](file:///c:/Handsfree/PROJECT_OVERVIEW.md).

---

## 🔒 Privacy & Architecture Principles

- **100% Free & Local:** Zero external APIs, zero telemetry, zero servers or accounts.
- **On-Device Machine Learning:** Video frames and audio streams are processed locally and never leave the browser.
- **MV3 Offscreen Pipeline:** Media capture and MediaPipe processing execute inside a dedicated `chrome.offscreen` document.
- **Dual-Path Speech Architecture:** Resilient continuous speech recognition via native Web Speech with automatic Pinned Voice Host fallback (`src/voice-host`) and offline Vosk WASM support.
- **Isolated Cursor & HUD:** Virtual cursor, Corner HUD, and modal dialogs render inside a closed Shadow DOM (`z-index: 2147483647`) to guarantee zero styling interference from host web pages.

---

## ⚡ What Has Been Implemented

1. **Head Tracking Engine:**
   - Real-time 30fps facial landmark tracking via bundled local Google MediaPipe (`face_landmarker.task`, 3.7MB).
   - 3D Euler angle estimation (yaw and pitch) fused with nose-tip translation.
   - Adaptive $1€$ (OneEuro) filter eliminating resting jitter while preserving rapid response.
   - Ergonomic deflection curve with a 2.5% resting dead-zone and dynamic center zeroing.
   - Automatic pause on face loss (> 3s) and seamless auto-resume when re-acquired.

2. **Assistive Virtual Cursor & Dwell Engine:**
   - Closed Shadow DOM isolated cursor with state-dependent glow (Cyan, Purple, Amber).
   - Fast spatial snap-to-target with magnetic pull over links, buttons, and inputs without layout thrashing.
   - Circular SVG dwell click progress with configurable timing and cooldown.
   - Target grace window (700ms) and speech-onset anchoring to eliminate speech drift.

3. **Natural Voice Command System:**
   - Continuous speech listening with phonetic and Damerau-Levenshtein fuzzy matching.
   - Pointer control: `"click"`, `"double click"`, `"right click"`, `"drag"`, `"drop"`, `"open link"`, `"open in new tab"`, `"copy link"`, `"read this"`, `"zoom here"`.
   - Continuous smooth scrolling: `"scroll down"`, `"scroll up"`, `"stop"`, `"page down"`, `"page up"`, `"top"`, `"bottom"`, `"scroll here"`.
   - Browser navigation: `"go back"`, `"go forward"`, `"refresh"`, `"new tab"`, `"close tab"`, `"next tab"`, `"prev tab"`, `"tab <number>"`, `"open <site>"`.
   - Click-by-Number (Hints): `"show hints"` overlays numbers 1-99 on interactive targets; `"click <number>"` executes the action.
   - State control: `"pause"`, `"resume"`, `"dwell on"`, `"dwell off"`, `"center"`.

4. **Voice Dictation & Text Editing:**
   - `"start typing"` focuses inputs, textareas, and contenteditable elements with a glowing purple outline.
   - Dispatches synthetic events compatible with React, Vue, and Angular.
   - Inline punctuation conversion (comma, period, question mark, new line).
   - Spoken editing: `"delete last word"`, `"clear field"`, `"capitalize that"`, `"select all"`, `"undo"`, `"submit"`, `"stop typing"`.

5. **Risky Action Confirmation Guard:**
   - Intercepts destructive actions (delete, remove, buy now, checkout, pay, transfer).
   - Displays confirmation modal with voice confirmation (_"Say 'yes' to proceed, or 'no'"_) and dwell confirm button.

6. **Audio & Visual Feedback:**
   - Web Audio synthesized two-tone confirmation chimes.
   - Corner HUD showing tracking status, 30 FPS, confidence, and live audio level meter.
   - Live voice feedback toast with recognized transcripts.
   - Sub-second posture re-centering (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> or `"center"`) and continuous edge-drift detection.

7. **Onboarding & Settings:**
   - First-run setup page (`setup.html`) with live camera preview, mic level meter, and diagnostic log.
   - Action popup (`popup.html`) with quick start/stop, recenter, and commands drawer.
   - Options page (`options.html`) with sensitivity sliders, custom site shortcuts, and wake-word toggles.

---

## 🛠️ Technology Stack

- **Framework:** [WXT](https://wxt.dev/) (`v0.21.3`) Manifest V3 extension framework
- **Bundler:** Vite (`v8.1.5`)
- **Language:** TypeScript (`v5.9.3`)
- **Computer Vision:** Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision v1.1.0`) with local WASM and models
- **Signal Filtering:** Custom $1€$ (OneEuro) Filter
- **Speech Engine:** Web Speech API (`webkitSpeechRecognition`) + Pinned Voice Host + Vosk WASM architecture
- **Audio Processing:** Web Audio API (`AudioContext`, `AnalyserNode`, `OscillatorNode`)
- **Styling:** Vanilla CSS with Closed Shadow DOM encapsulation
- **Testing:** Vitest (`v5.0.3`) — 103 passing unit tests

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm 9+

### Installation

```bash
git clone https://github.com/your-username/handsfree.git
cd handsfree
npm install
```

### Available Scripts

| Command              | Description                                                           |
| :------------------- | :-------------------------------------------------------------------- |
| `npm run dev`        | Starts WXT dev server with HMR for Google Chrome                      |
| `npm run dev:edge`   | Starts WXT dev server with HMR for Microsoft Edge                     |
| `npm run build`      | Builds production extension bundle for Chrome in `.output/chrome-mv3` |
| `npm run build:edge` | Builds production extension bundle for Edge in `.output/edge-mv3`     |
| `npm test`           | Runs Vitest test suite (103 unit tests)                               |
| `npm run compile`    | Runs TypeScript type checking (`tsc --noEmit`)                        |
| `npm run lint`       | Runs ESLint and Prettier formatting checks                            |
| `npm run format`     | Auto-formats code with Prettier                                       |
| `npm run zip`        | Builds and packages Chrome extension into `.output/*.zip`             |
| `npm run zip:edge`   | Builds and packages Edge extension into `.output/*.zip`               |

---

## 📦 How to Load the Unpacked Extension

### Google Chrome

1. Build the extension:
   ```bash
   npm run build
   ```
2. Open Chrome and navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the folder:
   ```text
   <project-root>/.output/chrome-mv3
   ```
6. The Handsfree extension will appear in your extensions toolbar. Pin **Handsfree**.
7. Click the Handsfree icon to open the popup showing **"Handsfree ready"**.

---

### Microsoft Edge

1. Build the extension for Edge:
   ```bash
   npm run build:edge
   ```
2. Open Edge and navigate to:
   ```text
   edge://extensions
   ```
3. Turn on the **Developer mode** toggle in the left sidebar.
4. Click **Load unpacked**.
5. Select the folder:
   ```text
   <project-root>/.output/edge-mv3
   ```
6. The extension is now loaded and available on Edge!

---

## ⌨️ Keyboard Shortcuts

| Shortcut                                         | Action                                                                      |
| :----------------------------------------------- | :-------------------------------------------------------------------------- |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd> | Toggle Handsfree tracking on / off (Active $\leftrightarrow$ Paused)        |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> | Sub-second posture re-center (resets neutral pose to current head position) |

---

## 📁 Project Structure

```text
src/
├── background/        # Background service worker (commands NLP, shortcuts & message bus)
├── content/           # Content scripts (closed Shadow DOM cursor, snap, hints, dictation)
├── offscreen/         # Offscreen document (webcam 640x480, MediaPipe vision & 1€ filter)
├── voice-host/        # Pinned voice host tab (continuous Web Speech fallback listener)
├── setup/             # First-run camera & microphone permission onboarding & diagnostics
├── popup/             # Extension action popup ("Handsfree ready", toggle, recenter)
├── options/           # Settings page (sensitivity, dwell delay, custom voice shortcuts)
└── shared/
    ├── messages.ts    # Strongly typed discriminated union message schemas
    ├── oneEuro.ts     # Adaptive OneEuroFilter algorithm
    ├── overlay.ts     # Virtual cursor, HUD, feedback toasts, risky modal
    ├── quickTourUI.ts # Interactive onboarding walkthrough UI
    └── settings.ts    # Settings defaults and chrome.storage.local persistence
```

For complete technical specifications, see [PROJECT_OVERVIEW.md](file:///c:/Handsfree/PROJECT_OVERVIEW.md).
