"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// ──────────────────────────────────────────────
// MediaPipe Face Mesh Landmark Indices
// ──────────────────────────────────────────────
// Left Eye Contour (for EAR):  p1=33, p2=160, p3=158, p4=133, p5=153, p6=144
// Right Eye Contour (for EAR): p1=362, p2=385, p3=387, p4=263, p5=373, p6=380
// Left Iris Center:  468
// Right Iris Center: 473
// Left Eye Corners:  33 (outer), 133 (inner)
// Right Eye Corners: 362 (inner), 263 (outer)
// Nose Tip: 1  (for head pose reference)

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const NOSE_TIP = 1;

// Thresholds
const EAR_BLINK_THRESHOLD = 0.21;
const PERIPHERAL_SWEEP_THRESHOLD = 30; // degrees
const BLINK_COOLDOWN_MS = 100;

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export interface OcularMetrics {
  // Gaze
  leftGazeRatio: number;
  rightGazeRatio: number;
  gazeDeviationDeg: number;
  isPeripheralSweep: boolean;
  gazeDirection: "center" | "left" | "right" | "up" | "down";

  // Blinks
  leftEAR: number;
  rightEAR: number;
  avgEAR: number;
  isBlinking: boolean;
  blinkCount: number;
  blinksPerMinute: number;
  blinkRateVolatility: number;

  // Saccadic
  saccadicSweepRate: number; // sweeps per minute
  sweepCount: number;

  // Status
  faceDetected: boolean;
  confidence: number;
}

const DEFAULT_METRICS: OcularMetrics = {
  leftGazeRatio: 0, rightGazeRatio: 0, gazeDeviationDeg: 0,
  isPeripheralSweep: false, gazeDirection: "center",
  leftEAR: 0, rightEAR: 0, avgEAR: 0,
  isBlinking: false, blinkCount: 0, blinksPerMinute: 0, blinkRateVolatility: 0,
  saccadicSweepRate: 0, sweepCount: 0,
  faceDetected: false, confidence: 0,
};

// ──────────────────────────────────────────────
// Math Helpers
// ──────────────────────────────────────────────
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function calculateEAR(landmarks: { x: number; y: number }[], indices: number[]): number {
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];
  const v1 = dist(p2, p6);
  const v2 = dist(p3, p5);
  const h = dist(p1, p4);
  return h > 0 ? (v1 + v2) / (2.0 * h) : 0;
}

function calculateGazeRatio(
  landmarks: { x: number; y: number }[],
  irisIdx: number,
  outerIdx: number,
  innerIdx: number
): number {
  const iris = landmarks[irisIdx];
  const outer = landmarks[outerIdx];
  const inner = landmarks[innerIdx];
  const eyeWidth = dist(outer, inner);
  if (eyeWidth === 0) return 0.5;
  const irisOffset = dist(outer, iris);
  return irisOffset / eyeWidth; // 0 = outer corner, 1 = inner corner, ~0.5 = center
}

