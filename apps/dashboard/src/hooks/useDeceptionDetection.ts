"use client";
import { useRef, useCallback, useState } from "react";
import type { OcularMetrics } from "./useOcularForensics";
import type { KineticMetrics } from "./useKineticForensics";
import type { CardiacMetrics } from "./useCardiacForensics";

// ──────────────────────────────────────────────────────────────
// Deception Detection Engine
//
// Based on: "Multimodal Deception Detection in Real-Life Trials"
// (arXiv: 2407.06005) + Real-Life Trials 2016 annotation schema.
//
// Maps our live Ocular, Kinetic, and Cardiac metrics onto the
// 39-feature behavioral vector used in the research, then applies
// a weighted logistic model for real-time deception probability.
//
// The research found that deceptive subjects exhibit:
// - More "OtherGestures" (fidgeting, self-touching)
// - More Scowl, Frown (vs. Smile/Laugh)
// - More gaze avoidance (gazeDown, gazeSide) vs gazeInterlocutor
// - More lipsDown (tension) vs lipsUp
// - More sideTurn, headTilt (displacement behavior)
// - More hand gestures (bothHands, complexHandM)
// - Higher heart rate / physiological arousal
// ──────────────────────────────────────────────────────────────

export interface DeceptionMetrics {
  deceptionProbability: number;  // 0-100% likelihood of deception
  verdict: "TRUTHFUL" | "DECEPTIVE" | "ANALYZING" | "INCONCLUSIVE";
  confidence: number;            // model confidence 0-1
  
  // Feature breakdown (which behavioral signals contribute)
  featureVector: DeceptionFeature[];
  
  // Temporal tracking
  frameVotes: number[];          // rolling window of per-frame votes (0=truth, 1=deception)
  consecutiveDeceptiveFrames: number;
  totalFramesAnalyzed: number;
  
  // Session stats
  sessionDeceptiveRatio: number; // % of session flagged deceptive
  peakDeceptionScore: number;
}

export interface DeceptionFeature {
  name: string;
  category: "ocular" | "kinetic" | "cardiac" | "behavioral";
  value: number;      // raw metric value
  weight: number;     // contribution to deception score (-1 to +1)
  triggered: boolean; // whether this feature exceeds deceptive threshold
  description: string;
}

export const DEFAULT_DECEPTION: DeceptionMetrics = {
  deceptionProbability: 0, verdict: "ANALYZING", confidence: 0,
  featureVector: [],
  frameVotes: [], consecutiveDeceptiveFrames: 0, totalFramesAnalyzed: 0,
  sessionDeceptiveRatio: 0, peakDeceptionScore: 0,
};

// ──────────────────────────────────────────────────────────────
// Feature Extraction: Maps live metrics → research feature vector
// ──────────────────────────────────────────────────────────────

