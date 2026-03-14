"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// ──────────────────────────────────────────────
// MediaPipe Pose Landmark Indices (33 landmarks)
// ──────────────────────────────────────────────
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_INDEX = 19;
const RIGHT_INDEX = 20;

// Calibration
const CALIBRATION_FRAMES = 60; // ~2 seconds at 30fps
const SHIELDING_THRESHOLD = 0.20; // 20% decrease = huddle
const DITHERING_WINDOW = 90; // 3 seconds at 30fps — long enough for 3-4 Hz tremor cycles

// Tremor processing
const TREMOR_FREQ_LOW = 3.0;   // Hz — lower bound of physiological tremor band
const TREMOR_FREQ_HIGH = 15.0; // Hz — upper bound (Nyquist is 15 Hz at 30fps)
const TREMOR_SMOOTHING = 0.12; // EMA factor for tremor output
const TREMOR_THRESHOLD = 0.4;  // threshold for isTremoring
const TREMOR_HYSTERESIS_FRAMES = 5; // must exceed threshold for N consecutive frames

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export interface KineticMetrics {
  // Shielding
  currentShieldingRatio: number;
  baselineShieldingRatio: number;
  shieldingDrop: number; // percentage drop from baseline
  isHuddling: boolean;

  // Micro-Dithering (Hand Tremor)
  leftHandTremor: number;
  rightHandTremor: number;
  avgTremor: number;
  isTremoring: boolean;

  // Posture
  shoulderWidth: number;
  elbowWidth: number;
  torsoLean: number; // forward lean angle

  // Status
  bodyDetected: boolean;
  isCalibrating: boolean;
  calibrationProgress: number; // 0-100%
  confidence: number;
}

export const DEFAULT_KINETIC: KineticMetrics = {
  currentShieldingRatio: 1, baselineShieldingRatio: 1, shieldingDrop: 0, isHuddling: false,
  leftHandTremor: 0, rightHandTremor: 0, avgTremor: 0, isTremoring: false,
  shoulderWidth: 0, elbowWidth: 0, torsoLean: 0,
  bodyDetected: false, isCalibrating: true, calibrationProgress: 0, confidence: 0,
};

// ──────────────────────────────────────────────
// Math Helpers
// ──────────────────────────────────────────────
function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * 2nd-order Butterworth IIR Bandpass for tremor isolation.
 * Cascade of high-pass (lowCut) then low-pass (highCut), applied forward+reverse (zero-phase).
 */
function butterBandpass(signal: number[], lowCut: number, highCut: number, fs: number): number[] {
  if (signal.length < 6) return signal.slice();

  function lpCoeffs(cutoff: number) {
    const omega = 2 * Math.PI * cutoff / fs;
    const cosW = Math.cos(omega);
    const sinW = Math.sin(omega);
    const alpha = sinW / (2 * Math.SQRT2);
    const a0 = 1 + alpha;
    return {
      b0: ((1 - cosW) / 2) / a0, b1: (1 - cosW) / a0, b2: ((1 - cosW) / 2) / a0,
      a1: (-2 * cosW) / a0, a2: (1 - alpha) / a0,
    };
  }
  function hpCoeffs(cutoff: number) {
    const omega = 2 * Math.PI * cutoff / fs;
    const cosW = Math.cos(omega);
    const sinW = Math.sin(omega);
    const alpha = sinW / (2 * Math.SQRT2);
    const a0 = 1 + alpha;
    return {
      b0: ((1 + cosW) / 2) / a0, b1: (-(1 + cosW)) / a0, b2: ((1 + cosW) / 2) / a0,
      a1: (-2 * cosW) / a0, a2: (1 - alpha) / a0,
    };
  }
  function applyBiquad(x: number[], c: { b0: number; b1: number; b2: number; a1: number; a2: number }): number[] {
    const y = new Array(x.length);
    let z1 = 0, z2 = 0;
    for (let i = 0; i < x.length; i++) {
      const yi = c.b0 * x[i] + z1;
      z1 = c.b1 * x[i] - c.a1 * yi + z2;
      z2 = c.b2 * x[i] - c.a2 * yi;
      y[i] = yi;
    }
    return y;
  }
  function filtfilt(x: number[], c: { b0: number; b1: number; b2: number; a1: number; a2: number }): number[] {
    const fwd = applyBiquad(x, c);
    fwd.reverse();
    const rev = applyBiquad(fwd, c);
    rev.reverse();
    return rev;
  }

  // Clamp highCut to Nyquist
  const nyquist = fs / 2;
  const safeHigh = Math.min(highCut, nyquist * 0.95);

  let out = filtfilt(signal, hpCoeffs(lowCut));
  out = filtfilt(out, lpCoeffs(safeHigh));
  return out;
}

