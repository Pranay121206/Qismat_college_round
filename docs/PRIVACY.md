# Handsfree Privacy Policy

**Effective Date:** October 2026  
**Commitment:** 100% Client-Side On-Device Machine Learning. Zero Video/Audio Upload.

---

## 1. Core Principles

Handsfree was built under a strict privacy-first engineering philosophy:
1. **Zero Video Transmission**: Webcam video is processed in an in-memory HTML5 video buffer within a sandboxed Chrome offscreen document. Frames are discarded immediately after facial geometry landmarks are extracted.
2. **Zero Audio Storage**: Microphones are sampled in real-time. No raw audio files are ever written to local disk or transmitted to any proprietary servers.
3. **No External Backends**: Handsfree contains no remote analytics, no tracking beacons, no external databases, and no user accounts.
4. **Local Data Persistence**: User preferences (sensitivity, dwell time, sound toggles) and calibration profiles are stored exclusively in the browser's sandboxed `chrome.storage.local`.

---

## 2. Web Speech API Disclosure

- When voice commands or voice dictation are active, Handsfree utilizes the browser's native Web Speech API (`SpeechRecognition`).
- In Chromium browsers (Google Chrome and Microsoft Edge), spoken audio may be transcribed using the browser vendor's cloud speech infrastructure according to their respective privacy terms.
- For air-gapped or completely offline enterprise settings, Handsfree provides an offline fallback mode utilizing local rule-based grammar parsing.

---

## 3. Permissions Justification

| Permission | Technical Need | Privacy Safeguard |
|---|---|---|
| `offscreen` | Ingests camera & mic in background without tab UI interference | Document runs in restricted sandbox without network access. |
| `storage` | Saves user calibration and sensitivity settings | Stored strictly in local browser storage (`chrome.storage.local`). |
| `activeTab` / `tabs` | Renders virtual cursor and receives navigation commands | Injected only when user activates Handsfree. |
| `commands` | Enables global hotkeys (`Alt+Shift+H`, `Alt+Shift+C`) | Registered through standard Chrome Commands API. |
