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

// EMA smoothing factor for BPM (0 = no smoothing, 1 = no memory)
const BPM_SMOOTHING = 0.15;
// Maximum BPM jump before we snap instead of smoothing
const BPM_SNAP_THRESHOLD = 40;

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

/**
 * 2nd-order Butterworth IIR Bandpass Filter (cascaded biquad sections).
 * Pre-computes coefficients for a given low/high cutoff and sample rate,
 * then applies forward + reverse (zero-phase, filtfilt-like) for clean output.
 */
function butterworthBandpass(signal: number[], lowCut: number, highCut: number, sampleRate: number): number[] {
  if (signal.length < 6) return signal.slice();

  // ── Design 2nd-order Butterworth low-pass section ──
  function lpCoeffs(cutoff: number, fs: number) {
    const omega = 2 * Math.PI * cutoff / fs;
    const cosW = Math.cos(omega);
    const sinW = Math.sin(omega);
    const alpha = sinW / (2 * Math.SQRT2); // Q = sqrt(2)/2 for Butterworth
    const a0 = 1 + alpha;
    return {
      b0: ((1 - cosW) / 2) / a0,
      b1: (1 - cosW) / a0,
      b2: ((1 - cosW) / 2) / a0,
      a1: (-2 * cosW) / a0,
      a2: (1 - alpha) / a0,
    };
  }

  // ── Design 2nd-order Butterworth high-pass section ──
  function hpCoeffs(cutoff: number, fs: number) {
    const omega = 2 * Math.PI * cutoff / fs;
    const cosW = Math.cos(omega);
    const sinW = Math.sin(omega);
    const alpha = sinW / (2 * Math.SQRT2);
    const a0 = 1 + alpha;
    return {
      b0: ((1 + cosW) / 2) / a0,
      b1: (-(1 + cosW)) / a0,
      b2: ((1 + cosW) / 2) / a0,
      a1: (-2 * cosW) / a0,
      a2: (1 - alpha) / a0,
    };
  }

  // Apply a single biquad section (Direct Form II Transposed)
  function applyBiquad(x: number[], c: { b0: number; b1: number; b2: number; a1: number; a2: number }): number[] {
    const y = new Array(x.length);
    let z1 = 0, z2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const yi = c.b0 * xi + z1;
      z1 = c.b1 * xi - c.a1 * yi + z2;
      z2 = c.b2 * xi - c.a2 * yi;
      y[i] = yi;
    }
    return y;
  }

  // Zero-phase filtering: forward then reverse pass
  function filtfilt(x: number[], c: { b0: number; b1: number; b2: number; a1: number; a2: number }): number[] {
    const fwd = applyBiquad(x, c);
    fwd.reverse();
    const rev = applyBiquad(fwd, c);
    rev.reverse();
    return rev;
  }

  const hp = hpCoeffs(lowCut, sampleRate);
  const lp = lpCoeffs(highCut, sampleRate);

  // Chain: high-pass → low-pass (bandpass)
  let out = filtfilt(signal, hp);
  out = filtfilt(out, lp);
  return out;
}

/**
 * FFT-based heart rate estimation.
 * Applies a Hanning window, computes magnitude spectrum via DFT
 * (on the relevant cardiac frequency bins only for speed), and picks
 * the dominant peak. Confidence = spectral peak ratio.
 */
