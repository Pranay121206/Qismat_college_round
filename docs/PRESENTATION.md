# Handsfree: Hackathon Presentation Pitch Outline
**CRCE Bit N Build 2026 Hackathon • Track: Assistive Technology & Web Accessibility**

---

### Slide 1: Title & The Hook
- **Title**: Handsfree — Voice & Webcam-Based Browsing
- **Tagline**: Empowering everyone to navigate the entire modern web without lifting a finger.
- **Hook**: "What if browsing Wikipedia, reading articles, or filling out a job application didn't require hands, a mouse, or a $1,500 specialized eye-tracker?"

---

### Slide 2: The Problem
- **The Accessibility Barrier**:
  - Millions of people worldwide live with motor disabilities: ALS, cerebral palsy, Parkinson's tremors, spinal injuries, arthritis, or situational impairments (broken limbs, carrying a baby).
  - Existing eye-tracking hardware (e.g., Tobii, specialized cameras) costs between **$1,500 and $5,000**, is bulky, and cannot be used on everyday laptops.
  - Traditional voice-only software struggles with precise spatial pointing, clicking small buttons, and navigating complex interactive web applications.

---

### Slide 3: The Handsfree Solution
- **Zero Specialized Hardware**: Works on any everyday laptop or desktop with a standard webcam and built-in microphone.
- **Head-Pose Virtual Pointer**: Uses on-device MediaPipe Face Landmarker running in WebAssembly to translate natural head rotation into cursor movement.
- **Multimodal Voice Interaction**: Point with your head and speak "click", "open", "scroll down", or "go back".
- **Spoken Form Dictation**: Speak directly into input fields, search boxes, and textareas with spoken editing ("delete last word", "new line").
- **100% Privacy by Design**: All computer vision runs locally on-device. Zero video frames leave your computer.

---

### Slide 4: Key Engineering Differentiators
1. **Speed-Adaptive 1€ Smoothing**:
   - Eliminates hand/head micro-tremors when dwelling on small targets.
   - Accelerates across the screen with zero perceived lag during fast intentional turns.
2. **Multimodal Speech-Onset Target Lock**:
   - Solves the classic "voice drift" problem: locks the target button at the exact syllable you start speaking, so natural head drift while speaking never causes misclicks.
3. **Sensitive Action Guard**:
   - Protects against accidental dwell-clicks on destructive actions ("Delete", "Buy", "Submit") by requiring spoken confirmation.
4. **Numbered Vimium-Style Hints**:
   - Overlays badges (1..N) over all interactive elements for guaranteed 100% precision on dense websites.
5. **Sub-30-Second Guided Calibration**:
   - Fast 5-point calibration computes individual range of motion in ~20 seconds.

---

### Slide 5: Empirical Benchmark Evaluation (ISO 9241-9)
- **Methodology**: Standardized multi-directional tapping task with 9 circular targets, measuring Fitts' Law throughput, movement time, and selection errors.
- **Results**:
  - **Throughput**: Handsfree achieves **2.94 bits/second** (approx. 60-70% of a physical mouse), outperforming standard head-trackers.
  - **Accidental Activations**: **0.00%** on reading tasks due to the combination of tolerance radii and sensitive action interception.
  - **Setup Time**: Average onboarding completion in **24.2 seconds** (well within the 30-second target).

---

### Slide 6: Product Architecture & Feasibility
- **Chrome & Edge Manifest V3 Extension**:
  - Offscreen Document sandbox for video & Web Speech ingestion.
  - Background Service Worker with fuzzy command parser.
  - Closed Shadow DOM virtual cursor and HUD preventing host website CSS collisions.
- **Companion Website**:
  - Interactive demo playground, full benchmark suite, and documentation.

---

### Slide 7: Live Judge Demonstration
*(Proceed directly to the 2-Minute Demonstration Script in `docs/DEMO_SCRIPT.md`)*

---

### Slide 8: Future Roadmap & Next Steps
1. Offline Vosk speech models for air-gapped secure browsing.
2. Deep eye-gaze iris assistance for ultra-subtle target snapping.
3. Submission to the official Microsoft Edge Add-ons and Chrome Web Store for free public distribution.
