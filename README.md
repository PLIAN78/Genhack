# Security Copilot

Security Copilot is a multimodal computer vision system that analyzes behavioral and physiological signals from a standard camera feed to identify indicators associated with potential deception or high-risk interactions.

This project was developed during the **GenAI Genesis Hackathon at the University of Toronto**, targeting the **TD Track**. The motivation was to explore new approaches to **fraud detection**, particularly in light of recent large-scale fraud incidents reported in the financial sector involving TD.

Although our team was unable to present the project **in person at the hackathon**, we continued developing the prototype to demonstrate the architecture and technical approach.

The system focuses on extracting **real-time behavioral features** during remote interactions such as identity verification, digital onboarding, or financial support sessions.

A live [demo](https://genhack-h6lg.vercel.app/) of the prototype is available online.
---

# Problem

Fraud detection systems in financial institutions typically rely on:

- transaction anomaly detection
- behavioral profiling over historical data
- rule-based monitoring

However, these systems rarely incorporate **real-time behavioral signals from the user during an interaction**.

Security Copilot explores whether **computer vision and physiological signal extraction** can provide additional real-time signals that may correlate with deceptive or high-risk behavior.

---

# System Architecture

The system processes a live camera feed and extracts multimodal features that are fused into a real-time risk score.

Pipeline overview:

Camera Feed
↓
Face Detection / Landmark Tracking
↓
Feature Extraction
↓
Signal Processing
↓
Multimodal Fusion Model
↓
Risk Score + Indicator Breakdown


The system analyzes three primary modalities:

1. Ocular signals (eye behavior)
2. Kinetic signals (body motion)
3. Physiological signals (heart rate via rPPG)

---

# Computer Vision Pipeline

## Face and Landmark Detection

Facial landmarks are extracted using **MediaPipe Vision**.

Outputs include:

- eye landmarks
- iris position
- facial contour points
- head orientation

These landmarks are tracked across frames to compute behavioral features.

---

# Ocular Signal Modeling

Eye behavior provides signals related to cognitive load and stress.

### Feature Extraction

**Blink Rate**

Blink events are detected using eyelid distance measurements.

blink_rate = number_of_blinks / time_window


Rapid increases in blink frequency may correlate with stress.

---

**Gaze Direction**

Gaze vectors are approximated using iris and eye corner landmarks.

gaze_vector = pupil_position − eye_center


The system measures:

- gaze deviation
- gaze stability
- gaze switching frequency

Repeated gaze avoidance may indicate discomfort or increased cognitive load.

---

**Saccadic Motion**

Rapid eye movement velocity is computed between frames:

saccade_velocity = |gaze_t − gaze_t−1|


High-frequency saccadic changes are treated as an instability indicator.

---

# Kinetic Signal Modeling

Body movement features are extracted using pose estimation and hand tracking.

### Feature Extraction

**Hand Tremor Detection**

Small oscillatory hand movements are measured using temporal variance.

tremor_score = variance(hand_position_t − hand_position_t−1)


Elevated tremor amplitude may correlate with stress.

---

**Defensive Gestures**

Relative body landmark positions are used to detect defensive posture patterns such as:

- arm crossing
- torso shielding
- hand-to-face gestures

---

**Postural Instability**

Changes in body orientation across frames are measured to detect repeated posture shifts.

---

# Physiological Signal Modeling (rPPG)

The system estimates heart rate using **remote photoplethysmography (rPPG)**.

rPPG detects subtle color fluctuations in skin caused by blood flow.

### Pipeline

face_region
↓
RGB signal extraction
↓
temporal band-pass filtering
↓
FFT frequency analysis
↓
heart rate estimation


Steps:

1. Extract facial region of interest
2. Track RGB intensity changes across frames
3. Apply temporal filtering
4. Use Fourier transform to identify pulse frequency

Elevated or rapidly changing heart rate may indicate physiological stress.

---

# Multimodal Fusion

Each modality produces a normalized score:

ocular_score
kinetic_score
physio_score


These scores are combined using a weighted fusion model:

risk_score =
w1 * ocular_score +
w2 * kinetic_score +
w3 * physio_score


Weights can be tuned using empirical calibration or supervised training.

The output includes:

- overall risk score
- modality contributions
- dominant behavioral indicators

Example output:

Risk Score: 0.71

Indicators:

elevated blink volatility

gaze deviation

heart rate spike


---

# Explainability

Instead of producing only a binary classification, the system exposes **feature-level contributions** from each modality.

This allows investigators or analysts to understand why a session was flagged.

Explainability is important for systems deployed in financial or regulatory environments.

---

# Technology Stack

Frontend

- React
- TypeScript
- Tailwind CSS
- MediaPipe Vision

Backend

- Python
- FastAPI

Signal Processing

- remote photoplethysmography
- temporal filtering
- frequency analysis
- multimodal feature fusion

---

# Limitations

This system is a **hackathon prototype** and has several limitations:

- behavioral signals are probabilistic
- environmental factors (lighting, camera quality) affect signal extraction
- ethical and privacy considerations must be addressed before deployment

The goal of the project was to demonstrate **technical feasibility and architecture**.

---

# Future Work

Potential improvements include:

- training a supervised multimodal model
- integrating behavioral signals with transaction anomaly detection
- improving rPPG robustness
- collecting labeled behavioral datasets
- deploying a scalable real-time inference pipeline



# Authors

Developed during the **GenAI Genesis Hackathon at the University of Toronto**.