function estimateHeartRateFFT(signal: number[], sampleRate: number): { bpm: number; confidence: number } {
  const N = signal.length;
  if (N < 60) return { bpm: 0, confidence: 0 };

  // Apply Hanning window
  const windowed = signal.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))));

  // Compute DFT magnitude only for frequencies in [FREQ_MIN, FREQ_MAX]
  const freqResolution = sampleRate / N; // Hz per bin
  const binMin = Math.max(1, Math.floor(FREQ_MIN / freqResolution));
  const binMax = Math.min(Math.floor(N / 2), Math.ceil(FREQ_MAX / freqResolution));

  let maxMag = 0;
  let maxBin = binMin;
  let totalPower = 0;

  const mags: number[] = [];

  for (let k = binMin; k <= binMax; k++) {
    let re = 0, im = 0;
    const w = (-2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      re += windowed[n] * Math.cos(w * n);
      im += windowed[n] * Math.sin(w * n);
    }
    const mag = re * re + im * im; // power (magnitude squared)
    mags.push(mag);
    totalPower += mag;
    if (mag > maxMag) {
      maxMag = mag;
      maxBin = k;
    }
  }

  // Parabolic interpolation around peak for sub-bin accuracy
  const peakIdx = maxBin - binMin;
  let refinedBin = maxBin;
  if (peakIdx > 0 && peakIdx < mags.length - 1) {
    const alpha2 = mags[peakIdx - 1];
    const beta = mags[peakIdx];
    const gamma = mags[peakIdx + 1];
    const denom = alpha2 - 2 * beta + gamma;
    if (Math.abs(denom) > 1e-12) {
      refinedBin = maxBin + 0.5 * (alpha2 - gamma) / denom;
    }
  }

  const peakFreq = refinedBin * freqResolution;
  const bpm = peakFreq * 60;
  const clampedBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));

  // Confidence: ratio of peak power to total power in the cardiac band
  // A clean cardiac signal concentrates energy at a single frequency
  const peakRatio = totalPower > 0 ? maxMag / totalPower : 0;
  // Also boost confidence when peak is sharp (neighbors are much lower)
  let sharpness = 1;
  if (peakIdx > 0 && peakIdx < mags.length - 1) {
    const neighborAvg = (mags[peakIdx - 1] + mags[peakIdx + 1]) / 2;
    sharpness = maxMag > 0 ? Math.min(2, maxMag / (neighborAvg + 1e-12)) / 2 : 0;
  }
  // Combine: peakRatio dominates, sharpness boosts
  const rawConfidence = Math.min(1, peakRatio * 3 * sharpness);
  // Penalize out-of-range BPM
  const rangeBonus = (clampedBpm >= 50 && clampedBpm <= 150) ? 1 : 0.5;
  const confidence = Math.min(1, rawConfidence * rangeBonus);

  return { bpm: Math.round(clampedBpm), confidence: Math.round(confidence * 100) / 100 };
}

/**
 * Secondary validation via peak counting with minimum distance.
 * Returns BPM from inter-peak intervals for cross-validation.
 */
function peakCountBpm(signal: number[], sampleRate: number): number {
  if (signal.length < 30) return 0;

  // Minimum peak distance: at most BPM_MAX bpm → minimum gap
  const minDist = Math.floor((sampleRate * 60) / BPM_MAX); // ~10 samples at 30fps/180bpm

  // Amplitude threshold: peaks must exceed mean + 0.5*std
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const std = Math.sqrt(signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length);
  const threshold = mean + 0.5 * std;

  const peaks: number[] = [];
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1] && signal[i] > threshold) {
      if (peaks.length === 0 || (i - peaks[peaks.length - 1]) >= minDist) {
        peaks.push(i);
      }
    }
  }

  if (peaks.length < 2) return 0;

  // Average inter-peak interval
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = (sampleRate / avgInterval) * 60;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm)));
}

/** POS Algorithm: Plane-Orthogonal-to-Skin
 *  Extracts pulse signal from RGB channels by projecting onto a plane
 *  orthogonal to the skin tone vector.
 *  Uses adaptive alpha = std(S1)/std(S2) computed over sliding windows. */
