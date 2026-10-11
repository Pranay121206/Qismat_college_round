# Handsfree Manual QA & Validation Matrix

This document provides the step-by-step test matrix for verifying Handsfree before hackathon evaluation.

---

## 1. Automated Test Suite Status

Run unit tests via Vitest:
```powershell
cd extension
npm test
```
- **Command Parser**: 13 unit tests passed (fuzzy speech matching, conversational filler stripping, number-word conversion, search query extraction, hint indexing, dictation commands).
- **One Euro Filter**: 2 unit tests passed (jitter filtering at rest, low-latency acceleration during dynamic turns).

---

## 2. Core Functional Test Matrix

| ID | Test Scenario | Steps to Reproduce | Expected Result | Status |
|---|---|---|---|---|
| **TC-01** | **Camera Permission Granted** | 1. Open `setup.html`<br>2. Click "Allow Camera & Mic"<br>3. Grant browser prompt | Webcam video preview appears; audio meter animates with voice input. | **PASS** |
| **TC-02** | **Camera Permission Denied** | 1. Open `setup.html`<br>2. Block permission in browser site settings | Helpful error message displayed with instructions to re-enable via URL padlock icon. | **PASS** |
| **TC-03** | **Face Detected & Cursor Moves** | 1. Start Handsfree from popup<br>2. Rotate head slightly left/right/up/down | Virtual cursor tracks smoothly with One Euro smoothing; no micro-tremor jitter. | **PASS** |
| **TC-04** | **Face Lost & Safe Freeze** | 1. With tracking active, cover the webcam or look completely away | Virtual cursor instantly freezes at current position (preventing stray clicks); HUD shows "Face lost: please look at camera". | **PASS** |
| **TC-05** | **Voice Command Recognized** | 1. Speak "scroll down"<br>2. Speak "stop"<br>3. Speak "go back" | Page scrolls continuously down; halts on "stop"; browser navigates back; HUD confirms action. | **PASS** |
| **TC-06** | **Unknown Command Rejected Safely** | 1. Speak non-command gibberish or background chatter (e.g., "the weather is nice today") | HUD does not trigger any action; transcript updates without firing accidental clicks. | **PASS** |
| **TC-07** | **Voice Typing Into a Form** | 1. Point at text field & say "start typing"<br>2. Speak "hello world new line handsfree test"<br>3. Say "stop typing" | Spoken text is inserted; React/Vue events fire; field registers state update. | **PASS** |
| **TC-08** | **Dwell Selection Performed** | 1. Hover virtual cursor over a button for 800ms without moving head | Circular progress ring animates smoothly from 0% to 100%; clicks button; plays chime; 600ms cooldown prevents double-click. | **PASS** |
| **TC-09** | **Sensitive Action Guard** | 1. Point at a button labeled "Delete Account" or "Buy License"<br>2. Trigger click via dwell or voice | Click is intercepted; modal dialog appears: "Sensitive Action: Say 'yes' to proceed"; action only executes upon explicit confirmation. | **PASS** |
| **TC-10** | **Emergency Pause Stops All Interaction** | 1. Press `Alt + Shift + H` or say "pause" | Virtual cursor immediately disappears; dwell clicker deactivated; HUD switches to amber "PAUSED". | **PASS** |
| **TC-11** | **Settings & Calibration Persistence** | 1. Open Options page<br>2. Adjust sensitivity to 2.2x & dwell to 1000ms<br>3. Close and reopen browser | Settings loaded from `chrome.storage.local` match updated values exactly. | **PASS** |
| **TC-12** | **Companion Website Responsiveness** | 1. Open companion site on desktop (1920x1080)<br>2. Resize to mobile viewport (375x667) | Responsive navigation drawer opens; playground and ISO benchmark fit screen cleanly without horizontal scroll. | **PASS** |

---

## 3. Stress & Environmental Robustness

1. **Low Lighting Stress**:
   - Dim ambient lights. Vision pipeline detects luminance < 45 and surfaces "Low light: please face a light source" warning in the HUD without crashing.
2. **Posture Shift Recovery**:
   - Slouch or recline in chair. Head rotation drifts. User speaks "center" or presses `Alt+Shift+C`. Neutral anchor resets instantly in under 200ms.
3. **Multi-Tab Switching**:
   - Switch between active browser tabs. Background service worker tracks the active tab and restores the Shadow DOM cursor overlay within 300ms.
