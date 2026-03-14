"use client";
import { useRef, useCallback, useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Remote Photoplethysmography (rPPG) via POS Algorithm
// & Eulerian Video Magnification (EVM) for Carotid Pulse
//
// Uses the existing FaceLandmarker results to define ROI,
// then samples Green channel from the video canvas.
// ──────────────────────────────────────────────

// MediaPipe Face Landmark indices for ROI regions
// Forehead ROI (above eyebrows):  landmarks 10, 338, 297, 67
// Left Cheek: 50, 205, 36, 101
// Right Cheek: 280, 425, 266, 331
// Neck/Jaw bottom: 152, 377, 400, 148, 176

const FOREHEAD = [10, 338, 297, 67];
const LEFT_CHEEK = [50, 205, 36, 101];
const RIGHT_CHEEK = [280, 425, 266, 331];
const NECK_REGION = [152, 377, 400, 148]; // jaw line for carotid

// Signal processing params
const SAMPLE_RATE = 30; // fps
const BUFFER_SIZE = 300; // 10 seconds at 30fps
const BPM_MIN = 40;
const BPM_MAX = 180;
const FREQ_MIN = BPM_MIN / 60; // 0.667 Hz
const FREQ_MAX = BPM_MAX / 60; // 3.0 Hz

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export interface CardiacMetrics {
  heartRate: number;          // estimated BPM
  heartRateConfidence: number; // 0-1 signal quality
  signalQuality: number;      // rPPG signal SNR proxy
  plethWaveform: number[];    // recent filtered pulse signal (for plotting)
  
  // ROI info
  roiForehead: { x: number; y: number; w: number; h: number } | null;
  roiCheek: { x: number; y: number; w: number; h: number } | null;
  roiNeck: { x: number; y: number; w: number; h: number } | null;
  
  // EVM Carotid
  carotidPulseStrength: number; // amplified motion magnitude
  carotidVisible: boolean;
  
  // Status
  isProcessing: boolean;
  samplesCollected: number;
  requiredSamples: number;    // ~90 frames = 3 seconds minimum
}

export const DEFAULT_CARDIAC: CardiacMetrics = {
  heartRate: 0, heartRateConfidence: 0, signalQuality: 0,
  plethWaveform: [],
  roiForehead: null, roiCheek: null, roiNeck: null,
  carotidPulseStrength: 0, carotidVisible: false,
  isProcessing: true, samplesCollected: 0, requiredSamples: 90,
};

// ──────────────────────────────────────────────
// Signal Processing Helpers
// ──────────────────────────────────────────────

/** Simple bandpass filter using moving average subtraction */
function bandpassFilter(signal: number[], lowCutoff: number, highCutoff: number, sampleRate: number): number[] {
  // High-pass: subtract moving average (window = 1/lowCutoff)
  const highPassWindow = Math.round(sampleRate / lowCutoff);
  const highPassed = signal.map((v, i) => {
    const start = Math.max(0, i - highPassWindow);
    const window = signal.slice(start, i + 1);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    return v - avg;
  });

  // Low-pass: moving average (window = 1/highCutoff)
  const lowPassWindow = Math.max(2, Math.round(sampleRate / highCutoff));
  const filtered: number[] = [];
  for (let i = 0; i < highPassed.length; i++) {
    const start = Math.max(0, i - lowPassWindow + 1);
    const window = highPassed.slice(start, i + 1);
    filtered.push(window.reduce((a, b) => a + b, 0) / window.length);
  }

  return filtered;
}

/** Estimate dominant frequency using zero-crossing rate */
function estimateHeartRate(signal: number[], sampleRate: number): { bpm: number; confidence: number } {
  if (signal.length < 30) return { bpm: 0, confidence: 0 };

  // Count zero crossings to estimate frequency
  let zeroCrossings = 0;
  for (let i = 1; i < signal.length; i++) {
    if ((signal[i] >= 0 && signal[i - 1] < 0) || (signal[i] < 0 && signal[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }

  const durationSec = signal.length / sampleRate;
  const freqHz = zeroCrossings / (2 * durationSec); // zero crossings = 2x frequency
  const bpm = freqHz * 60;

  // Also do peak counting for cross-validation
  let peaks = 0;
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1] && signal[i] > 0) {
      peaks++;
    }
  }
  const peakBpm = (peaks / durationSec) * 60;

  // Use average of both methods, constrained to valid range
  const avgBpm = (bpm + peakBpm) / 2;
  const clampedBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, avgBpm));

  // Confidence based on agreement between methods and signal strength
  const agreement = 1 - Math.min(1, Math.abs(bpm - peakBpm) / 40);
  // Signal amplitude: POS values are small fractions, typical good signal ~0.001-0.01
  const meanAbs = signal.reduce((a, b) => a + Math.abs(b), 0) / signal.length;
  const signalStrength = Math.min(1, Math.max(0, meanAbs * 500));
  // Also factor in whether BPM is in a reasonable range
  const rangeBonus = (clampedBpm >= 50 && clampedBpm <= 150) ? 1 : 0.5;
  const confidence = Math.min(1, agreement * Math.max(0.1, signalStrength) * rangeBonus);

  return { bpm: Math.round(clampedBpm), confidence: Math.round(confidence * 100) / 100 };
}