function gazeRatioToAngle(ratio: number): number {
  // Map ratio deviation from center (0.5) to approximate angle
  // A ratio of 0.0 or 1.0 represents ~45° deviation
  const deviation = Math.abs(ratio - 0.5);
  return deviation * 90; // linear approximation: 0.5 deviation = 45°
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useOcularForensics() {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [metrics, setMetrics] = useState<OcularMetrics>(DEFAULT_METRICS);
  const [isReady, setIsReady] = useState(false);

  // Persistent tracking state (refs to avoid re-renders)
  const blinkCountRef = useRef(0);
  const sweepCountRef = useRef(0);
  const wasBlinkingRef = useRef(false);
  const lastBlinkTimeRef = useRef(0);
  const sessionStartRef = useRef(Date.now());
  const blinkTimestampsRef = useRef<number[]>([]);
  const sweepTimestampsRef = useRef<number[]>([]);
  const lastGazeRatioRef = useRef(0.5);
  const wasInSweepRef = useRef(false);
  const lastLandmarksRef = useRef<{ x: number; y: number }[] | null>(null);

  // Initialize MediaPipe FaceLandmarker
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          runningMode: "VIDEO",
          numFaces: 1,
        });

        if (!cancelled) {
          landmarkerRef.current = faceLandmarker;
          sessionStartRef.current = Date.now();
          setIsReady(true);
        }
      } catch (err) {
        console.error("Failed to initialize FaceLandmarker:", err);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Process a single video frame
  const processFrame = useCallback((video: HTMLVideoElement, timestamp: number) => {
    const landmarker = landmarkerRef.current;
    if (!landmarker || video.readyState < 2) return;

    const results = landmarker.detectForVideo(video, timestamp);

    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      setMetrics((prev) => ({ ...prev, faceDetected: false, confidence: 0 }));
      return;
    }

    const landmarks = results.faceLandmarks[0];
    lastLandmarksRef.current = landmarks;
    const now = Date.now();
    const sessionDurationMin = Math.max((now - sessionStartRef.current) / 60000, 0.0167); // min 1 second

    // ── EAR Calculation ──
    const leftEAR = calculateEAR(landmarks, LEFT_EYE);
    const rightEAR = calculateEAR(landmarks, RIGHT_EYE);
    const avgEAR = (leftEAR + rightEAR) / 2;

    // ── Blink Detection ──
    const isCurrentlyBlinking = avgEAR < EAR_BLINK_THRESHOLD;
    if (isCurrentlyBlinking && !wasBlinkingRef.current && (now - lastBlinkTimeRef.current > BLINK_COOLDOWN_MS)) {
      blinkCountRef.current += 1;
      lastBlinkTimeRef.current = now;
      blinkTimestampsRef.current.push(now);
    }
    wasBlinkingRef.current = isCurrentlyBlinking;

    // Clean old blink timestamps (keep last 60s)
    blinkTimestampsRef.current = blinkTimestampsRef.current.filter((t) => now - t < 60000);
    const blinksPerMinute = blinkTimestampsRef.current.length; // blinks in last 60s

    // ── Blink Rate Volatility ── (std dev of inter-blink intervals)
    let blinkRateVolatility = 0;
    const bts = blinkTimestampsRef.current;
    if (bts.length > 2) {
      const intervals = [];
      for (let i = 1; i < bts.length; i++) intervals.push(bts[i] - bts[i - 1]);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
      blinkRateVolatility = Math.sqrt(variance) / mean; // coefficient of variation
    }

    // ── Gaze Ratio (Iris Position) ──
    const leftGazeRatio = calculateGazeRatio(landmarks, LEFT_IRIS_CENTER, LEFT_EYE_OUTER, LEFT_EYE_INNER);
    const rightGazeRatio = calculateGazeRatio(landmarks, RIGHT_IRIS_CENTER, RIGHT_EYE_INNER, RIGHT_EYE_OUTER);
    const avgGazeRatio = (leftGazeRatio + rightGazeRatio) / 2;

    // ── Gaze Deviation in Degrees ──
    const gazeDeviationDeg = gazeRatioToAngle(avgGazeRatio);
    const isPeripheralSweep = gazeDeviationDeg > PERIPHERAL_SWEEP_THRESHOLD;

    // ── Saccadic Sweep Detection ──
    // A saccade is a rapid gaze shift > ~15° deviation from the previous position
    const gazeShift = Math.abs(avgGazeRatio - lastGazeRatioRef.current) * 90;
    if (gazeShift > 15 && !wasInSweepRef.current) {
      sweepCountRef.current += 1;
      sweepTimestampsRef.current.push(now);
      wasInSweepRef.current = true;
    } else if (gazeShift < 5) {
      wasInSweepRef.current = false;
    }
    lastGazeRatioRef.current = avgGazeRatio;

    // Clean old sweep timestamps (keep last 60s)
    sweepTimestampsRef.current = sweepTimestampsRef.current.filter((t) => now - t < 60000);
    const saccadicSweepRate = sweepTimestampsRef.current.length; // sweeps in last 60s

    // ── Gaze Direction Label ──
    let gazeDirection: OcularMetrics["gazeDirection"] = "center";
    if (avgGazeRatio < 0.35) gazeDirection = "right"; // mirrored camera
    else if (avgGazeRatio > 0.65) gazeDirection = "left";

    // ── Draw landmarks on overlay canvas ──
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const drawingUtils = new DrawingUtils(ctx);

        // Draw iris points
        const irisLandmarks = [landmarks[LEFT_IRIS_CENTER], landmarks[RIGHT_IRIS_CENTER]];
        for (const iris of irisLandmarks) {
          ctx.beginPath();
          ctx.arc(iris.x * canvas.width, iris.y * canvas.height, 3, 0, 2 * Math.PI);
          ctx.fillStyle = isPeripheralSweep ? "#ef4444" : "#10b981";
          ctx.fill();
        }

        // Draw eye contours
        const drawEye = (indices: number[], color: string) => {
          ctx.beginPath();
          for (let i = 0; i < indices.length; i++) {
            const p = landmarks[indices[i]];
            const x = p.x * canvas.width;
            const y = p.y * canvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        };
        const eyeColor = isCurrentlyBlinking ? "#eab308" : (isPeripheralSweep ? "#ef4444" : "#10b981");
        drawEye(LEFT_EYE, eyeColor);
        drawEye(RIGHT_EYE, eyeColor);

        // Draw gaze vector line from iris center
        const leftIris = landmarks[LEFT_IRIS_CENTER];
        const noseTip = landmarks[NOSE_TIP];
        ctx.beginPath();
        ctx.moveTo(leftIris.x * canvas.width, leftIris.y * canvas.height);
        ctx.lineTo(noseTip.x * canvas.width, noseTip.y * canvas.height);
        ctx.strokeStyle = isPeripheralSweep ? "rgba(239,68,68,0.6)" : "rgba(16,185,129,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    setMetrics({
      leftGazeRatio, rightGazeRatio, gazeDeviationDeg, isPeripheralSweep, gazeDirection,
      leftEAR, rightEAR, avgEAR, isBlinking: isCurrentlyBlinking,
      blinkCount: blinkCountRef.current, blinksPerMinute, blinkRateVolatility,
      saccadicSweepRate, sweepCount: sweepCountRef.current,
      faceDetected: true, confidence: 0.95,
    });
  }, []);

  return { metrics, processFrame, canvasRef, isReady, lastLandmarksRef };
}