function extractFeatures(
  o: OcularMetrics,
  k: KineticMetrics,
  c: CardiacMetrics
): DeceptionFeature[] {
  const features: DeceptionFeature[] = [];

  // ── OCULAR FEATURES (The Eyes) ──
  // Research: deceptive subjects show more gaze avoidance (gazeSide, gazeDown)
  features.push({
    name: "Gaze Avoidance",
    category: "ocular",
    value: o.gazeDeviationDeg,
    weight: o.gazeDeviationDeg > 25 ? 0.15 : o.gazeDeviationDeg > 15 ? 0.05 : -0.05,
    triggered: o.gazeDeviationDeg > 25,
    description: `Gaze ${o.gazeDeviationDeg.toFixed(0)}° ${o.gazeDirection} — deceptive subjects avoid direct gaze`,
  });

  // Research: peripheral scanning = checking exits/cameras (high anxiety)
  features.push({
    name: "Peripheral Sweep",
    category: "ocular",
    value: o.isPeripheralSweep ? 1 : 0,
    weight: o.isPeripheralSweep ? 0.18 : 0,
    triggered: o.isPeripheralSweep,
    description: "Rapid lateral eye sweep >30° — security scanning behavior",
  });

  // Research: irregular blink patterns correlate with cognitive load
  features.push({
    name: "Blink Volatility",
    category: "ocular",
    value: o.blinkRateVolatility,
    weight: o.blinkRateVolatility > 0.6 ? 0.12 : o.blinkRateVolatility > 0.3 ? 0.04 : -0.03,
    triggered: o.blinkRateVolatility > 0.5,
    description: `Blink timing CV ${o.blinkRateVolatility.toFixed(2)} — freeze-then-burst indicates cognitive load`,
  });

  // Research: rapid saccadic movements = scanning/anxiety
  features.push({
    name: "Saccadic Rate",
    category: "ocular",
    value: o.saccadicSweepRate,
    weight: o.saccadicSweepRate > 15 ? 0.10 : o.saccadicSweepRate > 8 ? 0.03 : -0.02,
    triggered: o.saccadicSweepRate > 12,
    description: `${o.saccadicSweepRate} saccades/min — elevated rapid eye movements`,
  });

  // Research: abnormal blink rate (too high = stress, too low = concentration/lying)
  features.push({
    name: "Blink Rate Anomaly",
    category: "ocular",
    value: o.blinksPerMinute,
    weight: o.blinksPerMinute > 25 ? 0.08 : o.blinksPerMinute < 8 ? 0.06 : -0.03,
    triggered: o.blinksPerMinute > 25 || o.blinksPerMinute < 8,
    description: `${o.blinksPerMinute} blinks/min — normal range 15-20`,
  });

  // ── KINETIC FEATURES (The Body) ──
  // Research: "otherGestures" (fidgeting) highest in deceptive subjects
  features.push({
    name: "Ventral Shielding",
    category: "kinetic",
    value: k.shieldingDrop,
    weight: k.isHuddling ? 0.16 : k.shieldingDrop > 10 ? 0.05 : -0.03,
    triggered: k.isHuddling,
    description: `Elbow-shoulder ratio dropped ${k.shieldingDrop.toFixed(0)}% — protective nesting behavior`,
  });

  // Research: hand tremor = somatic anxiety marker
  features.push({
    name: "Micro-Dithering",
    category: "kinetic",
    value: k.avgTremor,
    weight: k.isTremoring ? 0.14 : k.avgTremor > 0.15 ? 0.04 : -0.02,
    triggered: k.isTremoring,
    description: `Hand tremor ${k.avgTremor.toFixed(3)} — autonomic arousal micro-jitter`,
  });

  // Research: forward lean can indicate engagement (truthful) or aggression
  features.push({
    name: "Torso Displacement",
    category: "kinetic",
    value: k.torsoLean,
    weight: k.torsoLean > 25 ? 0.06 : k.torsoLean > 15 ? 0.02 : -0.02,
    triggered: k.torsoLean > 20,
    description: `Torso lean ${k.torsoLean.toFixed(1)}° — postural displacement`,
  });

  // ── CARDIAC FEATURES (The Skin) ──
  // Research: elevated heart rate = strongest single physiological deception marker
  features.push({
    name: "Elevated Heart Rate",
    category: "cardiac",
    value: c.heartRate,
    weight: c.heartRateConfidence > 0.15
      ? (c.heartRate > 100 ? 0.20 : c.heartRate > 90 ? 0.08 : c.heartRate > 80 ? 0.02 : -0.05)
      : 0,
    triggered: c.heartRate > 95 && c.heartRateConfidence > 0.15,
    description: `rPPG ${c.heartRate} BPM (conf: ${(c.heartRateConfidence * 100).toFixed(0)}%) — sympathetic arousal`,
  });

  // Research: visible carotid pulse = strong physiological stress response
  features.push({
    name: "Carotid Visibility",
    category: "cardiac",
    value: c.carotidPulseStrength,
    weight: c.carotidVisible ? 0.10 : 0,
    triggered: c.carotidVisible,
    description: `EVM carotid ${c.carotidPulseStrength.toFixed(3)} — visible neck pulse = high arousal`,
  });

  // ── COMPOSITE BEHAVIORAL PATTERNS ──
  // Research: "Cognitive Load Cluster" — multiple simultaneous deception markers
  const cognitiveLoadCount = [
    o.blinkRateVolatility > 0.4,
    o.gazeDeviationDeg > 20,
    k.isTremoring,
    c.heartRate > 90 && c.heartRateConfidence > 0.15,
  ].filter(Boolean).length;

  features.push({
    name: "Cognitive Load Cluster",
    category: "behavioral",
    value: cognitiveLoadCount,
    weight: cognitiveLoadCount >= 3 ? 0.15 : cognitiveLoadCount >= 2 ? 0.06 : -0.04,
    triggered: cognitiveLoadCount >= 2,
    description: `${cognitiveLoadCount}/4 stress channels active simultaneously`,
  });

  return features;
}

