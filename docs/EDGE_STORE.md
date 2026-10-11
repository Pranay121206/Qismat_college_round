# Microsoft Edge Add-ons Store Publishing Checklist

This document provides the metadata, store listing copy, and permission justifications required for publishing Handsfree to the Microsoft Edge Add-ons catalog.

---

## 1. Store Listing Metadata

- **Name**: Handsfree - Voice & Webcam Browsing
- **Short Description**: Control any website hands-free using webcam head tracking, voice commands, safe dwell-clicking, and form dictation.
- **Category**: Accessibility / Productivity
- **Price**: Free (100% Open Source)
- **Support URL**: `https://github.com/crce-bit-n-build/handsfree`

### Long Description:
> Handsfree is an accessibility browser extension that enables people with motor impairments, tremors, or situational limitations to browse the web without physical mouse or keyboard input.
>
> Key Features:
> • Head-Pose Virtual Cursor: Smooth 60 FPS pointing powered by Google MediaPipe Tasks Vision and speed-adaptive One Euro filtering.
> • Voice Navigation: Say "scroll down", "go back", "refresh", "search for [query]", or "new tab".
> • Safe Dwell-to-Click: Dwell on interactive targets with a visible circular countdown ring and 600ms anti-chatter cooldown.
> • Sensitive Action Guard: Intercepts high-stakes buttons ("Delete", "Buy", "Submit") and requires spoken confirmation.
> • Spoken Form Dictation: Dictate directly into search fields and text inputs with spoken editing commands.
> • Numbered Vimium Hints: Say "show hints" to display numbered badges over all links for 100% precision.
> • Privacy First: All computer vision ML runs locally on-device. No video recordings are ever stored or uploaded.

---

## 2. Permission Justifications for Edge Reviewers

1. **`offscreen`**:
   - *Justification*: Required to access `navigator.mediaDevices.getUserMedia` for real-time webcam head tracking and microphone audio levels within Manifest V3, where background service workers lack DOM media access.
2. **`storage`**:
   - *Justification*: Required to persist individual user calibration profiles, sensitivity multipliers, and high-contrast accessibility preferences locally on the user's machine.
3. **`tabs` & `activeTab`**:
   - *Justification*: Required to coordinate the virtual cursor overlay between active tabs and execute browser history navigation (back, forward, reload, new tab) via spoken commands.
4. **`commands`**:
   - *Justification*: Required to provide the global emergency pause shortcut (`Alt+Shift+H`) and instant posture re-center shortcut (`Alt+Shift+C`).
