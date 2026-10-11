# Handsfree: Technical Limitations & Engineering Tradeoffs

In the spirit of honest engineering and scientific rigor, this document details the architectural boundaries and known constraints of browser-based assistive technology.

---

## 1. Operating System Cursor vs Virtual In-Page Cursor

- **Limitation**: Browser extensions operating under Chromium's security sandbox **cannot programmatically manipulate the operating system's native hardware mouse pointer**.
- **Solution**: Handsfree renders a high-contrast virtual cursor directly inside supported web pages using an isolated, closed Shadow DOM. Clicks are executed via standard synthetic pointer/mouse events (`pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`) alongside direct element fallback activation.
- **Boundary**: Handsfree cannot control applications outside the browser window (e.g., Windows File Explorer, native desktop apps).

---

## 2. Inaccessible Browser Internal Pages

- **Limitation**: Chromium security policy strictly forbids content script injection into internal browser URLs (`chrome://`, `edge://`, `about:blank`, Chrome Web Store, Edge Add-ons catalog, and the native PDF viewer).
- **Behavior**: Handsfree's virtual cursor and HUD will not appear on these protected pages.
- **Workaround**: Standard external web pages (`https://*` and `http://*`) are fully supported. The extension popup informs the user if an internal page is currently active.

---

## 3. Webcam Eye-Gaze vs Head Tracking Resolution

- **Physical Reality**: Webcam iris tracking without dedicated infrared illumination typically exhibits an angular error of 2°–4°, translating to an error of 150–300 pixels on typical desktop displays.
- **Engineering Decision**:
  - **Head-Pose Tracking is the Primary Pointer**: Head rotation provides millimeter-level stability and high repeatability.
  - **Eye Gaze is an Assistive Bias**: Eye gaze is utilized to gently bias the magnetic snapping radius toward the intended quadrant, or in conjunction with Numbered Vimium Hints where exact pixel coordinates are not required.

---

## 4. Continuous Speech Recognition in Extension Offscreen Documents

- **Limitation**: The Web Speech API (`webkitSpeechRecognition`) can occasionally terminate its recognition session after extended periods of silence.
- **Solution**: Handsfree implements an automatic lifecycle heartbeat. When `onend` fires while voice listening is enabled, the engine auto-restarts recognition within 300ms.
- **Network Dependency**: Standard Chromium speech recognition communicates with browser provider endpoints for acoustic decoding. If offline, the grammar parser handles local keystrokes and shortcuts.

---

## 5. Environmental Lighting & Camera Quality

- **Limitation**: Extremely dark rooms (< 30 lux) or strong background backlighting (e.g., sitting directly in front of a sunlit window) reduce landmark detection confidence.
- **Solution**: Handsfree samples frame luminance every 30 frames. When suboptimal lighting is detected, the HUD displays proactive guidance ("Low light detected: please face a light source") rather than failing silently or causing cursor jitter.
