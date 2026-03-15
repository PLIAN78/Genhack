"use client";

import React, { useState, useCallback, useRef } from "react";
import NodeGraph from "../components/NodeGraph";
import LiveCamera from "../components/LiveCamera";
import type { CombinedMetrics } from "../components/LiveCamera";
import { analyzeSignals } from "../lib/analyzeClient";
import type { RiskAlert } from "../lib/backendTypes";
import {
  AlertCircle,
  Activity,
  Camera,
  Eye,
  Scan,
  Shield,
  Heart,
  Brain,
  Loader2,
  Database,
} from "lucide-react";
import { Panel } from "../components/ui/Panel";
import PhaseTracker from "../components/PhaseTracker";
import { usePhaseAnalysis } from "../hooks/usePhaseAnalysis";
import { useRegistrySync } from "../hooks/useRegistrySync";
import { RegistryPanel } from "../components/RegistryPanel";
import { REGISTRY_CONFIG } from "../lib/registryConfig";

interface AlertItem {
  id: number;
  time: string;
  msg: string;
  level: string;
}

function getTimeStr(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export default function Dashboard() {
  const [combined, setCombined] = useState<CombinedMetrics | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [backendAlert, setBackendAlert] = useState<RiskAlert | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  const { currentPhase, advancePhase, phaseAlerts, bufferStats } =
    usePhaseAnalysis(combined);

  const alertIdRef = useRef(0);
  const lastSweepAlertRef = useRef(0);
  const lastVolatilityAlertRef = useRef(0);
  const lastHuddleAlertRef = useRef(0);
  const lastTremorAlertRef = useRef(0);
  const lastHRAlertRef = useRef(0);
  const lastCarotidAlertRef = useRef(0);
  const lastDeceptionAlertRef = useRef(0);
  const lastBackendCallRef = useRef(0);

  // Stable ref for the latest face embedding — updated in handleMetrics,
  // passed to useRegistrySync to avoid re-renders on every embedding refresh.
  const faceEmbeddingRef = useRef<Float32Array | null>(null);

  const landingPageUrl =
    process.env.NEXT_PUBLIC_LANDING_PAGE_URL ||
    (typeof window !== "undefined"
      ? window.location.href.replace(":3001", ":3000")
      : "/");

  const getPhaseForBackend = useCallback((): "calibration" | "inquiry" | "release" => {
    const phase = String(currentPhase ?? "").toLowerCase();
    if (phase.includes("calib")) return "calibration";
    if (phase.includes("release")) return "release";
    return "inquiry";
  }, [currentPhase]);

  const handleMetrics = useCallback(
    (m: CombinedMetrics) => {
      setCombined(m);

      if (m.faceEmbedding) {
        faceEmbeddingRef.current = m.faceEmbedding;
      }

      const now = Date.now();
      const generateId = () => ++alertIdRef.current + now;

      const newAlerts: AlertItem[] = [];

      const o = m.ocular;
      const k = m.kinetic;
      const c = m.cardiac;
      const d = m.deception;

      if (o.isPeripheralSweep && now - lastSweepAlertRef.current > 3000) {
        lastSweepAlertRef.current = now;
        newAlerts.push({
          id: generateId(),
          time: getTimeStr(),
          msg: `Peripheral scan detected: gaze shifted ${o.gazeDeviationDeg.toFixed(
            0
          )}° toward ${o.gazeDirection}.`,
          level: "High",
        });
      }

      if (
        o.blinkRateVolatility > 0.5 &&
        now - lastVolatilityAlertRef.current > 5000
      ) {
        lastVolatilityAlertRef.current = now;
        newAlerts.push({
          id: generateId(),
          time: getTimeStr(),
          msg: `Blink pattern became unstable: volatility ${o.blinkRateVolatility.toFixed(
            2
          )}.`,
          level: "Medium",
        });
      }

      if (k.isHuddling && now - lastHuddleAlertRef.current > 3000) {
        lastHuddleAlertRef.current = now;
        newAlerts.push({
          id: generateId(),
          time: getTimeStr(),
          msg: `Protective posture detected: shielding dropped ${k.shieldingDrop.toFixed(
            0
          )}% from baseline.`,
          level: "High",
        });
      }

      if (k.isTremoring && now - lastTremorAlertRef.current > 4000) {
        lastTremorAlertRef.current = now;
        newAlerts.push({
          id: generateId(),
          time: getTimeStr(),
          msg: `Fine hand tremor detected: average tremor ${k.avgTremor.toFixed(
            2
          )}.`,
          level: "Medium",
        });
      }

      if (
        c.heartRate > 100 &&
        c.heartRateConfidence > 0.2 &&
        now - lastHRAlertRef.current > 5000
      ) {
        lastHRAlertRef.current = now;
        newAlerts.push({
          id: generateId(),
          time: getTimeStr(),
          msg: `Heart rate elevated: ${c.heartRate} BPM with ${(
            c.heartRateConfidence * 100
          ).toFixed(0)}% confidence.`,
          level: "High",
        });
      }

      if (c.carotidVisible && now - lastCarotidAlertRef.current > 8000) {
        lastCarotidAlertRef.current = now;
        newAlerts.push({
          id: generateId(),
          time: getTimeStr(),
          msg: `Pulse visibility increased in the neck region: signal strength ${c.carotidPulseStrength.toFixed(
            2
          )}.`,
          level: "Medium",
        });
      }

      if (
        d.verdict === "DECEPTIVE" &&
        d.confidence > 0.3 &&
        now - lastDeceptionAlertRef.current > 6000
      ) {
        lastDeceptionAlertRef.current = now;
        const triggeredFeatures = d.featureVector
          .filter((f) => f.triggered)
          .map((f) => f.name)
          .join(", ");

        newAlerts.push({
          id: generateId(),
          time: getTimeStr(),
          msg: `Behavioral risk elevated (${d.deceptionProbability}%): ${
            triggeredFeatures || "multiple indicators triggered"
          }.`,
          level: "High",
        });
      }

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts.reverse(), ...prev].slice(0, 30));
      }

      if (now - lastBackendCallRef.current > 1500) {
        lastBackendCallRef.current = now;
        setBackendLoading(true);
        setBackendError(null);

        const payload = {
          session: {
            session_id: "tx_12345",
            phase: getPhaseForBackend(),
          },
          vision: {
            face_visible: Boolean(o.faceDetected),
            person_count: o.faceDetected ? 1 : 0,
            motion_spike: Math.min(1, Math.max(0, Number(k.avgTremor ?? 0))),
            proximity_breach: false,
            saccadic_sweep_rate: Number(o.saccadicSweepRate ?? 0),
            blink_rate_volatility: Number(o.blinkRateVolatility ?? 0),
            ventral_shielding_ratio: Number(k.currentShieldingRatio ?? 1),
            micro_dithering_amplitude: Number(k.avgTremor ?? 0),
            confidence: o.faceDetected ? 0.9 : 0.3,
          },
          physiology: {
            heart_rate: Number(c.heartRate ?? 0),
            breathing_rate: 16,
            heart_rate_variability: 40,
            quality: Math.min(1, Math.max(0, Number(c.signalQuality ?? 0))),
            confidence: Math.min(
              1,
              Math.max(0, Number(c.heartRateConfidence ?? 0))
            ),
          },
        };

        analyzeSignals(payload)
          .then((result) => {
            setBackendAlert(result);
          })
          .catch((err: unknown) => {
            setBackendError(
              err instanceof Error ? err.message : "Backend request failed"
            );
          })
          .finally(() => {
            setBackendLoading(false);
          });
      }
    },
    [getPhaseForBackend]
  );

  const o = combined?.ocular;
  const k = combined?.kinetic;
  const c = combined?.cardiac;
  const d = combined?.deception;

  const localRiskScore =
    o && k
      ? Math.min(
          100,
          Math.round(
            (o.isPeripheralSweep ? 20 : 0) +
              (o.saccadicSweepRate > 15 ? 12 : o.saccadicSweepRate > 8 ? 5 : 0) +
              (o.blinkRateVolatility > 0.5
                ? 10
                : o.blinkRateVolatility > 0.3
                ? 4
                : 0) +
              (k.isHuddling ? 20 : k.shieldingDrop > 10 ? 6 : 0) +
              (k.isTremoring ? 12 : 0) +
              (c && c.heartRate > 100 && c.heartRateConfidence > 0.2
                ? 18
                : c && c.heartRate > 90
                ? 6
                : 0) +
              (c?.carotidVisible ? 5 : 0) +
              (!o.faceDetected && !k.bodyDetected ? 8 : 0)
          )
        )
      : 0;

  const displayedRiskScore = backendAlert?.risk_score ?? localRiskScore;

  const severity =
    backendAlert?.severity != null
      ? backendAlert.severity.charAt(0).toUpperCase() +
        backendAlert.severity.slice(1)
      : localRiskScore >= 50
      ? "High"
      : localRiskScore >= 25
      ? "Medium"
      : "Low";

  const trafficColor =
    severity === "High" || severity === "Critical"
      ? "red"
      : severity === "Medium"
      ? "yellow"
      : "green";

  const { syncState } = useRegistrySync({
    riskScore: displayedRiskScore,
    deceptionScore: d?.deceptionProbability ?? 0,
    currentPhase,
    faceEmbeddingRef,
    featureVector: d?.featureVector ?? [],
    faceDetected: o?.faceDetected ?? false,
  });

  const riskFactors =
    o && k
      ? [
          o.isPeripheralSweep &&
            `peripheral scanning (${o.gazeDeviationDeg.toFixed(0)}°)`,
          o.saccadicSweepRate > 8 &&
            `rapid saccades (${o.saccadicSweepRate}/min)`,
          o.blinkRateVolatility > 0.3 &&
            `blink instability (${o.blinkRateVolatility.toFixed(2)})`,
          k.isHuddling &&
            `protective posture (${k.shieldingDrop.toFixed(0)}% drop)`,
          k.isTremoring && `fine tremor (${k.avgTremor.toFixed(2)})`,
          c &&
            c.heartRate > 90 &&
            c.heartRateConfidence > 0.2 &&
            `elevated heart rate (${c.heartRate} BPM)`,
          c?.carotidVisible &&
            `visible pulse activity (${c.carotidPulseStrength.toFixed(2)})`,
        ].filter(Boolean)
      : [];

  const displayAlerts = [...phaseAlerts, ...alerts]
    .sort((a, b) => b.id - a.id)
    .slice(0, 50);

  const backendExplanation =
    backendAlert?.contributors?.length != null && backendAlert.contributors.length > 0
      ? backendAlert.contributors
          .map((item) => item.replaceAll("_", " "))
          .join(" • ")
      : null;

  const riskExplanation = backendExplanation
    ? backendExplanation
    : riskFactors.length > 0
    ? riskFactors.join(" • ")
    : o?.faceDetected
    ? "Behavior is currently within normal range."
    : "Waiting for subject detection.";

  const calibrationProgress = Math.min(100, (bufferStats.hrSamples / 450) * 100);

  return (
    <div className="min-h-screen bg-fin-bg text-slate-100 p-4 md:p-5 font-sans selection:bg-primary-500/30">
      <header className="mb-5 border-b border-fin-border pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-primary-500/20 bg-primary-900/20 p-2.5">
              <Activity size={20} className="text-primary-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Security Copilot
                </h1>
                <a
                  href={landingPageUrl}
                  className="hidden sm:inline-flex items-center rounded-md border border-fin-border px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/50 hover:text-white"
                  title="Back to Security Copilot Home"
                >
                  Back to Home
                </a>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Live multimodal monitoring dashboard for ocular, kinetic, cardiac,
                and behavioral signals.
              </p>
              <a
                href={landingPageUrl}
                className="sm:hidden mt-2 inline-flex items-center rounded-md border border-fin-border px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/50 hover:text-white"
                title="Back to Security Copilot Home"
              >
                Back to Home
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium ${
                trafficColor === "green"
                  ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-300"
                  : trafficColor === "yellow"
                  ? "border-amber-800/50 bg-amber-950/40 text-amber-300"
                  : "border-red-800/50 bg-red-950/40 text-red-300"
              }`}
            >
              <Camera size={14} />
              Camera {o?.faceDetected ? "tracking subject" : "live"}
            </span>

            {backendLoading && (
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-xs font-medium text-slate-300">
                <Loader2 size={14} className="animate-spin" />
                Syncing with backend
              </span>
            )}

            {k?.isCalibrating && (
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-800/50 bg-indigo-950/40 px-3.5 py-2 text-xs font-medium text-indigo-300">
                <Loader2 size={14} className="animate-spin" />
                Calibrating posture {k.calibrationProgress.toFixed(0)}%
              </span>
            )}

            {REGISTRY_CONFIG.enabled && (
              <button
                onClick={() => setRegistryOpen(true)}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                  syncState.status === "new_person_flagged" ||
                  syncState.status === "known_person_updated"
                    ? "border-red-800/60 bg-red-950/50 text-red-200"
                    : syncState.status === "encounter_active" ||
                      syncState.status === "matching"
                    ? "border-primary-800/50 bg-primary-950/40 text-primary-200"
                    : "border-slate-700/60 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60 hover:text-white"
                }`}
              >
                <Database size={14} />
                Registry
              </button>
            )}
          </div>
        </div>

        {backendError && (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            Backend connection error: {backendError}
          </div>
        )}
      </header>

      <div className="mb-5">
        <PhaseTracker
          currentPhase={currentPhase}
          onAdvance={advancePhase}
          calibrationProgress={calibrationProgress}
        />
      </div>

      <div
        className="grid grid-cols-12 gap-5"
        style={{ height: "calc(100vh - 176px)" }}
      >
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-1 pb-4">
          <Panel
            className="shrink-0"
            title="Live Camera"
            noPadding
            headerRight={
              <div className="flex items-center gap-2 text-[11px] font-medium text-red-400">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                Live
              </div>
            }
          >
            <div className="aspect-video overflow-hidden rounded-b-xl bg-black/80">
              <LiveCamera onMetricsUpdate={handleMetrics} />
            </div>
          </Panel>

          <Panel
            title="Ocular Analysis"
            icon={<Eye size={14} className="opacity-80" />}
            className="shrink-0"
          >
            {o?.faceDetected ? (
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-[11px]">
                <MetricItem
                  label="Gaze"
                  value={`${o.gazeDeviationDeg.toFixed(1)}° ${o.gazeDirection}`}
                  tone={o.gazeDeviationDeg > 30 ? "danger" : "success"}
                />
                <MetricItem label="Blinks / Min" value={String(o.blinksPerMinute)} />
                <MetricItem
                  label="Eye Ratio"
                  value={o.avgEAR.toFixed(3)}
                  tone={o.isBlinking ? "warning" : "default"}
                />
                <MetricItem
                  label="Saccades"
                  value={`${o.saccadicSweepRate}/min`}
                  tone={o.saccadicSweepRate > 15 ? "warning" : "default"}
                />
                <MetricItem
                  label="Volatility"
                  value={o.blinkRateVolatility.toFixed(3)}
                  tone={o.blinkRateVolatility > 0.5 ? "danger" : "default"}
                />
                <MetricItem label="Total Blinks" value={String(o.blinkCount)} subtle />
              </div>
            ) : (
              <WaitingState message="Waiting for facial detection..." />
            )}
          </Panel>

          <Panel
            title="Kinetic Analysis"
            icon={<Shield size={14} className="opacity-80" />}
            className="shrink-0"
          >
            {k?.bodyDetected ? (
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-[11px]">
                <MetricItem
                  label="Shield Ratio"
                  value={k.currentShieldingRatio.toFixed(3)}
                  tone={k.isHuddling ? "danger" : "success"}
                />
                <MetricItem
                  label="Baseline Drop"
                  value={`${k.shieldingDrop.toFixed(1)}%`}
                  tone={
                    k.shieldingDrop > 20
                      ? "danger"
                      : k.shieldingDrop > 10
                      ? "warning"
                      : "default"
                  }
                />
                <MetricItem
                  label="Status"
                  value={
                    k.isCalibrating
                      ? "Calibrating"
                      : k.isHuddling
                      ? "Protective posture"
                      : "Normal"
                  }
                  tone={
                    k.isHuddling ? "danger" : k.isCalibrating ? "warning" : "success"
                  }
                />
                <MetricItem
                  label="Left Tremor"
                  value={k.leftHandTremor.toFixed(3)}
                  tone={k.leftHandTremor > 0.5 ? "warning" : "default"}
                />
                <MetricItem
                  label="Right Tremor"
                  value={k.rightHandTremor.toFixed(3)}
                  tone={k.rightHandTremor > 0.5 ? "warning" : "default"}
                />
                <MetricItem
                  label="Torso Lean"
                  value={`${k.torsoLean.toFixed(1)}°`}
                  tone={k.torsoLean > 20 ? "warning" : "default"}
                />
              </div>
            ) : (
              <WaitingState message="Waiting for body pose..." />
            )}
          </Panel>

          <Panel
            title="Cardiac Analysis"
            icon={<Heart size={14} className="opacity-80" />}
            className="shrink-0"
          >
            {c && !c.isProcessing ? (
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-[11px]">
                <MetricItem
                  label="Heart Rate"
                  value={`${c.heartRate} BPM`}
                  tone={
                    c.heartRate > 100
                      ? "danger"
                      : c.heartRate > 90
                      ? "warning"
                      : "success"
                  }
                  icon={
                    <Heart
                      size={12}
                      className={c.heartRate > 0 ? "animate-pulse" : ""}
                    />
                  }
                />
                <MetricItem
                  label="Confidence"
                  value={`${(c.heartRateConfidence * 100).toFixed(0)}%`}
                  tone={
                    c.heartRateConfidence > 0.5
                      ? "success"
                      : c.heartRateConfidence > 0.2
                      ? "warning"
                      : "subtle"
                  }
                />
                <MetricItem
                  label="Signal Quality"
                  value={c.signalQuality.toFixed(3)}
                />
                <MetricItem
                  label="Pulse Strength"
                  value={c.carotidPulseStrength.toFixed(3)}
                  tone={c.carotidVisible ? "info" : "subtle"}
                />
                <MetricItem
                  label="Pulse Visible"
                  value={c.carotidVisible ? "Yes" : "No"}
                  tone={c.carotidVisible ? "info" : "subtle"}
                />
                <MetricItem
                  label="Samples"
                  value={String(c.samplesCollected)}
                  subtle
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Loader2 size={14} className="animate-spin text-primary-400" />
                <p className="text-sm text-slate-400">
                  Collecting cardiac signal{" "}
                  {c ? `(${c.samplesCollected}/${c.requiredSamples})` : ""}
                </p>
              </div>
            )}
          </Panel>

          <Panel
            className={`shrink-0 transition-colors duration-300 ${
              d?.verdict === "DECEPTIVE"
                ? "!border-red-900/60"
                : d?.verdict === "TRUTHFUL"
                ? "!border-emerald-900/40"
                : d?.verdict === "INCONCLUSIVE"
                ? "!border-amber-900/40"
                : ""
            }`}
            title="Behavioral Assessment"
            icon={<Brain size={14} className="opacity-80" />}
          >
            {d ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className={`text-3xl font-semibold ${
                        d.verdict === "DECEPTIVE"
                          ? "text-red-400"
                          : d.verdict === "TRUTHFUL"
                          ? "text-emerald-400"
                          : d.verdict === "INCONCLUSIVE"
                          ? "text-amber-400"
                          : "text-slate-300"
                      }`}
                    >
                      {d.deceptionProbability}%
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                        d.verdict === "DECEPTIVE"
                          ? "border-red-800/50 bg-red-950/40 text-red-300"
                          : d.verdict === "TRUTHFUL"
                          ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-300"
                          : d.verdict === "INCONCLUSIVE"
                          ? "border-amber-800/50 bg-amber-950/40 text-amber-300"
                          : "border-fin-border bg-fin-bg text-slate-400"
                      }`}
                    >
                      {d.verdict}
                    </span>
                  </div>

                  <div className="space-y-1 text-right text-xs text-slate-400">
                    <div>
                      Confidence:{" "}
                      <span className="text-slate-200">
                        {(d.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div>
                      Peak:{" "}
                      <span className="text-slate-200">
                        {d.peakDeceptionScore}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-fin-bg border border-fin-border/50">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      d.deceptionProbability > 65
                        ? "bg-red-500"
                        : d.deceptionProbability > 50
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${d.deceptionProbability}%` }}
                  />
                </div>

                {d.featureVector.filter((f) => f.triggered).length > 0 && (
                  <div className="rounded-lg border border-fin-border/40 bg-fin-bg/50 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Active Indicators
                    </p>
                    <div className="space-y-2">
                      {d.featureVector
                        .filter((f) => f.triggered)
                        .map((f, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span
                              className={`mt-1.5 h-2 w-2 rounded-full ${
                                f.category === "ocular"
                                  ? "bg-primary-400"
                                  : f.category === "kinetic"
                                  ? "bg-amber-400"
                                  : f.category === "cardiac"
                                  ? "bg-red-400"
                                  : "bg-purple-400"
                              }`}
                            />
                            <div className="min-w-0">
                              <span className="font-medium text-slate-200">
                                {f.name}
                              </span>
                              <span className="text-slate-500"> — </span>
                              <span className="text-slate-400">
                                {f.description}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>
                    Frames analyzed:{" "}
                    <span className="text-slate-200">{d.totalFramesAnalyzed}</span>
                  </span>
                  <span>
                    Session flagged:{" "}
                    <span className="text-slate-200">{d.sessionDeceptiveRatio}%</span>
                  </span>
                  <span>
                    Consecutive flagged frames:{" "}
                    <span className="text-slate-200">
                      {d.consecutiveDeceptiveFrames}
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Loader2 size={14} className="animate-spin text-primary-400" />
                <p className="text-sm text-slate-400">
                  Initializing behavioral analysis...
                </p>
              </div>
            )}
          </Panel>

          <Panel
            className={`shrink-0 ${
              severity === "High" || severity === "Critical"
                ? "!bg-red-950/15 !border-red-900/40"
                : severity === "Medium"
                ? "!bg-amber-950/15 !border-amber-900/40"
                : "!bg-emerald-950/10 !border-emerald-900/25"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Live Risk Score
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span
                    className={`text-4xl font-semibold ${
                      severity === "High" || severity === "Critical"
                        ? "text-red-400"
                        : severity === "Medium"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {displayedRiskScore}
                  </span>
                  <span className="mb-1 text-base text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="text-right text-xs text-slate-400">
                <div>Source</div>
                <div className="mt-1 font-medium text-slate-200">
                  {backendAlert ? "Backend" : "Local"}
                </div>
              </div>
            </div>

            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                severity === "High" || severity === "Critical"
                  ? "border-red-900/40 bg-red-950/20 text-red-200"
                  : severity === "Medium"
                  ? "border-amber-900/40 bg-amber-950/20 text-amber-200"
                  : "border-emerald-900/30 bg-emerald-950/10 text-emerald-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{severity} risk</p>
                  <p className="mt-1 leading-relaxed">{riskExplanation}</p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Event Timeline"
            className="shrink-0 flex min-h-[250px] flex-col overflow-hidden"
          >
            <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-2 text-xs">
              {displayAlerts.length === 0 && (
                <p className="italic text-slate-500">No events detected yet.</p>
              )}

              {displayAlerts.map((a) => (
                <div
                  key={a.id}
                  className={`border-l-2 pl-3 py-1 ${
                    a.level === "High"
                      ? "border-red-500"
                      : a.level === "Medium"
                      ? "border-amber-500"
                      : a.level === "Low"
                      ? "border-primary-500"
                      : "border-emerald-500"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-slate-500">{a.time}</span>
                    <span
                      className={`leading-snug ${
                        a.level === "High"
                          ? "text-red-200"
                          : a.level === "Medium"
                          ? "text-amber-200"
                          : a.level === "Low"
                          ? "text-primary-200"
                          : "text-slate-300"
                      }`}
                    >
                      {a.msg}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
          <Panel
            title="Fusion Engine"
            icon={<Activity size={14} className="text-primary-400" />}
            headerRight={
              <span className="text-xs text-slate-500">
                {backendAlert
                  ? "Backend graph contributors available"
                  : "Multimodal correlation view"}
              </span>
            }
            className="flex-1 overflow-hidden !p-0"
            noPadding
          >
            <div className="relative h-full w-full bg-fin-bg">
              <NodeGraph metrics={combined} riskScore={displayedRiskScore} />
            </div>
          </Panel>

          <Panel className="min-h-[150px] overflow-hidden !border-indigo-900/40 !bg-indigo-950/10">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary-300">
              <Scan size={16} />
              System Explanation
            </h2>

            <div className="rounded-lg border border-fin-border/50 bg-fin-bg/80 p-4 text-sm leading-relaxed text-slate-300">
              {displayedRiskScore >= 25 ? (
                <div className="space-y-3">
                  <p
                    className={`font-medium ${
                      severity === "High" || severity === "Critical"
                        ? "text-red-300"
                        : "text-amber-300"
                    }`}
                  >
                    {severity === "High" || severity === "Critical"
                      ? "Elevated risk detected. Review recommended."
                      : "Moderate risk detected. Continue monitoring."}
                  </p>

                  <p>
                    The system identified the following patterns:{" "}
                    {backendAlert?.contributors?.length ? (
                      backendAlert.contributors.map((item, i) => (
                        <span key={item + i}>
                          {i > 0 ? <span className="text-slate-500">, </span> : null}
                          <span className="font-medium text-slate-100">
                            {item.replaceAll("_", " ")}
                          </span>
                        </span>
                      ))
                    ) : riskFactors.length > 0 ? (
                      riskFactors.map((f, i) => (
                        <span key={String(f) + i}>
                          {i > 0 ? <span className="text-slate-500">, </span> : null}
                          <span className="font-medium text-slate-100">{f}</span>
                        </span>
                      ))
                    ) : (
                      "no specific factors available"
                    )}
                    .
                  </p>

                  <div className="rounded-md border border-fin-border/50 bg-fin-bg px-3 py-2 text-sm">
                    <span className="text-slate-400">Recommended action: </span>
                    {severity === "High" || severity === "Critical" ? (
                      <span className="font-medium text-red-300">
                        Request secondary verification and notify a supervisor
                        quietly.
                      </span>
                    ) : (
                      <span className="font-medium text-amber-300">
                        Continue observation and maintain normal interaction.
                      </span>
                    )}
                  </div>

                  {backendAlert && (
                    <div className="rounded-md border border-fin-border/50 bg-fin-bg px-3 py-2 text-xs text-slate-400">
                      Backend contributors:{" "}
                      <span className="text-slate-200">
                        {backendAlert.contributors.length > 0
                          ? backendAlert.contributors.join(", ")
                          : "none"}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <p className="font-medium text-emerald-300">System stable</p>
                    <p className="mt-1 text-slate-400">
                      Current biometric and behavioral indicators remain within
                      expected ranges.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <RegistryPanel
        isOpen={registryOpen}
        onClose={() => setRegistryOpen(false)}
        syncState={syncState}
      />
    </div>
  );
}

function WaitingState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 opacity-70">
      <div className="h-2 w-2 rounded-full bg-slate-400 animate-pulse" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

function MetricItem({
  label,
  value,
  tone = "default",
  subtle = false,
  icon,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "subtle";
  subtle?: boolean;
  icon?: React.ReactNode;
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-400"
      : tone === "warning"
      ? "text-amber-400"
      : tone === "success"
      ? "text-emerald-400"
      : tone === "info"
      ? "text-primary-400"
      : tone === "subtle"
      ? "text-slate-500"
      : subtle
      ? "text-slate-400"
      : "text-slate-200";

  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div
        className={`mt-1 flex items-center gap-1 text-sm font-medium ${valueClass}`}
      >
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}