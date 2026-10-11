# Handsfree: voice and webcam browsing

A Chrome/Edge extension that lets you browse without a mouse or keyboard: head (or hand) tracking moves the pointer,
resting on a button presses it, and voice handles scrolling, clicking by label, typing and navigation.
A companion website (`site/`) explains it and includes a practice page and a benchmark.

## Run it (Windows, Node 18+)

```powershell
# 1. Extension
cd extension
npm install
npm run build          # also downloads the two MediaPipe model files the first time (needs internet)

# 2. Chrome or Edge -> chrome://extensions -> Developer mode -> Load unpacked
#    choose:  extension\.output\chrome-mv3
#    The setup page opens: allow camera + mic, then point at the five rings.

# 3. Website (optional)
cd ..\site
npm install
npm run dev            # http://localhost:3000
```

If the model download fails, save these files into `extension/public/models/` and rebuild:
- https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

Tests: `cd extension && npm test`. Type check: `npm run compile`.

## What was wrong, and what changed

- The tracking runtime was loaded from a CDN, which Manifest V3 blocks, so face tracking never started. It is now bundled (`npm run setup` copies it and fetches the models).
- Calibration never measured anything. It now records your five poses and maps your own range to the screen.
- The pointer moved by drifting velocity from a raw offset. It now uses absolute, calibrated positions plus One Euro smoothing.
- Scrolling used `window.scrollBy`, which does nothing on reels and most apps. It now scrolls the container under the pointer, slowly by default, and steps item by item on snap feeds (Reels, Shorts).
- Clicks fired twice; dwell could click empty text; hint clicks hit the wrong element; "click sign in" did not exist. All fixed or added.
- Voice acts on interim results for simple commands, handles accents/language (Settings), and reports errors instead of failing silently.

## Voice and shortcuts

Say "help" on any page. Alt+Shift+H start/stop, Alt+Shift+C recenter, Alt+Shift+M head/hand.
"sleep" / "wake up" pause and resume listening without releasing the camera.

## Limits

- Speech recognition is Chrome's built-in service and needs internet.
- The pointer cannot appear on chrome:// pages, the Web Store, or Chrome's PDF viewer.
- Head pointing is less precise than a mouse; the magnet, smoothing and dwell time are adjustable in Settings.


## Latest update: smoother pointer, stronger voice, gestures

- **Smooth pointer**: filtering now uses the camera's own timestamps (not message arrival time), a pointer stabiliser removes sensor noise, motion is eased at display rate, snapping no longer tugs the pointer, and the hand tracks the palm knuckles instead of the wobbly fingertip.
- **Voice**: tries up to 4 recognition guesses, corrects common mishearings ("scroll town", "next tap"), tolerates filler words, fires safe commands ~280 ms sooner, and the background worker is kept alive.
- **Gestures**: pinch or open-mouth = click, palm swipe or head tilt = switch tab, peace sign + hand up/down = scroll.
- **Tabs and search**: `go to tab youtube`, `first/last tab`, `duplicate tab`, `close other tabs`, `google X`, `search youtube for X`, `search in new tab X`, `search on this site for X`.

Rebuild after pulling: `cd extension && npm install && npm run build`, then reload the extension in `chrome://extensions`.