/** POS Algorithm: Plane-Orthogonal-to-Skin
 *  Extracts pulse signal from RGB channels by projecting onto a plane
 *  orthogonal to the skin tone vector */
function posAlgorithm(rSignal: number[], gSignal: number[], bSignal: number[]): number[] {
  const n = rSignal.length;
  if (n < 2) return [];

  const pulse: number[] = [];

  for (let i = 0; i < n; i++) {
    const r = rSignal[i] || 1;
    const g = gSignal[i] || 1;
    const b = bSignal[i] || 1;

    // Normalize
    const mean = (r + g + b) / 3;
    const rn = r / mean;
    const gn = g / mean;
    const bn = b / mean;

    // POS projection: S1 = G - B, S2 = G + B - 2R
    // The pulse signal is primarily in S1 (Green dominates hemoglobin absorption)
    const s1 = gn - bn;
    const s2 = gn + bn - 2 * rn;

    // Combine: pulse = S1 + α*S2 where α = std(S1)/std(S2)
    // For simplicity in real-time: weight Green channel highest
    pulse.push(s1 + 0.5 * s2);
  }

  return pulse;
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useCardiacForensics() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [metrics, setMetrics] = useState<CardiacMetrics>(DEFAULT_CARDIAC);

  // Signal buffers
  const rBufferRef = useRef<number[]>([]);
  const gBufferRef = useRef<number[]>([]);
  const bBufferRef = useRef<number[]>([]);
  const neckIntensityRef = useRef<number[]>([]);

  // Face landmarks cache (updated by external caller)
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null);

  // Create sampling canvas on mount
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    samplingCanvasRef.current = c;
  }, []);

  /** Update face landmarks from external FaceLandmarker */
  const setLandmarks = useCallback((lm: { x: number; y: number }[] | null) => {
    landmarksRef.current = lm;
  }, []);

  /** Get bounding box from landmark indices */
  const getLandmarkROI = useCallback((
    landmarks: { x: number; y: number }[],
    indices: number[],
    videoW: number,
    videoH: number
  ) => {
    const xs = indices.map((i) => landmarks[i]?.x ?? 0).filter((v) => v > 0);
    const ys = indices.map((i) => landmarks[i]?.y ?? 0).filter((v) => v > 0);
    if (xs.length < 2 || ys.length < 2) return null;

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: Math.round(minX * videoW),
      y: Math.round(minY * videoH),
      w: Math.round((maxX - minX) * videoW),
      h: Math.round((maxY - minY) * videoH),
    };
  }, []);

  /** Sample average RGB from a region of the video */
  const sampleROI = useCallback((
    video: HTMLVideoElement,
    roi: { x: number; y: number; w: number; h: number }
  ): { r: number; g: number; b: number } | null => {
    const canvas = samplingCanvasRef.current;
    if (!canvas || roi.w < 4 || roi.h < 4) return null;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // Draw just the ROI region to the tiny canvas
    const sw = Math.min(roi.w, 80);
    const sh = Math.min(roi.h, 60);
    ctx.drawImage(video, roi.x, roi.y, roi.w, roi.h, 0, 0, sw, sh);

    const imageData = ctx.getImageData(0, 0, sw, sh);
    const data = imageData.data;
    let rSum = 0, gSum = 0, bSum = 0;
    const pixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
    }

    return { r: rSum / pixels, g: gSum / pixels, b: bSum / pixels };
  }, []);

  /** Process a single video frame */
  const processFrame = useCallback((video: HTMLVideoElement, _timestamp: number) => {
    const landmarks = landmarksRef.current;
    if (!landmarks || video.readyState < 2) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Get ROI regions from face landmarks
    const foreheadROI = getLandmarkROI(landmarks, FOREHEAD, vw, vh);
    const leftCheekROI = getLandmarkROI(landmarks, LEFT_CHEEK, vw, vh);
    const rightCheekROI = getLandmarkROI(landmarks, RIGHT_CHEEK, vw, vh);
    const neckROI = getLandmarkROI(landmarks, NECK_REGION, vw, vh);

    // Merge cheeks into one ROI for display
    const cheekROI = leftCheekROI && rightCheekROI ? {
      x: Math.min(leftCheekROI.x, rightCheekROI.x),
      y: Math.min(leftCheekROI.y, rightCheekROI.y),
      w: Math.max(leftCheekROI.x + leftCheekROI.w, rightCheekROI.x + rightCheekROI.w) - Math.min(leftCheekROI.x, rightCheekROI.x),
      h: Math.max(leftCheekROI.y + leftCheekROI.h, rightCheekROI.y + rightCheekROI.h) - Math.min(leftCheekROI.y, rightCheekROI.y),
    } : null;

    // ── Sample RGB from forehead (primary) and cheeks (secondary) ──
    const foreheadSample = foreheadROI ? sampleROI(video, foreheadROI) : null;
    const leftCheekSample = leftCheekROI ? sampleROI(video, leftCheekROI) : null;
    const rightCheekSample = rightCheekROI ? sampleROI(video, rightCheekROI) : null;

    // Average the samples (forehead weighted 2x)
    const samples = [foreheadSample, foreheadSample, leftCheekSample, rightCheekSample].filter(Boolean) as { r: number; g: number; b: number }[];
    if (samples.length === 0) return;

    const avgR = samples.reduce((a, s) => a + s.r, 0) / samples.length;
    const avgG = samples.reduce((a, s) => a + s.g, 0) / samples.length;
    const avgB = samples.reduce((a, s) => a + s.b, 0) / samples.length;

    // Push to buffers
    rBufferRef.current.push(avgR);
    gBufferRef.current.push(avgG);
    bBufferRef.current.push(avgB);

    // Trim to BUFFER_SIZE
    if (rBufferRef.current.length > BUFFER_SIZE) {
      rBufferRef.current = rBufferRef.current.slice(-BUFFER_SIZE);
      gBufferRef.current = gBufferRef.current.slice(-BUFFER_SIZE);
      bBufferRef.current = bBufferRef.current.slice(-BUFFER_SIZE);
    }

    // ── Neck ROI for EVM Carotid Pulse ──
    const neckSample = neckROI ? sampleROI(video, neckROI) : null;
    if (neckSample) {
      neckIntensityRef.current.push(neckSample.g); // Green channel for pulse
      if (neckIntensityRef.current.length > BUFFER_SIZE) {
        neckIntensityRef.current = neckIntensityRef.current.slice(-BUFFER_SIZE);
      }
    }

    const samplesCollected = rBufferRef.current.length;
    const requiredSamples = 90; // 3 seconds

    if (samplesCollected < requiredSamples) {
      setMetrics((prev) => ({
        ...prev,
        isProcessing: true,
        samplesCollected,
        requiredSamples,
        roiForehead: foreheadROI,
        roiCheek: cheekROI,
        roiNeck: neckROI,
      }));
      return;
    }

    // ── POS Algorithm ──
    const posSignal = posAlgorithm(rBufferRef.current, gBufferRef.current, bBufferRef.current);

    // ── Bandpass Filter (0.75 – 3.0 Hz = 45–180 BPM) ──
    const filtered = bandpassFilter(posSignal, FREQ_MIN, FREQ_MAX, SAMPLE_RATE);

    // ── Estimate Heart Rate ──
    // Use last 5 seconds of data for estimation
    const recentFiltered = filtered.slice(-150);
    const { bpm, confidence } = estimateHeartRate(recentFiltered, SAMPLE_RATE);

    // ── Signal Quality ──
    const signalVariance = recentFiltered.length > 0
      ? recentFiltered.reduce((a, b) => a + b * b, 0) / recentFiltered.length
      : 0;
    const signalQuality = Math.min(1, Math.max(0, signalVariance * 5000));

    // ── EVM Carotid Pulse Analysis ──
    let carotidPulseStrength = 0;
    let carotidVisible = false;
    if (neckIntensityRef.current.length >= requiredSamples) {
      // Normalize neck signal before filtering: subtract mean
      const neckData = neckIntensityRef.current;
      const neckMean = neckData.reduce((a, b) => a + b, 0) / neckData.length;
      const normalizedNeck = neckData.map((v) => (v - neckMean) / (neckMean || 1));
      const neckFiltered = bandpassFilter(normalizedNeck, FREQ_MIN, FREQ_MAX, SAMPLE_RATE);
      const recentNeck = neckFiltered.slice(-150);
      const neckVariance = recentNeck.length > 0
        ? recentNeck.reduce((a, b) => a + b * b, 0) / recentNeck.length
        : 0;
      // Scale to 0-1 range: typical normalized variance is ~0.00001-0.001
      carotidPulseStrength = Math.min(1, neckVariance * 5000);
      carotidVisible = carotidPulseStrength > 0.15;
    }

    // ── Waveform for visualization (last 3 seconds, normalized) ──
    const waveform = recentFiltered.slice(-90);
    const wMax = Math.max(...waveform.map(Math.abs), 0.001);
    const normalizedWaveform = waveform.map((v) => v / wMax);

    // ── Draw ROI overlays on canvas ──
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const drawROI = (roi: { x: number; y: number; w: number; h: number }, color: string, label: string) => {
          const scaleX = canvas.width / vw;
          const scaleY = canvas.height / vh;
          const rx = roi.x * scaleX;
          const ry = roi.y * scaleY;
          const rw = roi.w * scaleX;
          const rh = roi.h * scaleY;

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.setLineDash([]);

          // Semi-transparent fill
          ctx.fillStyle = color.replace(")", ", 0.08)").replace("rgb", "rgba");
          ctx.fillRect(rx, ry, rw, rh);

          // Label
          ctx.font = "9px monospace";
          ctx.fillStyle = color;
          ctx.fillText(label, rx + 2, ry - 3);
        };

        if (foreheadROI) drawROI(foreheadROI, "rgb(34, 197, 94)", `rPPG ROI [G: ${avgG.toFixed(0)}]`);
        if (leftCheekROI) drawROI(leftCheekROI, "rgb(34, 197, 94)", "L-Cheek");
        if (rightCheekROI) drawROI(rightCheekROI, "rgb(34, 197, 94)", "R-Cheek");
        if (neckROI) drawROI(neckROI, "rgb(168, 85, 247)", `EVM Carotid [${carotidPulseStrength.toFixed(2)}]`);

        // Draw mini pulse waveform in top area
        if (normalizedWaveform.length > 10) {
          const waveX = 4;
          const waveY = canvas.height - 35;
          const waveW = 120;
          const waveH = 25;

          // Background
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(waveX - 2, waveY - 2, waveW + 4, waveH + 4);

          // Waveform line
          ctx.beginPath();
          for (let i = 0; i < normalizedWaveform.length; i++) {
            const x = waveX + (i / normalizedWaveform.length) * waveW;
            const y = waveY + waveH / 2 - normalizedWaveform[i] * (waveH / 2) * 0.8;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // BPM label
          ctx.font = "bold 10px monospace";
          ctx.fillStyle = confidence > 0.3 ? "#22c55e" : "#f59e0b";
          ctx.fillText(`♥ ${bpm} BPM`, waveX + waveW + 6, waveY + waveH / 2 + 4);
        }
      }
    }

    setMetrics({
      heartRate: bpm,
      heartRateConfidence: confidence,
      signalQuality,
      plethWaveform: normalizedWaveform,
      roiForehead: foreheadROI,
      roiCheek: cheekROI,
      roiNeck: neckROI,
      carotidPulseStrength,
      carotidVisible,
      isProcessing: false,
      samplesCollected,
      requiredSamples,
    });
  }, [getLandmarkROI, sampleROI]);

  return { metrics, processFrame, setLandmarks, canvasRef };
}
