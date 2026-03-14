"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { REGISTRY_CONFIG } from "../lib/registryConfig";
import {
  findMatch,
  createPerson,
  updatePersonEncounter,
  logEncounter,
} from "../lib/registryDb";
import type { AnalysisPhase } from "./usePhaseAnalysis";
import type { DeceptionFeature } from "./useDeceptionDetection";

// ── Public types ──────────────────────────────────────────────────────────────

export type RegistrySyncStatus =
  | "disabled"
  | "idle"
  | "encounter_active"
  | "matching"
  | "new_person_flagged"
  | "known_person_updated"
  | "known_person_seen"
  | "error";

export interface RegistrySyncState {
  status: RegistrySyncStatus;
  matchedPersonId: string | null;
  matchConfidence: number;
  lastFlaggedAt: number | null;
  error: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRegistrySync({
  riskScore,
  deceptionScore,
  currentPhase,
  faceEmbeddingRef,
  featureVector,
  faceDetected,
}: {
  riskScore: number;
  deceptionScore: number;
  currentPhase: AnalysisPhase;
  faceEmbeddingRef: React.RefObject<Float32Array | null>;
  featureVector: DeceptionFeature[];
  faceDetected: boolean;
}) {
  const [syncState, setSyncState] = useState<RegistrySyncState>({
    status: REGISTRY_CONFIG.enabled ? "idle" : "disabled",
    matchedPersonId: null,
    matchConfidence: 0,
    lastFlaggedAt: null,
    error: null,
  });

  // ── Per-encounter refs (no state → no spurious re-renders) ─────────────────
  const encounterActiveRef = useRef(false);
  // Embedding snapshot taken at encounter start (B_INQUIRY transition).
  const encounterEmbeddingRef = useRef<Float32Array | null>(null);
  // Whether a Supabase write is currently in-flight (prevents concurrent writes).
  const matchIsPendingRef = useRef(false);
  // Frame number of the last registry write (for cooldown enforcement).
  const lastWriteFrameRef = useRef(0);
  // Running count of consecutive frames above the sustained threshold.
  const sustainedCounterRef = useRef(0);
  // Total frame counter for this hook instance.
  const frameCounterRef = useRef(0);

  // ── Phase transition watcher ───────────────────────────────────────────────
  // Runs whenever currentPhase changes. Manages encounter lifecycle.
  useEffect(() => {
    if (!REGISTRY_CONFIG.enabled) return;

    if (currentPhase === "B_INQUIRY") {
      encounterActiveRef.current = true;
      sustainedCounterRef.current = 0;
      lastWriteFrameRef.current = 0;
      matchIsPendingRef.current = false;

      // Snapshot the best available embedding at encounter start.
      encounterEmbeddingRef.current = faceEmbeddingRef.current
        ? new Float32Array(faceEmbeddingRef.current)
        : null;

      setSyncState((prev) => ({
        ...prev,
        status: "encounter_active",
        matchedPersonId: null,
        matchConfidence: 0,
        error: null,
      }));
    } else if (currentPhase === "A_CALIBRATION") {
      // Session reset (operator clicked "New Subject").
      encounterActiveRef.current = false;
      encounterEmbeddingRef.current = null;
      matchIsPendingRef.current = false;
      sustainedCounterRef.current = 0;

      setSyncState({
        status: REGISTRY_CONFIG.enabled ? "idle" : "disabled",
        matchedPersonId: null,
        matchConfidence: 0,
        lastFlaggedAt: null,
        error: null,
      });
    }
  }, [currentPhase, faceEmbeddingRef]);

  // ── Registry write handler ─────────────────────────────────────────────────
  // Called when a spike or sustained trigger fires. Runs the match → create/update
  // flow. All values it needs are passed as arguments to avoid stale closures
  // inside the async body.
  const handleTrigger = useCallback(
    async (params: {
      triggerType: "spike" | "sustained";
      effectiveScore: number;
      capturedRiskScore: number;
      capturedDeceptionScore: number;
      capturedPhase: AnalysisPhase;
      capturedFeatures: DeceptionFeature[];
    }) => {
      if (matchIsPendingRef.current) return;

      const embedding =
        encounterEmbeddingRef.current ?? faceEmbeddingRef.current;
      if (!embedding) return;

      matchIsPendingRef.current = true;
      setSyncState((prev) => ({ ...prev, status: "matching", error: null }));

      const {
        triggerType,
        effectiveScore,
        capturedRiskScore,
        capturedDeceptionScore,
        capturedPhase,
        capturedFeatures,
      } = params;

      try {
        const match = await findMatch(embedding);

        if (match) {
          // Known person — only increment score if this encounter is suspicious.
          const isSuspicious =
            effectiveScore >= REGISTRY_CONFIG.sustainedThreshold;

          await updatePersonEncounter({
            person_id: match.id,
            was_suspicious: isSuspicious,
          });

          await logEncounter({
            person_id: match.id,
            risk_score: capturedRiskScore,
            deception_score: capturedDeceptionScore,
            effective_score: effectiveScore,
            phase: capturedPhase,
            was_suspicious: isSuspicious,
          });

          setSyncState({
            status: isSuspicious ? "known_person_updated" : "known_person_seen",
            matchedPersonId: match.id,
            matchConfidence: match.similarity,
            lastFlaggedAt: isSuspicious ? Date.now() : null,
            error: null,
          });
        } else {
          // New person — build a reason string and insert a registry record.
          const activeFeatureNames = capturedFeatures
            .filter((f) => f.triggered)
            .map((f) => f.name)
            .join(", ");
          const reason =
            `${triggerType === "spike" ? "Spike" : "Sustained"} effective score ` +
            `${effectiveScore.toFixed(0)}/100` +
            (activeFeatureNames ? ` [${activeFeatureNames}]` : "");

          const personId = await createPerson({
            face_embedding: Array.from(embedding),
            initial_risk: effectiveScore,
            reason_for_flagging: reason,
            spike_triggered: triggerType === "spike",
            sustained_triggered: triggerType === "sustained",
          });

          if (personId) {
            await logEncounter({
              person_id: personId,
              risk_score: capturedRiskScore,
              deception_score: capturedDeceptionScore,
              effective_score: effectiveScore,
              phase: capturedPhase,
              was_suspicious: true,
            });

            setSyncState({
              status: "new_person_flagged",
              matchedPersonId: personId,
              matchConfidence: 0,
              lastFlaggedAt: Date.now(),
              error: null,
            });
          }
        }
      } catch (err) {
        // Write failures must not crash the live detection pipeline.
        console.error("[RegistrySync] handleTrigger error:", err);
        setSyncState((prev) => ({
          ...prev,
          status: "error",
          error: "Registry write failed — check console",
        }));
      } finally {
        matchIsPendingRef.current = false;
        lastWriteFrameRef.current = frameCounterRef.current;
      }
    },
    [faceEmbeddingRef]
  );

  // ── Per-frame scoring watcher ──────────────────────────────────────────────
  // Fires on every metrics update. Computes the blended effective score and
  // checks both spike and sustained trigger rules.
  useEffect(() => {
    if (!REGISTRY_CONFIG.enabled) return;
    if (!encounterActiveRef.current) return;
    if (currentPhase !== "B_INQUIRY") return;

    if (!faceDetected) {
      // No face in frame: reset sustained counter but stay in encounter.
      sustainedCounterRef.current = 0;
      return;
    }

    frameCounterRef.current += 1;
    const frame = frameCounterRef.current;

    // Respect cooldown between successive writes in the same encounter.
    if (
      frame - lastWriteFrameRef.current <
      REGISTRY_CONFIG.encounterCooldownFrames
    ) {
      return;
    }

    if (matchIsPendingRef.current) return;

    const effectiveScore =
      riskScore * REGISTRY_CONFIG.riskScoreWeight +
      deceptionScore * REGISTRY_CONFIG.deceptionScoreWeight;

    // Spike rule: a single frame above the high threshold → immediate flag.
    if (effectiveScore >= REGISTRY_CONFIG.spikeThreshold) {
      handleTrigger({
        triggerType: "spike",
        effectiveScore,
        capturedRiskScore: riskScore,
        capturedDeceptionScore: deceptionScore,
        capturedPhase: currentPhase,
        capturedFeatures: featureVector,
      });
      return;
    }

    // Sustained rule: score stays above the lower threshold for N frames.
    if (effectiveScore >= REGISTRY_CONFIG.sustainedThreshold) {
      sustainedCounterRef.current += 1;
    } else {
      sustainedCounterRef.current = 0;
    }

    if (sustainedCounterRef.current >= REGISTRY_CONFIG.sustainedFrames) {
      sustainedCounterRef.current = 0;
      handleTrigger({
        triggerType: "sustained",
        effectiveScore,
        capturedRiskScore: riskScore,
        capturedDeceptionScore: deceptionScore,
        capturedPhase: currentPhase,
        capturedFeatures: featureVector,
      });
    }
  });
  // Intentionally no dependency array: this effect runs after every render so
  // it acts as a per-frame callback. All guards (encounterActive, cooldown,
  // pending) prevent redundant work.

  return { syncState };
}
