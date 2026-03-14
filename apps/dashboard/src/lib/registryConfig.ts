// Central configuration for the high-risk person registry feature.
// All thresholds, weights, and feature flags live here.
// Nothing registry-related is hardcoded elsewhere.

export const REGISTRY_CONFIG = {
  // Master feature flag.
  // Can also be disabled at runtime by setting NEXT_PUBLIC_REGISTRY_ENABLED=false
  // in .env.local without any code changes.
  enabled: process.env.NEXT_PUBLIC_REGISTRY_ENABLED !== "false",

  // ── Score blending ─────────────────────────────────────────────────────────
  // The "effective score" blends the live multi-modal risk score (0–100)
  // with the deception probability (0–100). Weights must sum to 1.0.
  riskScoreWeight: 0.6,
  deceptionScoreWeight: 0.4,

  // ── Trigger thresholds (applied to effectiveScore 0–100) ───────────────────
  // A single frame with effectiveScore ≥ spikeThreshold immediately flags.
  spikeThreshold: 70,

  // effectiveScore must stay ≥ sustainedThreshold for sustainedFrames
  // consecutive frames to trigger the sustained-risk flag.
  sustainedThreshold: 50,

  // ~3 seconds at 30 fps. Piggybacks on the existing deception rolling window.
  sustainedFrames: 90,

  // ── Face matching ──────────────────────────────────────────────────────────
  // Cosine similarity must be ≥ this value for two face embeddings to be
  // treated as the same individual. Lower → more false positives.
  // Higher → more false negatives (missed re-encounters).
  matchConfidenceThreshold: 0.75,

  // ── Re-encounter cumulative scoring ────────────────────────────────────────
  // Points added to cumulative_risk when a known person is seen again AND
  // is currently behaving suspiciously. Never applied when not suspicious.
  cumulativeRiskIncrement: 15,

  // Minimum frames between two successive registry writes for the same
  // encounter. Prevents the same continuous suspicious episode from
  // incrementing the score many times. ~10 seconds at 30 fps.
  encounterCooldownFrames: 300,

  // ── UI ─────────────────────────────────────────────────────────────────────
  maxRegistryRows: 200,
} as const;
