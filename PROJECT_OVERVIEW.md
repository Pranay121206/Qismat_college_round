# Handsfree 🖐️👀 — Comprehensive Project Overview & Technical Specification

> **Handsfree** is a 100% on-device, privacy-first Manifest V3 browser extension for Google Chrome and Microsoft Edge. It provides touchless computer interaction via real-time head motion tracking and natural voice commands without requiring specialized assistive hardware.

---

## 📑 Table of Contents

1. [Project Overview & Core Principles](#1-project-overview--core-principles)
2. [Complete Technology Stack](#2-complete-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [What Has Been Implemented & How Exactly It Works](#4-what-has-been-implemented--how-exactly-it-works)
   - [4.1 Head Tracking & Vision Pipeline](#41-head-tracking--vision-pipeline)
   - [4.2 Signal Conditioning ($1€$ Filter) & Ergonomic Motion Model](#42-signal-conditioning-1-filter--ergonomic-motion-model)
   - [4.3 Virtual Cursor & Shadow DOM Isolation](#43-virtual-cursor--shadow-dom-isolation)
   - [4.4 Spatial Snap-to-Target & Dwell Clicking](#44-spatial-snap-to-target--dwell-clicking)
   - [4.5 Speech Recognition & Resilient Dual-Path Architecture](#45-speech-recognition--resilient-dual-path-architecture)
   - [4.6 Voice Command Parsing Engine (Fuzzy NLP & Grammar)](#46-voice-command-parsing-engine-fuzzy-nlp--grammar)
   - [4.7 Voice Click-by-Number (Hints System)](#47-voice-click-by-number-hints-system)
   - [4.8 Voice Dictation & Text Editing Engine](#48-voice-dictation--text-editing-engine)
   - [4.9 Risky Action Confirmation Guard](#49-risky-action-confirmation-guard)
   - [4.10 Audio & Visual Feedback System (HUD & Chimes)](#410-audio--visual-feedback-system-hud--chimes)
   - [4.11 Sub-Second Posture Re-Centering & Edge Drift Detection](#411-sub-second-posture-re-centering--edge-drift-detection)
   - [4.12 Extension Lifecycle, Onboarding & Settings Pages](#412-extension-lifecycle-onboarding--settings-pages)
5. [Voice Command Reference](#5-voice-command-reference)
6. [Component File Structure](#6-component-file-structure)
7. [Testing & Verification](#7-testing--verification)

---

## 1. Project Overview & Core Principles

Handsfree empowers individuals with motor disabilities, repetitive strain injuries (RSI), or temporary mobility impairments—as well as power users seeking touchless multitasking—to navigate the modern web seamlessly using only a standard webcam and microphone.

### Core Architectural Principles:

- **100% Local & Privacy-Preserving:** All video frames and microphone audio streams are processed locally in real-time. Zero video, audio, or telemetry data ever leaves the user's browser. No cloud APIs, no accounts, and no tracking.
- **Zero Specialized Hardware:** Functions with standard built-in laptop webcams ($640 \times 480$ @ 30fps) and standard consumer microphones.
- **Manifest V3 Compliant:** Engineered around Chrome's modern extension security model using `chrome.offscreen` documents, background service workers, and structured message buses.
- **Complete DOM & Style Isolation:** The virtual cursor, HUD, toasts, and dialogs are isolated inside a **closed Shadow DOM** (`z-index: 2147483647`), guaranteeing zero visual breakage from or interference with host website CSS/JS.
- **Zero Layout Thrashing:** Spatial hit testing and target detection are optimized to run without causing expensive DOM reflows or layout thrashing.

---

## 2. Complete Technology Stack

| Category                      | Technology / Library                    | Version / Details                                       | Purpose in Handsfree                                                                                                |
| :---------------------------- | :-------------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------ |
| **Extension Framework**       | **WXT**                                 | `^0.21.3`                                               | Next-generation Web Extension framework targeting Chrome and Edge MV3 with Vite bundling and HMR.                   |
| **Bundler & Tooling**         | **Vite**                                | `^8.1.5`                                                | High-speed ESM bundler and development build runner.                                                                |
| **Language**                  | **TypeScript**                          | `^5.9.3`                                                | Strict type safety, discriminated union messaging, and explicit interface definitions across extension layers.      |
| **Browser APIs**              | **Chrome Extension APIs**               | Manifest V3                                             | `chrome.offscreen`, `chrome.storage.local`, `chrome.tabs`, `chrome.scripting`, `chrome.commands`, `chrome.history`. |
| **Machine Learning / Vision** | **Google MediaPipe Tasks Vision**       | `@mediapipe/tasks-vision ^1.1.0`                        | Real-time face mesh and landmark detection via `FaceLandmarker`.                                                    |
| **Offline ML Assets**         | **Local Bundled Binaries**              | `face_landmarker.task` (3.7MB) + `vision_wasm_internal` | Bundled directly in `public/mediapipe/` for zero CDN latency, offline operation, and offline CSP compliance.        |
| **Hardware Acceleration**     | **WebGL / WebGPU Delegates**            | GPU with CPU Fallback                                   | MediaPipe runs on GPU delegate when available, with automatic CPU fallback.                                         |
| **Signal Processing**         | **OneEuroFilter ($1€$)**                | Custom TypeScript implementation                        | Velocity-adaptive low-pass filtering for smooth cursor control with zero stationary jitter and low dynamic lag.     |
| **Speech Recognition**        | **Web Speech API**                      | `webkitSpeechRecognition`                               | Native browser speech recognition running in continuous mode with interim transcript support.                       |
| **Speech Fallback / Offline** | **Vosk Kaldi Engine**                   | WASM / Web Audio PCM pipeline                           | Pluggable offline WASM speech engine architecture via 16kHz mono `AudioContext`.                                    |
| **Audio Synthesis**           | **Web Audio API**                       | Native `AudioContext` & `OscillatorNode`                | Real-time synthesized multi-tone feedback chimes and microphone frequency level analysis.                           |
| **Styling & Presentation**    | **Vanilla CSS & Shadow DOM**            | Closed Shadow Root                                      | Encapsulated custom UI with glassmorphism, dark-mode color palette, and GPU-accelerated micro-animations.           |
| **Testing Suite**             | **Vitest**                              | `^5.0.3`                                                | Unit and integration testing suite (103 unit tests covering commands, speech engines, and dictation).               |
| **Packaging & Linting**       | **web-ext**, **ESLint 9**, **Prettier** | `web-ext ^10.5.0`, `eslint ^9.20.0`                     | Extension bundling, zip packaging, and code quality enforcement.                                                    |

---

## 3. Architecture Overview

Handsfree follows a multi-process, decoupled architecture to satisfy Manifest V3 constraints while maintaining 30fps computer vision throughput and continuous speech recognition:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                       BACKGROUND SERVICE WORKER                           │
│  - Pipeline lifecycle manager (start, stop, pause, resume)                │
│  - Offscreen singleton & pinned Voice Host tab manager                    │
│  - Central message dispatcher (POSE_FRAME, SPEECH_RESULT, COMMANDS)       │
│  - Global keyboard shortcuts (Alt+Shift+H, Alt+Shift+C)                   │
│  - Browser navigation (chrome.tabs, chrome.history, chrome.scripting)     │
└───────────▲────────────────────────▲────────────────────────▲─────────────┘
            │                        │                        │
            ▼                        ▼                        ▼
┌───────────────────────┐ ┌────────────────────┐ ┌──────────────────────────┐
│  OFFSCREEN DOCUMENT   │ │  PINNED VOICE HOST │ │  CONTENT SCRIPT          │
│  - Webcam (640x480)   │ │  - Native Web      │ │  - Closed Shadow DOM     │
│  - MediaPipe Vision   │ │    Speech API      │ │    Virtual Cursor        │
│  - Landmark extraction│ │  - Continuous voice│ │  - Corner HUD            │
│  - Euler yaw/pitch    │ │    stream listener │ │  - Spatial Snap-to-Target│
│  - 1€ Filter          │ │  - SPEECH_ONSET    │ │  - Dwell Click Engine    │
│  - Relative deflection│ │    broadcaster     │ │  - Action Dispatcher     │
│  - 30fps loop         │ │  - Fallback engine │ │  - Voice Dictation Ring  │
└───────────────────────┘ └────────────────────┘ └──────────────────────────┘
            ▲                                                 ▲
            │                                                 │
┌───────────────────────┐                         ┌─────────────────────────┐
│ SETUP ONBOARDING PAGE │                         │ POPUP & OPTIONS UI      │
│  - Permission grant   │                         │  - Sensitivity / Dwell  │
│  - Live video preview │                         │  - Snap radius & size   │
│  - Audio meter test   │                         │  - Custom voice sites   │
│  - Real-time debug    │                         │  - Cheat sheet drawer   │
└───────────────────────┘                         └─────────────────────────┘
```

---

## 4. What Has Been Implemented & How Exactly It Works

### 4.1 Head Tracking & Vision Pipeline

- **Component:** `src/offscreen/index.ts`, `public/mediapipe/`
- **How It Works:**
  1. The background service worker creates an offscreen document with reasons `USER_MEDIA` and `AUDIO_PLAYBACK`.
  2. The offscreen document requests the camera stream at $640 \times 480$ resolution capped at 30fps.
  3. MediaPipe `FaceLandmarker` is initialized using local offline binaries (`FilesetResolver.forVisionTasks('mediapipe/wasm')`). It tries the GPU delegate first and safely falls back to CPU if hardware acceleration is unavailable.
  4. Frame processing executes in a dedicated 30fps loop (`window.setInterval` at 33ms cadence):
     - Extracts Landmark 1 (the nose tip).
     - Extracts the $4 \times 4$ facial transformation matrix and computes 3D Euler rotation angles:
       $$\text{pitch} = \text{atan2}(-R_{12}, \sqrt{R_{02}^2 + R_{22}^2}), \quad \text{yaw} = \text{atan2}(-R_{02}, R_{22})$$
     - Combines rotational orientation ($65\%$) and translational nose displacement ($35\%$) into unified raw head pose signals along the horizontal ($X$) and vertical ($Y$) axes.
  5. **Auto-Pause & Recovery:**
     - If no face is detected, confidence is transmitted as `0`, triggering an on-screen warning: _"Face lost: look at the camera"_.
     - If the face remains lost for $\ge 3$ consecutive seconds, tracking auto-pauses to conserve resources and avoid unintended actions.
     - When the user's face re-enters the camera view, the pipeline auto-resumes, recalibrates the center, and restores cursor movement seamlessly.

---

### 4.2 Signal Conditioning ($1€$ Filter) & Ergonomic Motion Model

- **Component:** `src/shared/oneEuro.ts`, `src/offscreen/index.ts`
- **How It Works:**
  1. **Dual-Axis $1€$ (OneEuro) Filtering:** Raw head pose coordinates are filtered using an adaptive low-pass filter:
     $$f_c = \text{minCutoff} + \beta \cdot |\dot{x}|$$
     - When the head is still, cutoff frequency stays low ($1.0\text{ Hz}$), filtering out jitter, hand-shake, and sensor noise.
     - When the head turns quickly, cutoff frequency scales with speed ($\beta = 0.007$), eliminating cursor lag.
  2. **Ergonomic Deflection Model:**
     - Calculates deflection from the calibrated center: $\Delta = \text{pose} - \text{neutralPose}$.
     - Implements a **2.5% dead zone** around neutral so natural resting posture does not cause cursor drift.
     - Applies an exponential power curve ($E = 1.2$) across comfortable deflection ranges ($0.32$ yaw, $0.24$ pitch):
       $$\text{response} = \min\left(1.3, \left(\frac{|\Delta| - \text{deadZone}}{\text{range}}\right)^{1.2}\right) \times \text{sign}(\Delta)$$
     - Gentle head movements allow sub-pixel precision for small text links, while deliberate deflections sweep across the entire display.
  3. **Delta Integration:** Delta coordinates are multiplied by user-configured sensitivity and elapsed frame time ($\Delta t$), then clamped within $[0, 1]$ screen coordinates.

---

### 4.3 Virtual Cursor & Shadow DOM Isolation

- **Component:** `src/shared/overlay.ts`, `src/content/index.ts`
- **How It Works:**
  1. Mounts an overlay container `#handsfree-overlay-host` directly to the top-level `document.body` with `z-index: 2147483647` and `pointer-events: none`.
  2. Attaches a **closed Shadow DOM** (`mode: 'closed'`), shielding extension styles from host CSS and preventing host styles from altering the cursor.
  3. Renders a multi-element virtual cursor:
     - Outer glowing neon ring ($28\text{px}$ default, customizable in options).
     - Centered high-precision tracking dot.
     - Circular SVG progress ring for visual dwell feedback.
     - Ripple animation ("Click Ping") expanding outward on click execution.
  4. Cursor visual styling updates dynamically based on system state:
     - **Active Tracking:** Neon Cyan (`#00f0ff`)
     - **Snapped to Target:** Expanded cyan ring with target bounding highlight
     - **Voice Dictating:** Royal Purple (`#8b5cf6`)
     - **Paused State:** Warning Amber (`#f59e0b`)

---

### 4.4 Spatial Snap-to-Target & Dwell Clicking

- **Component:** `src/content/snap.ts`, `src/content/targetManager.ts`, `src/shared/overlay.ts`
- **How It Works:**
  1. **Spatial Hit Testing (0ms Layout Thrashing):**
     - As the cursor moves, `findSnapTarget(x, y, snapRadius)` inspects elements directly under and immediately surrounding the cursor point using `document.elementFromPoint`.
     - Tests against interactive element selectors (`a`, `button`, `input`, `select`, `textarea`, `summary`, `[role="button"]`, `[onclick]`).
     - Avoids calling expensive DOM queries across the whole page, preventing layout thrashing.
  2. **Magnetic Snapping:**
     - When an interactive element is within `snapRadius` (default: 40px), a pull factor ($0.35$) draws the effective cursor toward the target's center.
     - An animated bounding box highlights the target element in neon cyan.
  3. **Dwell Click Engine:**
     - If the cursor stays within `dwellTolerance` (default: 25px) for `dwellMs` (default: 800ms), the dwell circle fills clockwise.
     - Upon completion, it dispatches an automated primary click and triggers an expandable ripple ping.
     - A cooldown period (`dwellCooldownMs`, default: 600ms) prevents duplicate accidental clicks.
     - Dwell clicking can be turned on or off via voice (`"dwell on"`, `"dwell off"`) or options.
  4. **Target Grace Window (700ms):**
     - When the cursor moves off an interactive target, `TargetManager` maintains the target reference for a 700ms grace window, preventing missed clicks if the user's head moves slightly when triggering a voice command.
  5. **Speech Onset Target Anchoring:**
     - When the user begins speaking, a `SPEECH_ONSET` event immediately locks the current target and coordinates. Voice commands like `"click"` execute against the element the user was looking at when they started speaking.

---

### 4.5 Speech Recognition & Resilient Dual-Path Architecture

- **Component:** `src/offscreen/voice.ts`, `src/voice-host/`, `src/background/index.ts`
- **How It Works:**
  1. **Chromium Limitation Discovery:** Chromium's architecture blocks `webkitSpeechRecognition` inside headless MV3 offscreen documents, returning error `"not-allowed"` or `"audio-capture"`.
  2. **Automated Pinned Voice Host Fallback:**
     - The background worker intercepts the offscreen speech error and automatically opens a pinned tab (`voice-host.html`).
     - The pinned tab runs `webkitSpeechRecognition` with `continuous: true` and `interimResults: true` in an extension renderer with full audio privileges.
     - Keeps listening in the background and auto-restarts if Chromium's silence timer ends the session.
  3. **Offline Vosk WASM Architecture:**
     - Includes a complete offline Vosk speech engine implementation that processes 16kHz mono audio streams via `AudioContext` and `ScriptProcessorNode`, providing a zero-network alternative.

---

### 4.6 Voice Command Parsing Engine (Fuzzy NLP & Grammar)

- **Component:** `src/background/commands.ts`
- **How It Works:**
  1. **Preprocessing:** Spoken text is converted to lowercase, conversational filler words ("please", "can you", "um", "uh", "hello", "like") are stripped, and number words ("three", "twenty one") are parsed into digits ("3", "21").
  2. **Fuzzy String & Phonetic Matching:**
     - Calculates **Damerau-Levenshtein distance** (including transpositions).
     - Generates phonetic sound codes (mapping silent letters, soft consonants, and double vowels).
     - Computes a blended similarity score (`matchSimilarity`), reliably recognizing misheard or slurred speech (e.g., `"clik"` $\to$ `"click"`, `"rite click"` $\to$ `"right-click"`).
  3. **Wake Word Support:** When enabled in settings, commands require a leading wake word (default: `"handsfree"`), with `"wake up"` and `"resume"` always permitted.
  4. **State Gating:**
     - `Active`: All commands are processed.
     - `Paused`: Ignores interaction commands; only responds to `"resume"`, `"wake up"`, or `"pause"`.
     - `Dictating`: Restricts commands to text controls (`"stop typing"`, `"submit"`, `"cancel"`).

---

### 4.7 Voice Click-by-Number (Hints System)

- **Component:** `src/content/hints.ts`, `src/content/actions.ts`
- **How It Works:**
  1. User says `"show hints"`, `"hints"`, or `"show numbers"`.
  2. The page scans the viewport for visible interactive elements (`a`, `button`, `input`, `select`, `textarea`, `role="button"`).
  3. Overlays amber numbered badges (numbered 1 through 99) directly beside each element.
  4. User speaks `"click 3"` or `"open link 5"`:
     - The badge number is resolved to the exact target element.
     - The simulated click or link opening is executed.
     - The hint overlay automatically dismisses.
  5. User can also say `"hide hints"` or `"cancel"` to dismiss the badges at any time.

---

### 4.8 Voice Dictation & Text Editing Engine

- **Component:** `src/content/dictation.ts`, `src/content/actions.ts`
- **How It Works:**
  1. User says `"start typing"`, `"type"`, or `"dictate"`:
     - Focuses the text input field, textarea, or `contenteditable` container under the virtual cursor.
     - The system enters `Dictating` state, rendering a glowing purple outline ring (`#8b5cf6`) with shadow pulse around the target element.
  2. **Framework Compatibility (React, Vue, Angular):**
     - Updates input values via native prototype property descriptors (`HTMLInputElement.prototype.value` setter).
     - Dispatches synthetic `input` and `change` events so reactive state bindings update immediately.
  3. **Inline Punctuation & Formatting:**
     - Automatically converts spoken words to symbols:
       - `"comma"` $\to$ `,`
       - `"period"` $\to$ `.`
       - `"question mark"` $\to$ `?`
       - `"exclamation mark"` $\to$ `!`
       - `"new line"` $\to$ `\n`
       - `"new paragraph"` $\to$ `\n\n`
  4. **Spoken Text Editing Commands:**
     - `"delete last word"`: Removes the previous word.
     - `"clear field"`: Empties the entire text field.
     - `"capitalize that"`: Capitalizes the previous word.
     - `"select all"`: Highlights the text.
     - `"undo"`: Reverts the last text change.
     - `"submit"`: Submits the active form.
     - `"stop typing"`: Exits dictation mode and returns to `Active` state.

---

### 4.9 Risky Action Confirmation Guard

- **Component:** `src/content/actions.ts`, `src/shared/overlay.ts`, `src/content/dictation.ts`
- **How It Works:**
  1. Before executing any click, submit, or button action, `isRiskyAction(element)` checks the target element and its ancestors against a pattern of destructive keywords:
     - `delete`, `remove`, `destroy`, `purge`, `erase`, `trash`
     - `pay`, `checkout`, `buy now`, `purchase`, `place order`, `subscribe`
     - `transfer`, `send money`, `withdraw`, `confirm payment`
  2. If detected, execution halts and a modal confirmation card appears:
     - Displays the intercepted action label (e.g. _"Confirm Destructive Action: Delete Account"_).
     - Prompts the user: _"Say 'yes' or 'confirm' to proceed, or 'no' / 'cancel'"_.
     - Provides an interactive dwell-to-confirm button as an alternative.
  3. The action executes only if confirmed, preventing accidental purchases or deletions from drift or background noise.

---

### 4.10 Audio & Visual Feedback System (HUD & Chimes)

- **Component:** `src/shared/overlay.ts`
- **How It Works:**
  1. **Web Audio Chimes:**
     - Success / Recognized: Generates a clear, synthesized two-tone chime ($587\text{ Hz} \to 880\text{ Hz}$) using native `OscillatorNode` and `GainNode`.
     - Unrecognized utterance: Plays a soft low-frequency tone ($220\text{ Hz}$).
     - Can be muted in the extension options.
  2. **Corner HUD:**
     - Anchored in the viewport corner displaying real-time system metrics:
       - Mode badge: `Head Motion`
       - Pipeline status: `Active` (green), `Paused` (amber), `Dictating` (purple)
       - Frame rate counter (e.g., `30 FPS`) and tracking confidence
       - Audio volume indicator meter
       - Quick action buttons: **Recenter**, **Commands Help**, **Pause / Resume**
  3. **Voice Feedback Pill:**
     - Displays a floating pill banner with microphone icon, recognized text transcript, and command badge for 2.2 seconds.
  4. **Commands Help Sheet:**
     - An accessible overlay drawer listing all available voice commands with syntax examples.

---

### 4.11 Sub-Second Posture Re-Centering & Edge Drift Detection

- **Component:** `src/shared/overlay.ts`, `src/offscreen/index.ts`, `src/background/index.ts`
- **How It Works:**
  1. **Instant Posture Re-Centering ($< 50\text{ms}$):**
     - Triggered via global keyboard shortcut <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>, voice command `"center"` or `"recenter"`, or HUD button.
     - Resets `neutralPose` to the current filtered head position and places the virtual cursor in the screen center $(0.5, 0.5)$.
     - Eliminates the need for tedious multi-step calibration wizards.
  2. **Continuous Edge Drift Detection:**
     - Detects if the virtual cursor remains pinned within 3px of any screen boundary.
     - If continuously pinned for $\ge 4$ seconds, an alert toast appears:
       $$\text{"Drifted? Say 'center' or press Alt+Shift+C"}$$
     - Automatically dismisses as soon as the cursor moves or re-centering is triggered.

---

### 4.12 Extension Lifecycle, Onboarding & Settings Pages

- **Component:** `src/setup/`, `src/popup/`, `src/options/`, `src/background/index.ts`
- **How It Works:**
  1. **Auto-Injection:** When installed or updated, the background worker scans all open tabs and automatically injects content scripts, enabling immediate use without manual page refreshes.
  2. **First-Run Onboarding Wizard (`setup.html`):**
     - Automatically opens on first install.
     - Verifies camera access with a live $640 \times 480$ video preview.
     - Tests microphone input with a live frequency level meter.
     - Features an interactive diagnostic panel logging offscreen status and live speech transcripts.
     - Provides clear troubleshooting steps if browser permissions are denied.
  3. **Extension Action Popup (`popup.html`):**
     - Shows current status badge (`Active` or `Handsfree ready`).
     - Includes a large Start/Stop toggle button.
     - Provides one-click buttons for Recenter, Permissions Setup, Settings, and the Voice Commands Sheet.
  4. **Options Page (`options.html`):**
     - Full customization of tracking sensitivity, cursor size, snap radius, dwell delay, dwell tolerance, dwell cooldown, and continuous scroll speed.
     - Voice settings: wake word toggle, custom wake word string, confirmation chimes.
     - **Custom Voice Site Shortcuts:** Map custom names to URLs (e.g., `reddit=https://reddit.com`), allowing commands like `"open reddit"`.

---

## 5. Voice Command Reference

Handsfree includes a built-in grammar of voice commands across several categories:

### 🖱️ Pointer & Click Commands

| Command Phrase                    | Action Performed                                   |
| :-------------------------------- | :------------------------------------------------- |
| `"click"`, `"left click"`         | Primary click at current virtual cursor position   |
| `"double click"`                  | Double click sequence at cursor position           |
| `"right click"`, `"context menu"` | Context menu / right click at cursor position      |
| `"drag"`, `"start drag"`          | Begins pointer drag gesture at cursor              |
| `"drop"`, `"stop drag"`           | Releases dragged target at cursor                  |
| `"select"`                        | Focuses element and selects inner text or option   |
| `"open"`, `"open link"`           | Opens link under cursor in the same tab            |
| `"open in new tab"`               | Opens link under cursor in a new background tab    |
| `"copy link"`                     | Copies link target URL to clipboard                |
| `"read this"`, `"speak this"`     | Reads element text aloud using Web SpeechSynthesis |
| `"zoom here"`                     | Centers and magnifies target element in viewport   |

### 📜 Scrolling Commands

| Command Phrase                   | Action Performed                                                |
| :------------------------------- | :-------------------------------------------------------------- |
| `"scroll down"`                  | Starts continuous smooth downward scroll (60fps)                |
| `"scroll up"`                    | Starts continuous smooth upward scroll (60fps)                  |
| `"stop"`, `"halt"`, `"freeze"`   | Immediately stops continuous smooth scrolling                   |
| `"page down"`                    | Jumps one viewport page downward                                |
| `"page up"`                      | Jumps one viewport page upward                                  |
| `"top"`, `"scroll to top"`       | Smoothly scrolls to the top of the page                         |
| `"bottom"`, `"scroll to bottom"` | Smoothly scrolls to the bottom of the page                      |
| `"scroll here"`                  | Smoothly scrolls the specific scrollable container under cursor |

### 🌐 Browser Navigation Commands

| Command Phrase                           | Action Performed                                            |
| :--------------------------------------- | :---------------------------------------------------------- |
| `"go back"`, `"back"`                    | Navigates back in browser history                           |
| `"go forward"`, `"forward"`              | Navigates forward in browser history                        |
| `"refresh"`, `"reload"`                  | Reloads the current page                                    |
| `"new tab"`                              | Opens a new blank browser tab                               |
| `"close tab"`                            | Closes the current active browser tab                       |
| `"next tab"`                             | Switches to the next tab to the right                       |
| `"previous tab"`, `"prev tab"`           | Switches to the tab to the left                             |
| `"tab <number>"` (e.g., `"tab 2"`)       | Jumps directly to tab index $N$                             |
| `"open <site>"` (e.g., `"open youtube"`) | Opens predefined or custom configured site URL              |
| `"search for <query>"`                   | Searches for query on page; falls back to Google search tab |

### 🔢 Click-by-Number (Hints)

| Command Phrase                         | Action Performed                                       |
| :------------------------------------- | :----------------------------------------------------- |
| `"show hints"`, `"hints"`              | Displays numbered badges over all interactive elements |
| `"hide hints"`, `"clear hints"`        | Hides all numbered hint badges                         |
| `"click <number>"` (e.g., `"click 4"`) | Directly clicks the element with badge $N$             |
| `"open link <number>"`                 | Opens link with badge $N$                              |

### ✍️ Voice Dictation & Editing

| Command Phrase                           | Action Performed                                                   |
| :--------------------------------------- | :----------------------------------------------------------------- |
| `"start typing"`, `"type here"`          | Focuses input under cursor and enters dictation mode (purple ring) |
| `"stop typing"`                          | Ends dictation mode and returns to normal tracking                 |
| `"comma"`, `"period"`, `"question mark"` | Inserts `,`, `.`, or `?`                                           |
| `"new line"`, `"new paragraph"`          | Inserts newline `\n` or double newline `\n\n`                      |
| `"delete last word"`                     | Deletes the preceding word                                         |
| `"clear field"`                          | Clears the entire text field                                       |
| `"capitalize that"`                      | Capitalizes the preceding word                                     |
| `"select all"`                           | Selects all text inside the field                                  |
| `"undo"`                                 | Reverts the last edit                                              |
| `"submit"`                               | Submits the active form (with safety guard)                        |

### ⚙️ System, Modes & Safety Controls

| Command Phrase               | Action Performed                                      |
| :--------------------------- | :---------------------------------------------------- |
| `"pause"`, `"sleep"`         | Pauses tracking and interactions                      |
| `"resume"`, `"wake up"`      | Resumes active tracking                               |
| `"dwell on"` / `"dwell off"` | Toggles automatic dwell clicking                      |
| `"center"`, `"recenter"`     | Re-centers neutral pose and cursor in $< 50\text{ms}$ |
| `"zoom in"` / `"zoom out"`   | Adjusts browser page zoom level                       |
| `"yes"`, `"confirm"`         | Confirms pending risky action modal                   |
| `"no"`, `"cancel"`           | Cancels pending modal, hints, or dictation            |
| `"help"`, `"what can i say"` | Opens the voice commands reference sheet              |

---

## 6. Component File Structure

```text
Handsfree/
├── docs/
│   └── decisions.md               # Architecture Decision Records (ADR-001, ADR-002, ADR-003)
├── public/
│   ├── icon-*.png                 # Extension icons
│   └── mediapipe/
│       ├── models/
│       │   └── face_landmarker.task # Bundled 3.7MB MediaPipe Face Landmarker model
│       └── wasm/                  # Bundled MediaPipe Vision WebAssembly binaries
├── src/
│   ├── background/
│   │   ├── __tests__/
│   │   │   └── commands.test.ts   # 68 unit tests for NLP parsing, phonetics, grammar
│   │   ├── commands.ts            # Voice command grammar, fuzzy matcher, number parser
│   │   └── index.ts               # MV3 Background service worker, tab & message bus manager
│   ├── content/
│   │   ├── __tests__/
│   │   │   └── dictation.test.ts  # 26 unit tests for text dictation, editing, risky guard
│   │   ├── actions.ts             # Pointer event dispatcher, smooth scrolling, risky check
│   │   ├── dictation.ts           # Voice typing, formatting, contenteditable/React support
│   │   ├── hints.ts               # Numbered badge overlay & click-by-number
│   │   ├── index.ts               # Content script entrypoint, frame forwarding
│   │   ├── snap.ts                # Fast spatial hit testing & magnetic pull
│   │   └── targetManager.ts       # Target grace window (700ms) & speech onset anchoring
│   ├── offscreen/
│   │   ├── __tests__/
│   │   │   └── voice.test.ts      # 9 unit tests for speech engine abstraction & switching
│   │   ├── index.html             # Offscreen host DOM with hidden video element
│   │   ├── index.ts               # MediaPipe vision loop, Euler pose, 1€ filter, auto-pause
│   │   └── voice.ts               # WebSpeech engine, Vosk Kaldi WASM engine abstraction
│   ├── options/
│   │   ├── index.html             # Options page layout
│   │   ├── index.css              # Options styling
│   │   └── index.ts               # Settings manager (sensitivity, dwell, custom sites)
│   ├── popup/
│   │   ├── index.html             # Extension popup UI
│   │   ├── index.css              # Popup styling
│   │   └── index.ts               # Start/stop toggle, recenter, commands drawer trigger
│   ├── setup/
│   │   ├── index.html             # First-run onboarding page layout
│   │   ├── index.css              # Onboarding page styling
│   │   └── index.ts               # Camera preview, mic analyser meter, diagnostic logger
│   ├── shared/
│   │   ├── messages.ts            # Strongly-typed discriminated union message definitions
│   │   ├── oneEuro.ts             # Adaptive OneEuroFilter algorithm
│   │   ├── overlay.ts             # Closed Shadow DOM virtual cursor, HUD, toasts, modals
│   │   ├── quickTourUI.ts         # Interactive onboarding walkthrough controller
│   │   └── settings.ts            # Default settings and chrome.storage.local persistence
│   └── voice-host/
│       ├── index.html             # Pinned voice host tab UI
│       └── index.ts               # Continuous Web Speech recognition renderer listener
├── package.json                   # Dependencies, scripts, configuration
├── tsconfig.json                  # TypeScript compiler configuration
└── wxt.config.ts                  # WXT manifest permissions, shortcuts, web resources
```

---

## 7. Testing & Verification

The codebase includes an automated test suite executed with Vitest:

```bash
npm test
```

### Test Suite Summary:

- **`src/background/__tests__/commands.test.ts` (68 tests):**
  - Validates Damerau-Levenshtein distance and phonetic similarity.
  - Number word conversion across units, compounds, and hundreds.
  - Filler word stripping.
  - Grammar matching across all categories (pointer, scroll, navigation, hints, modes, help).
  - Parameterized parsing (`"click 4"`, `"open link 2"`, `"tab 3"`, `"open github"`, `"search for books"`).
  - State gating in `Active`, `Paused`, and `Dictating` states.
  - Wake word enforcement and rejection thresholds.
- **`src/content/__tests__/dictation.test.ts` (26 tests):**
  - Editable target resolution (`input`, `textarea`, `contenteditable`, `role="textbox"`).
  - Synthetic event dispatching for reactive frameworks (React, Vue).
  - Inline punctuation conversions and editing commands (`delete last word`, `clear field`, `capitalize that`).
  - Destructive keyword detection for the Risky Action Guard.
- **`src/offscreen/__tests__/voice.test.ts` (9 tests):**
  - SpeechEngineManager engine switching (`webspeech` $\leftrightarrow$ `vosk`).
  - SpeechRecognition event lifecycles, interim transcripts, and confidence calculations.
  - Error recovery and graceful status updates.

**Current Test Results:**

```text
 ✓ src/offscreen/__tests__/voice.test.ts (9 tests)
 ✓ src/content/__tests__/dictation.test.ts (26 tests)
 ✓ src/background/__tests__/commands.test.ts (68 tests)

 Test Files  3 passed (3)
      Tests  103 passed (103)
```