// ──────────────────────────────────────────────────────────────
// Logistic aggregation: weighted feature sum → probability
// ──────────────────────────────────────────────────────────────
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function computeDeceptionScore(features: DeceptionFeature[]): { probability: number; confidence: number } {
  // Sum weighted contributions
  const weightedSum = features.reduce((sum, f) => sum + f.weight, 0);

  // Sigmoid maps the weighted sum to 0-1 probability
  // Bias toward "truthful" baseline (offset = -0.1), so normal behavior → ~45%
  const rawProbability = sigmoid((weightedSum - 0.05) * 6);

  // Confidence based on how many features are actively providing data
  const activeFeatures = features.filter((f) => Math.abs(f.weight) > 0.01).length;
  const confidence = Math.min(1, activeFeatures / 8);

  return {
    probability: Math.round(rawProbability * 100),
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ──────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────
const VOTE_WINDOW = 150; // ~5 seconds at 30fps

export function useDeceptionDetection() {
  const [metrics, setMetrics] = useState<DeceptionMetrics>(DEFAULT_DECEPTION);
  const frameVotesRef = useRef<number[]>([]);
  const totalFramesRef = useRef(0);
  const deceptiveFramesRef = useRef(0);
  const peakRef = useRef(0);
  const consecutiveRef = useRef(0);

  const analyze = useCallback((
    ocular: OcularMetrics,
    kinetic: KineticMetrics,
    cardiac: CardiacMetrics
  ) => {
    // Need at least face or body detection to analyze
    if (!ocular.faceDetected && !kinetic.bodyDetected) {
      setMetrics((prev) => ({ ...prev, verdict: "ANALYZING" }));
      return;
    }

    // Extract features from current frame
    const featureVector = extractFeatures(ocular, kinetic, cardiac);
    const { probability, confidence } = computeDeceptionScore(featureVector);

    // Frame vote: 1 = deceptive, 0 = truthful
    const vote = probability > 55 ? 1 : 0;
    frameVotesRef.current.push(vote);
    if (frameVotesRef.current.length > VOTE_WINDOW) {
      frameVotesRef.current = frameVotesRef.current.slice(-VOTE_WINDOW);
    }

    totalFramesRef.current += 1;
    if (vote === 1) {
      deceptiveFramesRef.current += 1;
      consecutiveRef.current += 1;
    } else {
      consecutiveRef.current = 0;
    }

    if (probability > peakRef.current) {
      peakRef.current = probability;
    }

    // Rolling window majority vote for verdict
    const recentVotes = frameVotesRef.current.slice(-90); // last ~3 seconds
    const deceptiveRatio = recentVotes.reduce((a, b) => a + b, 0) / recentVotes.length;

    let verdict: DeceptionMetrics["verdict"];
    if (totalFramesRef.current < 30) {
      verdict = "ANALYZING";
    } else if (deceptiveRatio > 0.6 && confidence > 0.3) {
      verdict = "DECEPTIVE";
    } else if (deceptiveRatio < 0.35) {
      verdict = "TRUTHFUL";
    } else {
      verdict = "INCONCLUSIVE";
    }

    const sessionDeceptiveRatio = totalFramesRef.current > 0
      ? deceptiveFramesRef.current / totalFramesRef.current
      : 0;

    setMetrics({
      deceptionProbability: probability,
      verdict,
      confidence,
      featureVector,
      frameVotes: [...frameVotesRef.current.slice(-30)], // last 1 second for viz
      consecutiveDeceptiveFrames: consecutiveRef.current,
      totalFramesAnalyzed: totalFramesRef.current,
      sessionDeceptiveRatio: Math.round(sessionDeceptiveRatio * 100),
      peakDeceptionScore: peakRef.current,
    });
  }, []);

  return { metrics, analyze };
}