function posAlgorithm(rSignal: number[], gSignal: number[], bSignal: number[]): number[] {
  const n = rSignal.length;
  if (n < 2) return [];

  const windowSize = Math.min(45, Math.floor(n / 2)); // ~1.5s window for adaptive alpha
  const pulse: number[] = [];

  for (let i = 0; i < n; i++) {
    const r = rSignal[i] || 1;
    const g = gSignal[i] || 1;
    const b = bSignal[i] || 1;

    // Normalize
    const norm = (r + g + b) / 3;
    const rn = r / norm;
    const gn = g / norm;
    const bn = b / norm;

    // POS projection: S1 = G - B, S2 = G + B - 2R
    const s1 = gn - bn;
    const s2 = gn + bn - 2 * rn;

    pulse.push(s1); // temporarily store S1; we'll combine with adaptive alpha below
  }

  // Compute S2 array
  const s2Arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = rSignal[i] || 1;
    const g = gSignal[i] || 1;
    const b = bSignal[i] || 1;
    const norm = (r + g + b) / 3;
    const rn = r / norm;
    const gn = g / norm;
    const bn = b / norm;
    s2Arr.push(gn + bn - 2 * rn);
  }

  // Now apply adaptive alpha: pulse[i] = S1[i] + alpha * S2[i]
  // where alpha = std(S1_window) / std(S2_window)
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    const wStart = Math.max(0, i - windowSize + 1);
    const wEnd = i + 1;

    // Compute std of S1 and S2 over the window
    let s1Sum = 0, s1SqSum = 0, s2Sum = 0, s2SqSum = 0;
    const wLen = wEnd - wStart;
    for (let j = wStart; j < wEnd; j++) {
      s1Sum += pulse[j];
      s1SqSum += pulse[j] * pulse[j];
      s2Sum += s2Arr[j];
      s2SqSum += s2Arr[j] * s2Arr[j];
    }
    const s1Std = Math.sqrt(Math.max(0, s1SqSum / wLen - (s1Sum / wLen) ** 2));
    const s2Std = Math.sqrt(Math.max(0, s2SqSum / wLen - (s2Sum / wLen) ** 2));

    const alpha = s2Std > 1e-10 ? s1Std / s2Std : 0.5;
    result.push(pulse[i] + alpha * s2Arr[i]);
  }

  return result;
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

  // EMA smoothed BPM
  const smoothedBpmRef = useRef<number>(0);

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

    // ── POS Algorithm (with adaptive alpha) ──
    const posSignal = posAlgorithm(rBufferRef.current, gBufferRef.current, bBufferRef.current);

    // ── Butterworth IIR Bandpass Filter (0.667 – 3.0 Hz = 40–180 BPM) ──
    const filtered = butterworthBandpass(posSignal, FREQ_MIN, FREQ_MAX, SAMPLE_RATE);

    // ── Estimate Heart Rate via FFT ──
    // Use last 5 seconds of data for estimation
    const recentFiltered = filtered.slice(-150);
    const { bpm: fftBpm, confidence: fftConfidence } = estimateHeartRateFFT(recentFiltered, SAMPLE_RATE);

    // ── Cross-validate with peak counting ──
    const pBpm = peakCountBpm(recentFiltered, SAMPLE_RATE);

    // Use FFT as primary; if peak counting agrees (within 15 BPM), boost confidence
    let finalBpm = fftBpm;
    let confidence = fftConfidence;
    if (pBpm > 0 && Math.abs(fftBpm - pBpm) < 15) {
      // Methods agree: blend and boost confidence
      finalBpm = Math.round(fftBpm * 0.7 + pBpm * 0.3);
      confidence = Math.min(1, fftConfidence * 1.2);
    } else if (pBpm > 0 && fftConfidence < 0.2) {
      // FFT confidence is poor, fall back to peak counting
      finalBpm = pBpm;
      confidence = Math.min(0.3, fftConfidence + 0.1);
    }

    // ── EMA Temporal Smoothing ──
    const prevSmoothed = smoothedBpmRef.current;
    let smoothedBpm: number;
    if (prevSmoothed === 0 || Math.abs(finalBpm - prevSmoothed) > BPM_SNAP_THRESHOLD) {
      // First reading or large jump → snap to new value
      smoothedBpm = finalBpm;
    } else {
      // Exponential moving average
      smoothedBpm = Math.round(prevSmoothed + BPM_SMOOTHING * (finalBpm - prevSmoothed));
    }
    smoothedBpmRef.current = smoothedBpm;
    const bpm = smoothedBpm;

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
      const neckFiltered = butterworthBandpass(normalizedNeck, FREQ_MIN, FREQ_MAX, SAMPLE_RATE);
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