/**
 * Compute RMS (root mean square) of an array.
 */
function computeRMS(values: number[]): number {
  if (values.length === 0) return 0;
  const sumSq = values.reduce((a, b) => a + b * b, 0);
  return Math.sqrt(sumSq / values.length);
}

/**
 * Compute tremor magnitude from a wrist position history.
 * 1. Compute frame-to-frame displacement
 * 2. Bandpass filter the displacement signal to isolate 3–15 Hz tremor
 * 3. Compute RMS of filtered signal
 * 4. Subtract noise floor baseline and normalize
 */
function computeTremorMagnitude(
  history: { x: number; y: number }[],
  noiseFloor: number,
  fs: number
): number {
  if (history.length < 20) return 0;

  // Frame-to-frame displacements
  const displacements: number[] = [];
  for (let i = 1; i < history.length; i++) {
    displacements.push(dist2D(history[i], history[i - 1]));
  }

  // Subtract mean to center the signal (removes DC offset from steady drift)
  const mean = displacements.reduce((a, b) => a + b, 0) / displacements.length;
  const centered = displacements.map(d => d - mean);

  // Bandpass filter to isolate 3-15 Hz tremor band
  const filtered = butterBandpass(centered, TREMOR_FREQ_LOW, TREMOR_FREQ_HIGH, fs);

  // RMS of filtered signal
  const rms = computeRMS(filtered);

  // Subtract noise floor (calibrated baseline jitter) and normalize
  // Typical MediaPipe jitter RMS after filtering: ~0.0005-0.002
  // Actual tremor RMS: ~0.005-0.02+
  const corrected = Math.max(0, rms - noiseFloor);

  // Normalize to 0-1 range: ~0.015 RMS maps to ~1.0
  const normalized = Math.min(1, corrected / 0.015);
  return normalized;
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useKineticForensics() {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [metrics, setMetrics] = useState<KineticMetrics>(DEFAULT_KINETIC);
  const [isReady, setIsReady] = useState(false);

  // Calibration state
  const calibrationRatiosRef = useRef<number[]>([]);
  const baselineRef = useRef<number | null>(null);

  // Hand position history for frame differencing (micro-dithering)
  const leftWristHistoryRef = useRef<{ x: number; y: number }[]>([]);
  const rightWristHistoryRef = useRef<{ x: number; y: number }[]>([]);

  // Tremor noise floor calibration
  const tremorNoiseFloorRef = useRef<number>(0.001); // default conservative noise floor
  const tremorCalibSamplesRef = useRef<number[]>([]);
  const tremorCalibDoneRef = useRef<boolean>(false);

  // EMA smoothed tremor
  const smoothedLeftTremorRef = useRef<number>(0);
  const smoothedRightTremorRef = useRef<number>(0);

  // Hysteresis counter for isTremoring
  const tremorConsecutiveRef = useRef<number>(0);

  // Initialize MediaPipe PoseLandmarker
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (!cancelled) {
          poseLandmarkerRef.current = poseLandmarker;
          setIsReady(true);
        }
      } catch (err) {
        console.error("Failed to initialize PoseLandmarker:", err);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Process a single video frame
  const processFrame = useCallback((video: HTMLVideoElement, timestamp: number) => {
    const poseLandmarker = poseLandmarkerRef.current;
    if (!poseLandmarker || video.readyState < 2) return;

    const results = poseLandmarker.detectForVideo(video, timestamp);

    if (!results.landmarks || results.landmarks.length === 0) {
      setMetrics((prev) => ({ ...prev, bodyDetected: false, confidence: 0 }));
      return;
    }

    const lm = results.landmarks[0];

    // Check key landmarks are visible (visibility > 0.5)
    const keyLandmarks = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST];
    const avgVisibility = keyLandmarks.reduce((sum, idx) => sum + (lm[idx]?.visibility || 0), 0) / keyLandmarks.length;
    if (avgVisibility < 0.3) {
      setMetrics((prev) => ({ ...prev, bodyDetected: false, confidence: avgVisibility }));
      return;
    }

    // ── Shielding Ratio ──
    const shoulderWidth = dist2D(lm[LEFT_SHOULDER], lm[RIGHT_SHOULDER]);
    const elbowWidth = dist2D(lm[LEFT_ELBOW], lm[RIGHT_ELBOW]);
    const currentRatio = shoulderWidth > 0 ? elbowWidth / shoulderWidth : 1;

    // ── Calibration Phase ──
    let isCalibrating = baselineRef.current === null;
    let calibrationProgress = 0;
    let baselineRatio = baselineRef.current || 1;

    if (isCalibrating) {
      calibrationRatiosRef.current.push(currentRatio);
      calibrationProgress = Math.min(100, (calibrationRatiosRef.current.length / CALIBRATION_FRAMES) * 100);

      if (calibrationRatiosRef.current.length >= CALIBRATION_FRAMES) {
        // Set baseline as mean of calibration samples
        baselineRatio = calibrationRatiosRef.current.reduce((a, b) => a + b, 0) / calibrationRatiosRef.current.length;
        baselineRef.current = baselineRatio;
        isCalibrating = false;
      }
    } else {
      baselineRatio = baselineRef.current!;
    }

    // ── Huddle Detection ──
    const shieldingDrop = baselineRatio > 0 ? Math.max(0, (baselineRatio - currentRatio) / baselineRatio) : 0;
    const isHuddling = !isCalibrating && shieldingDrop > SHIELDING_THRESHOLD;

    // ── Micro-Dithering (Hand Tremor — Bandpass-Filtered Displacement) ──
    const noiseFloor = tremorNoiseFloorRef.current;
    let rawLeftTremor = 0;
    let rawRightTremor = 0;

    const leftHandVisible = (lm[LEFT_INDEX]?.visibility || 0) > 0.5;
    const rightHandVisible = (lm[RIGHT_INDEX]?.visibility || 0) > 0.5;

    if (leftHandVisible) {
      const leftHand = { x: lm[LEFT_INDEX].x, y: lm[LEFT_INDEX].y };
      leftWristHistoryRef.current.push(leftHand);
      if (leftWristHistoryRef.current.length > DITHERING_WINDOW) {
        leftWristHistoryRef.current = leftWristHistoryRef.current.slice(-DITHERING_WINDOW);
      }
      rawLeftTremor = computeTremorMagnitude(leftWristHistoryRef.current, noiseFloor, 30);
    } else {
      leftWristHistoryRef.current = [];
    }

    if (rightHandVisible) {
      const rightHand = { x: lm[RIGHT_INDEX].x, y: lm[RIGHT_INDEX].y };
      rightWristHistoryRef.current.push(rightHand);
      if (rightWristHistoryRef.current.length > DITHERING_WINDOW) {
        rightWristHistoryRef.current = rightWristHistoryRef.current.slice(-DITHERING_WINDOW);
      }
      rawRightTremor = computeTremorMagnitude(rightWristHistoryRef.current, noiseFloor, 30);
    } else {
      rightWristHistoryRef.current = [];
    }

    // ── Noise floor calibration: first 60 frames establish baseline jitter ──
    const activeHistory = leftWristHistoryRef.current.length >= 20 ? leftWristHistoryRef.current : 
                          (rightWristHistoryRef.current.length >= 20 ? rightWristHistoryRef.current : null);

    if (!tremorCalibDoneRef.current && activeHistory) {
      // Collect raw RMS samples (without noise floor subtraction)
      const disp: number[] = [];
      for (let i = 1; i < activeHistory.length; i++) {
        disp.push(dist2D(activeHistory[i], activeHistory[i - 1]));
      }
      const mean = disp.reduce((a, b) => a + b, 0) / disp.length;
      const centered = disp.map(d => d - mean);
      const filtered = butterBandpass(centered, TREMOR_FREQ_LOW, TREMOR_FREQ_HIGH, 30);
      const rms = computeRMS(filtered);
      tremorCalibSamplesRef.current.push(rms);

      if (tremorCalibSamplesRef.current.length >= 30) {
        // Set noise floor as mean + 1 std of calibration RMS samples
        const calMean = tremorCalibSamplesRef.current.reduce((a, b) => a + b, 0) / tremorCalibSamplesRef.current.length;
        const calStd = Math.sqrt(
          tremorCalibSamplesRef.current.reduce((a, b) => a + (b - calMean) ** 2, 0) / tremorCalibSamplesRef.current.length
        );
        tremorNoiseFloorRef.current = calMean + calStd;
        tremorCalibDoneRef.current = true;
      }
    }

    // ── EMA Smoothing on tremor output ──
    let smoothedLeft = smoothedLeftTremorRef.current + TREMOR_SMOOTHING * (rawLeftTremor - smoothedLeftTremorRef.current);
    let smoothedRight = smoothedRightTremorRef.current + TREMOR_SMOOTHING * (rawRightTremor - smoothedRightTremorRef.current);
    
    // Instantly cut off tremor if hand goes off-camera
    if (!leftHandVisible) smoothedLeft = 0;
    if (!rightHandVisible) smoothedRight = 0;

    smoothedLeftTremorRef.current = smoothedLeft;
    smoothedRightTremorRef.current = smoothedRight;

    const leftTremor = Math.min(1, smoothedLeft);
    const rightTremor = Math.min(1, smoothedRight);
    const avgTremor = (leftTremor + rightTremor) / 2;

    // ── Hysteresis: require TREMOR_HYSTERESIS_FRAMES consecutive frames above threshold ──
    if (avgTremor > TREMOR_THRESHOLD) {
      tremorConsecutiveRef.current++;
    } else {
      tremorConsecutiveRef.current = 0;
    }
    const isTremoring = tremorConsecutiveRef.current >= TREMOR_HYSTERESIS_FRAMES;

    // ── Torso Forward Lean ──
    const shoulderMid = {
      x: (lm[LEFT_SHOULDER].x + lm[RIGHT_SHOULDER].x) / 2,
      y: (lm[LEFT_SHOULDER].y + lm[RIGHT_SHOULDER].y) / 2,
    };
    const hipMid = {
      x: (lm[LEFT_HIP].x + lm[RIGHT_HIP].x) / 2,
      y: (lm[LEFT_HIP].y + lm[RIGHT_HIP].y) / 2,
    };
    const dx = shoulderMid.x - hipMid.x;
    const dy = shoulderMid.y - hipMid.y;
    const torsoLean = Math.abs(Math.atan2(dx, -dy) * (180 / Math.PI)); // degrees from vertical

    // ── Draw Skeleton on Canvas ──
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const w = canvas.width;
        const h = canvas.height;

        // Draw skeleton connections
        const connections = [
          [LEFT_SHOULDER, RIGHT_SHOULDER],
          [LEFT_SHOULDER, LEFT_ELBOW],
          [RIGHT_SHOULDER, RIGHT_ELBOW],
          [LEFT_ELBOW, LEFT_WRIST],
          [RIGHT_ELBOW, RIGHT_WRIST],
          [LEFT_SHOULDER, LEFT_HIP],
          [RIGHT_SHOULDER, RIGHT_HIP],
          [LEFT_HIP, RIGHT_HIP],
        ];

        const skeletonColor = isHuddling ? "#ef4444" : isTremoring ? "#f59e0b" : "#10b981";

        for (const [a, b] of connections) {
          ctx.beginPath();
          ctx.moveTo(lm[a].x * w, lm[a].y * h);
          ctx.lineTo(lm[b].x * w, lm[b].y * h);
          ctx.strokeStyle = skeletonColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Draw key joints
        for (const idx of keyLandmarks) {
          ctx.beginPath();
          ctx.arc(lm[idx].x * w, lm[idx].y * h, 4, 0, 2 * Math.PI);
          ctx.fillStyle = skeletonColor;
          ctx.fill();
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw elbow-to-elbow measurement line
        ctx.beginPath();
        ctx.moveTo(lm[LEFT_ELBOW].x * w, lm[LEFT_ELBOW].y * h);
        ctx.lineTo(lm[RIGHT_ELBOW].x * w, lm[RIGHT_ELBOW].y * h);
        ctx.strokeStyle = isHuddling ? "rgba(239,68,68,0.8)" : "rgba(59,130,246,0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label the ratio
        const midElbow = {
          x: ((lm[LEFT_ELBOW].x + lm[RIGHT_ELBOW].x) / 2) * w,
          y: ((lm[LEFT_ELBOW].y + lm[RIGHT_ELBOW].y) / 2) * h - 8,
        };
        ctx.font = "10px monospace";
        ctx.fillStyle = isHuddling ? "#ef4444" : "#60a5fa";
        ctx.textAlign = "center";
        ctx.fillText(`SR: ${currentRatio.toFixed(2)} ${isHuddling ? "HUDDLE" : ""}`, midElbow.x, midElbow.y);

        // Draw tremor indicators at hands
        if (isTremoring) {
          if (leftHandVisible) {
            ctx.beginPath();
            ctx.arc(lm[LEFT_INDEX].x * w, lm[LEFT_INDEX].y * h, 12, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(245,158,11,0.7)";
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (rightHandVisible) {
            ctx.beginPath();
            ctx.arc(lm[RIGHT_INDEX].x * w, lm[RIGHT_INDEX].y * h, 12, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(245,158,11,0.7)";
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    }

    setMetrics({
      currentShieldingRatio: currentRatio,
      baselineShieldingRatio: baselineRatio,
      shieldingDrop: shieldingDrop * 100,
      isHuddling,
      leftHandTremor: leftTremor,
      rightHandTremor: rightTremor,
      avgTremor,
      isTremoring,
      shoulderWidth,
      elbowWidth,
      torsoLean,
      bodyDetected: true,
      isCalibrating,
      calibrationProgress,
      confidence: avgVisibility,
    });
  }, []);

  return { metrics, processFrame, canvasRef, isReady };
}
