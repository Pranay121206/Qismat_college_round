# Handsfree Installation & Windows Setup Guide

Follow this guide to install, build, load, and test Handsfree on Windows using Google Chrome or Microsoft Edge.

---

## 1. Prerequisites

Verify that you have Node.js and npm installed:
```powershell
node -v
npm -v
```
*(Node v18+ or v22+ is supported)*

---

## 2. Fast Build & Packaging Commands

From the project root:
```powershell
# 1. Install extension dependencies & run unit tests
cd extension
npm install
npm test

# 2. Build the extension for Chrome/Edge Manifest V3
npm run build

# 3. Package the extension into a deployable ZIP
npm run zip

# 4. (Optional) Run the companion website
cd ..\site
npm install
npm run build
npm run dev
```

The compiled extension is output to:
`handsfree/extension/.output/chrome-mv3/`

The ready-to-distribute ZIP is output to:
`handsfree/extension/.output/handsfree-extension-1.0.0-chrome.zip`

---

## 3. Loading the Unpacked Extension in Google Chrome

1. Open Google Chrome.
2. In the URL address bar, enter: `chrome://extensions`
3. In the top-right corner, turn ON **Developer mode** toggle.
4. Click the **Load unpacked** button in the top-left toolbar.
5. In the file picker dialog, navigate to and select the directory:
   `C:\Users\Pranay\.gemini\antigravity\scratch\handsfree\extension\.output\chrome-mv3`
6. Click **Select Folder**.
7. Handsfree will appear in your extension list! Click the puzzle-piece icon in your Chrome toolbar and **pin** Handsfree for quick access.

---

## 4. Loading the Unpacked Extension in Microsoft Edge

1. Open Microsoft Edge.
2. In the URL address bar, enter: `edge://extensions`
3. In the left navigation sidebar, toggle ON **Developer mode**.
4. Click the **Load unpacked** button in the top toolbar.
5. Select the folder:
   `C:\Users\Pranay\.gemini\antigravity\scratch\handsfree\extension\.output\chrome-mv3`
6. Pin the Handsfree icon to the Edge toolbar.

---

## 5. First-Run Setup & 30-Second Guided Calibration

1. Upon installation, the **Handsfree Setup page** will open automatically. (You can also open it any time from the extension popup by clicking **Calibrate**).
2. **Step 1: Permissions**
   - Click **Allow Camera & Microphone**.
   - Your webcam video preview and live audio volume meter will appear.
   - Click **Next: Calibrate Head**.
3. **Step 2: 20-Second Range Calibration**
   - Sit in a comfortable resting posture facing your screen.
   - Click **Start Calibration**.
   - Follow the countdown ring as it guides you through:
     1. Center (neutral resting position)
     2. Left
     3. Right
     4. Up
     5. Down
   - Handsfree computes your individual horizontal and vertical sensitivity gains and saves them to local storage.
4. **Step 3: Test in the Playground**
   - The interactive verification playground allows you to test dwell-clicking buttons, scrolling, and voice typing.
   - Click **Finish & Start Browsing**.

---

## 6. Global Keyboard Shortcuts

| Shortcut | Function | Description |
|---|---|---|
| `Alt + Shift + H` | Toggle Handsfree | Immediately pauses all tracking and hides the cursor. Ideal for undisturbed reading. |
| `Alt + Shift + C` | Recenter Head Pose | Re-anchors your neutral head position in under 200ms when your posture shifts. |
| `Alt + Shift + M` | Cycle Mode | Toggles between Head Tracking, Hand Tracking, and Eye Assist. |

---

## 7. Running the Companion Website

The companion website provides an interactive demo sandbox, the ISO 9241-9 benchmark suite, and complete documentation:
```powershell
cd site
npm run dev
```
Open your browser to: `http://localhost:3000`
