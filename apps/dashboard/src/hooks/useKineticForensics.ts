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

// Calibration
const CALIBRATION_FRAMES = 60; // ~2 seconds at 30fps
const SHIELDING_THRESHOLD = 0.20; // 20% decrease = huddle
const DITHERING_WINDOW = 30; // frames to track for tremor analysis (~1sec at 30fps)

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

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
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

    // ── Micro-Dithering (Hand Tremor via Frame Differencing) ──
    // Track wrist positions and compute high-frequency variance
    const leftWrist = { x: lm[LEFT_WRIST].x, y: lm[LEFT_WRIST].y };
    const rightWrist = { x: lm[RIGHT_WRIST].x, y: lm[RIGHT_WRIST].y };

    leftWristHistoryRef.current.push(leftWrist);
    rightWristHistoryRef.current.push(rightWrist);

    // Keep only the last DITHERING_WINDOW frames
    if (leftWristHistoryRef.current.length > DITHERING_WINDOW) {
      leftWristHistoryRef.current = leftWristHistoryRef.current.slice(-DITHERING_WINDOW);
    }
    if (rightWristHistoryRef.current.length > DITHERING_WINDOW) {
      rightWristHistoryRef.current = rightWristHistoryRef.current.slice(-DITHERING_WINDOW);
    }

    // Calculate frame-to-frame displacement variance (proxy for 4-12 Hz tremor)
    // Landmarks are in normalized 0-1 coords; typical frame deltas are ~0.001-0.02
    let leftTremor = 0;
    let rightTremor = 0;

    if (leftWristHistoryRef.current.length >= 10) {
      const leftDeltas: number[] = [];
      for (let i = 1; i < leftWristHistoryRef.current.length; i++) {
        leftDeltas.push(dist2D(leftWristHistoryRef.current[i], leftWristHistoryRef.current[i - 1]));
      }
      // Variance of deltas: typical range ~0.000001-0.0001 for still hands
      // Multiply by 100000 to get into 0-1 readable range, cap at 1
      leftTremor = Math.min(1, computeVariance(leftDeltas) * 100000);

      const rightDeltas: number[] = [];
      for (let i = 1; i < rightWristHistoryRef.current.length; i++) {
        rightDeltas.push(dist2D(rightWristHistoryRef.current[i], rightWristHistoryRef.current[i - 1]));
      }
      rightTremor = Math.min(1, computeVariance(rightDeltas) * 100000);
    }

    const avgTremor = (leftTremor + rightTremor) / 2;
    // Threshold: 0.3+ on normalized scale = significant micro-jitter
    const isTremoring = avgTremor > 0.3;

    // ── Torso Forward Lean ──
    // Approximate forward lean as angle between shoulder midpoint and hip midpoint
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
        ctx.fillText(`SR: ${currentRatio.toFixed(2)} ${isHuddling ? "⚠ HUDDLE" : ""}`, midElbow.x, midElbow.y);

        // Draw tremor indicators at wrists
        if (isTremoring) {
          for (const wIdx of [LEFT_WRIST, RIGHT_WRIST]) {
            ctx.beginPath();
            ctx.arc(lm[wIdx].x * w, lm[wIdx].y * h, 12, 0, 2 * Math.PI);
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
