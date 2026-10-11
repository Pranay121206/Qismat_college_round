# Handsfree: 2–3 Minute Live Judge Demonstration Script
**CRCE Bit N Build 2026 Hackathon**

*Setup Before Judges Arrive:*
- Have Google Chrome or Microsoft Edge open.
- Ensure the unpacked extension is loaded from `.output/chrome-mv3`.
- Open two tabs:
  1. The Handsfree Companion Website (`http://localhost:3000` or hosted URL).
  2. A sample website (e.g. Wikipedia or the companion demo playground).

---

### [0:00 – 0:30] Introduction & Rapid Setup
- **Presenter Action**: Step in front of the screen with your hands held behind your back or visibly resting on the table.
- **Presenter Speaks**:
  > "Hello judges! Today, we are demonstrating **Handsfree**: a complete, zero-hardware web navigation system for users with motor disabilities. Throughout this entire demo, my hands will never touch the mouse or keyboard."
- **Presenter Action**: Open the extension popup, click **Calibrate (20s)**.
- **Presenter Speaks**:
  > "First, onboarding: our guided 5-point calibration takes under 30 seconds."
- **Presenter Action**: Look Center, Left, Right, Up, Down. Follow the ring.
- **Visual On-Screen**: Timer shows `23.8s Completed!`. Click 'Finish'.

---

### [0:30 – 1:00] Head-Pose Pointing & Safe Dwell Selection
- **Presenter Action**: Navigate to the Playground or Wikipedia article. Move head gently toward a button.
- **Presenter Speaks**:
  > "Notice the high-contrast circular cursor tracking my head smoothly. We implemented a **One Euro Filter**, which completely filters out tremor jitter when dwelling on a target, while keeping latency under 16ms during quick turns."
- **Presenter Action**: Rest the cursor on the button. The circular progress ring fills for 800ms.
- **Visual On-Screen**: Button clicks! Chime plays. Cooldown ring activates.
- **Presenter Speaks**:
  > "No accidental clicks occur while I'm moving. The dwell ring gives complete visual certainty of intent."

---

### [1:00 – 1:30] Voice Commands & Numbered Hints
- **Presenter Action**: Speak clearly into the microphone:
  > *"Scroll down."*
- **Visual On-Screen**: Page smoothly begins continuous auto-scrolling. HUD displays `✓ Scrolling down`.
- **Presenter Speaks**:
  > *"Stop."*
- **Visual On-Screen**: Scrolling halts immediately.
- **Presenter Speaks**:
  > *"Show hints."*
- **Visual On-Screen**: High-contrast numbered badges (1, 2, 3...) appear across all visible links on the webpage.
- **Presenter Speaks**:
  > *"Click 2."*
- **Visual On-Screen**: Target #2 activates instantly! Badges dismiss.
- **Presenter Speaks**:
  > "For dense websites like Wikipedia or news portals, our Vimium-style hint overlay eliminates any spatial ambiguity."

---

### [1:30 – 2:00] Voice Typing & Sensitive Action Guard
- **Presenter Action**: Move cursor over a text input field.
- **Presenter Speaks**:
  > *"Start typing."*
- **Visual On-Screen**: Input field highlights in purple. HUD switches to `DICTATING`.
- **Presenter Speaks**:
  > *"Accessibility without limits period new line handsfree browsing works"*
- **Visual On-Screen**: Text streams live into the input and dispatches genuine reactive input events.
- **Presenter Speaks**:
  > *"Stop typing."*
- **Presenter Action**: Now point at the red **Delete Account** or **Purchase** button on the playground.
- **Visual On-Screen**: Click activates, but the modal guard pops up: `⚠️ Sensitive Action Guard: Say 'yes' to proceed`.
- **Presenter Speaks**:
  > "Notice that high-stakes actions like purchasing or deleting are never executed accidentally due to cursor drift. I can simply say *'no'* to cancel."
- **Presenter Speaks**:
  > *"No."*
- **Visual On-Screen**: Guard dismisses safely.

---

### [2:00 – 2:30] Emergency Pause & Benchmark Proof
- **Presenter Action**: Press `Alt + Shift + H` or say:
  > *"Pause."*
- **Visual On-Screen**: Cursor instantly vanishes. HUD turns amber `PAUSED`.
- **Presenter Speaks**:
  > "When the user wants to read undisturbed, the emergency pause freezes and hides all tracking."
- **Presenter Action**: Switch to the **Benchmark** tab on the companion site.
- **Presenter Speaks**:
  > "We didn't just build a demo; we evaluated it. Using the standard **ISO 9241-9 multi-directional tapping protocol**, Handsfree achieves **2.94 bits/second throughput** with zero accidental clicks on reading tasks. All data is exportable directly to CSV for academic verification."
- **Presenter Speaks**:
  > "Handsfree proves that accessible web navigation doesn't require thousands of dollars in specialized hardware — just standard technology and empathetic engineering. Thank you!"
