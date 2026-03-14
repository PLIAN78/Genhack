"use client";
import React, { useState, useCallback, useRef } from "react";
import NodeGraph from "../components/NodeGraph";
import LiveCamera from "../components/LiveCamera";
import type { CombinedMetrics } from "../components/LiveCamera";
import { AlertCircle, Activity, Camera, Users, Eye, Scan, Shield, Heart, Brain, Loader2, Database } from "lucide-react";
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
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export default function Dashboard() {
  const [combined, setCombined] = useState<CombinedMetrics | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [registryOpen, setRegistryOpen] = useState(false);
  const { currentPhase, advancePhase, phaseAlerts, bufferStats } = usePhaseAnalysis(combined);
  const alertIdRef = useRef(0);
  const lastSweepAlertRef = useRef(0);
  const lastVolatilityAlertRef = useRef(0);
  const lastHuddleAlertRef = useRef(0);
  const lastTremorAlertRef = useRef(0);
  const lastHRAlertRef = useRef(0);
  const lastDeceptionAlertRef = useRef(0);

  // Stable ref for the latest face embedding — updated in handleMetrics,
  // passed to useRegistrySync to avoid re-renders on every embedding refresh.
  const faceEmbeddingRef = useRef<Float32Array | null>(null);

  const handleMetrics = useCallback((m: CombinedMetrics) => {
    setCombined(m);
    // Keep the embedding ref in sync without triggering a re-render.
    if (m.faceEmbedding) faceEmbeddingRef.current = m.faceEmbedding;
    const now = Date.now();
    const generateId = () => now + Math.random();
    
    // We'll collect new alerts in an array and then batch update them
    const newAlerts: AlertItem[] = [];

    const o = m.ocular;
    const k = m.kinetic;

    // Ocular alerts
    if (o.isPeripheralSweep && now - lastSweepAlertRef.current > 3000) {
      lastSweepAlertRef.current = now;
      newAlerts.push({ id: generateId(), time: getTimeStr(), msg: `Peripheral sweep: Gaze ${o.gazeDeviationDeg.toFixed(0)}° ${o.gazeDirection}`, level: "High" });
    }
    if (o.blinkRateVolatility > 0.5 && now - lastVolatilityAlertRef.current > 5000) {
      lastVolatilityAlertRef.current = now;
      newAlerts.push({ id: generateId(), time: getTimeStr(), msg: `Blink volatility: ${o.blinkRateVolatility.toFixed(2)} (Freeze-then-Burst)`, level: "Medium" });
    }

    // Kinetic alerts
    if (k.isHuddling && now - lastHuddleAlertRef.current > 3000) {
      lastHuddleAlertRef.current = now;
      newAlerts.push({ id: generateId(), time: getTimeStr(), msg: `Ventral Shielding detected: ${k.shieldingDrop.toFixed(0)}% drop from baseline`, level: "High" });
    }
    if (k.isTremoring && now - lastTremorAlertRef.current > 4000) {
      lastTremorAlertRef.current = now;
      newAlerts.push({ id: generateId(), time: getTimeStr(), msg: `Micro-dithering: Hand tremor ${k.avgTremor.toFixed(2)} (4-12Hz band)`, level: "Medium" });
    }

    // Cardiac alerts
    const c = m.cardiac;
    if (c.heartRate > 100 && c.heartRateConfidence > 0.2 && now - lastHRAlertRef.current > 5000) {
      lastHRAlertRef.current = now;
      newAlerts.push({ id: generateId(), time: getTimeStr(), msg: `Elevated HR: ${c.heartRate} BPM (rPPG confidence: ${(c.heartRateConfidence * 100).toFixed(0)}%)`, level: "High" });
    }
    if (c.carotidVisible && now - lastHRAlertRef.current > 8000) {
      newAlerts.push({ id: generateId(), time: getTimeStr(), msg: `Carotid pulse amplification detected (EVM strength: ${c.carotidPulseStrength.toFixed(2)})`, level: "Medium" });
    }

    // Deception alerts
    const d = m.deception;
    if (d.verdict === "DECEPTIVE" && d.confidence > 0.3 && now - lastDeceptionAlertRef.current > 6000) {
      lastDeceptionAlertRef.current = now;
      const triggeredFeatures = d.featureVector.filter((f) => f.triggered).map((f) => f.name).join(", ");
      newAlerts.push({ id: generateId(), time: getTimeStr(), msg: `⚠ DECEPTION DETECTED (${d.deceptionProbability}%) — ${triggeredFeatures}`, level: "High" });
    }
    
    // Batch update state if we have new alerts
    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts.reverse(), ...prev].slice(0, 30));
    }
  }, []);

  const o = combined?.ocular;
  const k = combined?.kinetic;
  const c = combined?.cardiac;
  const d = combined?.deception;

  // Live risk score (multi-modal fusion)
  const riskScore = (o && k) ? Math.min(100, Math.round(
    (o.isPeripheralSweep ? 20 : 0) +
    (o.saccadicSweepRate > 15 ? 12 : o.saccadicSweepRate > 8 ? 5 : 0) +
    (o.blinkRateVolatility > 0.5 ? 10 : o.blinkRateVolatility > 0.3 ? 4 : 0) +
    (k.isHuddling ? 20 : k.shieldingDrop > 10 ? 6 : 0) +
    (k.isTremoring ? 12 : 0) +
    (c && c.heartRate > 100 && c.heartRateConfidence > 0.2 ? 18 : c && c.heartRate > 90 ? 6 : 0) +
    (c?.carotidVisible ? 5 : 0) +
    (!o.faceDetected && !k.bodyDetected ? 8 : 0)
  )) : 0;

  const severity = riskScore >= 50 ? "High" : riskScore >= 25 ? "Medium" : "Low";
  const trafficColor = severity === "High" ? "red" : severity === "Medium" ? "yellow" : "green";

  // Registry sync — observes scores and phase, writes to Supabase when
  // thresholds are met. Additive-only: never mutates existing scoring state.
  const { syncState } = useRegistrySync({
    riskScore,
    deceptionScore: d?.deceptionProbability ?? 0,
    currentPhase,
    faceEmbeddingRef,
    featureVector: d?.featureVector ?? [],
    faceDetected: o?.faceDetected ?? false,
  });

  const riskFactors = (o && k) ? [
    o.isPeripheralSweep && `peripheral scanning (${o.gazeDeviationDeg.toFixed(0)}°)`,
    o.saccadicSweepRate > 8 && `rapid saccades (${o.saccadicSweepRate}/min)`,
    o.blinkRateVolatility > 0.3 && `blink volatility (${o.blinkRateVolatility.toFixed(2)})`,
    k.isHuddling && `ventral shielding (${k.shieldingDrop.toFixed(0)}% drop)`,
    k.isTremoring && `micro-dithering (tremor: ${k.avgTremor.toFixed(2)})`,
    c && c.heartRate > 90 && c.heartRateConfidence > 0.2 && `elevated HR (${c.heartRate} BPM via rPPG)`,
    c?.carotidVisible && `carotid pulse visible (EVM: ${c.carotidPulseStrength.toFixed(2)})`,
  ].filter(Boolean) : [];

  // Merge hook phase alerts with standard threshold alerts
  const displayAlerts = [...phaseAlerts, ...alerts].sort((a, b) => b.id - a.id).slice(0, 50);

  const riskExplanation = riskFactors.length > 0 ? riskFactors.join(" + ") : (o?.faceDetected ? "normal behavior" : "awaiting subject detection");

  // Assume 15 seconds at 30 fps ≈ 450 frames for 100% calibration
  const calibrationProgress = Math.min(100, (bufferStats.hrSamples / 450) * 100);

  return (
    <div className="min-h-screen bg-fin-bg text-slate-200 p-4 font-sans selection:bg-primary-500/30">
      {/* Top Header */}
      <header className="flex justify-between items-center mb-5 pb-4 border-b border-fin-border relative">
        <div className="absolute top-0 left-0 w-1/4 h-[1px] bg-gradient-to-r from-primary-500 to-transparent"></div>
        <h1 className="text-xl font-bold tracking-wide flex items-center gap-3">
          <div className="p-1.5 bg-primary-900/40 border border-primary-500/30 rounded-lg shadow-[0_0_15px_rgba(124,58,237,0.2)]">
            <Activity size={20} className="text-primary-400" />
          </div>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Security Copilot</span>
        </h1>
        <div className="flex gap-3">
          <span className={`px-4 py-1.5 rounded-full text-xs font-mono font-medium flex items-center gap-2 border shadow-sm ${
            trafficColor === "green" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/50 shadow-emerald-900/20" :
            trafficColor === "yellow" ? "bg-amber-950/40 text-amber-400 border-amber-900/50 shadow-amber-900/20" :
            "bg-red-950/40 text-red-400 border-red-900/50 shadow-red-900/30 animate-pulse"
          }`}>
            <Camera size={14} /> CAM-01 ({o?.faceDetected ? "Tracking" : "Active"})
          </span>
          {k?.isCalibrating && (
            <span className="px-4 py-1.5 bg-indigo-950/40 text-indigo-400 border border-indigo-900/50 shadow-[0_0_10px_rgba(99,102,241,0.2)] rounded-full text-xs font-mono flex items-center gap-2">
              <Activity size={12} className="animate-spin" /> Calibrating Posture: {k.calibrationProgress.toFixed(0)}%
            </span>
          )}
          {/* Registry toggle */}
          {REGISTRY_CONFIG.enabled && (
            <button
              onClick={() => setRegistryOpen(true)}
              className={`px-4 py-1.5 rounded-full text-xs font-mono font-medium flex items-center gap-2 border shadow-sm transition-all duration-200 ${
                syncState.status === "new_person_flagged" || syncState.status === "known_person_updated"
                  ? "bg-red-950/60 text-red-300 border-red-800/60 shadow-red-900/30 animate-pulse"
                  : syncState.status === "encounter_active" || syncState.status === "matching"
                  ? "bg-primary-950/50 text-primary-300 border-primary-800/50"
                  : "bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/60"
              }`}
            >
              <Database size={14} /> Registry
            </button>
          )}
        </div>
      </header>

      {/* 3-Phase Behavioral Analysis Tracker */}
      <PhaseTracker 
        currentPhase={currentPhase}
        onAdvance={advancePhase}
        calibrationProgress={calibrationProgress}
      />

      <div className="grid grid-cols-12 gap-5" style={{ height: "calc(100vh - 160px)" }}>
        {/* Left Column */}
        <div className="col-span-4 flex flex-col gap-4 overflow-hidden">
          {/* Live Camera */}
          <Panel
            className="shrink-0 relative shadow-[rgba(0,0,0,0.5)_0px_10px_30px_-10px]"
            title="LIVE FEED"
            noPadding
            headerRight={
              <div className="flex items-center gap-2 text-red-500 text-[10px] font-mono font-bold tracking-wider">
                <div className="animate-pulse w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div> REC
              </div>
            }
          >
            <div className="aspect-video bg-black/80 rounded-b-xl overflow-hidden">
               <LiveCamera onMetricsUpdate={handleMetrics} />
            </div>
          </Panel>

          {/* Ocular Forensics Panel */}
          <Panel 
            title="Ocular Forensics" 
            icon={<Eye size={14} className="opacity-80" />}
            className="shrink-0"
          >
            {o?.faceDetected ? (
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 font-mono text-[10px]">
                <div>
                  <span className="text-slate-500 tracking-wider">GAZE</span>
                  <div className={`text-sm mt-0.5 font-semibold ${o.gazeDeviationDeg > 30 ? "text-red-400" : "text-emerald-400"}`}>
                    {o.gazeDeviationDeg.toFixed(1)}° {o.gazeDirection}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">BLINKS/MIN</span>
                  <div className="text-slate-200 text-sm mt-0.5 font-semibold">{o.blinksPerMinute}</div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">EAR</span>
                  <div className={`text-sm mt-0.5 font-semibold ${o.isBlinking ? "text-amber-400" : "text-slate-300"}`}>{o.avgEAR.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">SACCADES</span>
                  <div className={`text-sm mt-0.5 font-semibold ${o.saccadicSweepRate > 15 ? "text-amber-500" : "text-slate-300"}`}>{o.saccadicSweepRate}/min</div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">VOLATILITY</span>
                  <div className={`text-sm mt-0.5 font-semibold ${o.blinkRateVolatility > 0.5 ? "text-red-400" : "text-slate-300"}`}>{o.blinkRateVolatility.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">TOTAL</span>
                  <div className="text-slate-400 text-sm mt-0.5 font-semibold">{o.blinkCount}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 opacity-50">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></div>
                <p className="text-slate-400 text-[11px] font-mono">Waiting for facial detection...</p>
              </div>
            )}
          </Panel>

          {/* Kinetic Forensics Panel */}
          <Panel 
            title="Kinetic Forensics" 
            icon={<Shield size={14} className="opacity-80" />}
            className="shrink-0"
          >
            {k?.bodyDetected ? (
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 font-mono text-[10px]">
                <div>
                  <span className="text-slate-500 tracking-wider">SHIELD RATIO</span>
                  <div className={`text-sm mt-0.5 font-semibold ${k.isHuddling ? "text-red-400" : "text-emerald-400"}`}>
                    {k.currentShieldingRatio.toFixed(3)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">DROP</span>
                  <div className={`text-sm mt-0.5 font-semibold ${k.shieldingDrop > 20 ? "text-red-400" : k.shieldingDrop > 10 ? "text-amber-400" : "text-slate-300"}`}>
                    {k.shieldingDrop.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">STATUS</span>
                  <div className={`text-sm mt-0.5 font-semibold ${k.isHuddling ? "text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]" : "text-emerald-400"}`}>
                    {k.isCalibrating ? "CALIB..." : k.isHuddling ? "⚠ HUDDLE" : "NORMAL"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">L TREMOR</span>
                  <div className={`text-sm mt-0.5 font-semibold ${k.leftHandTremor > 0.5 ? "text-amber-500" : "text-slate-300"}`}>{k.leftHandTremor.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">R TREMOR</span>
                  <div className={`text-sm mt-0.5 font-semibold ${k.rightHandTremor > 0.5 ? "text-amber-500" : "text-slate-300"}`}>{k.rightHandTremor.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">LEAN</span>
                  <div className={`text-sm mt-0.5 font-semibold ${k.torsoLean > 20 ? "text-amber-400" : "text-slate-300"}`}>{k.torsoLean.toFixed(1)}°</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 opacity-50">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></div>
                <p className="text-slate-400 text-[11px] font-mono">Waiting for body pose...</p>
              </div>
            )}
          </Panel>

          {/* Cardiac Forensics Panel */}
          <Panel 
            title="Cardiac Forensics (rPPG)" 
            icon={<Heart size={14} className="opacity-80" />}
            className="shrink-0 relative overflow-hidden"
          >
            {/* Pulsing background effect when HR is detected */}
            {c && !c.isProcessing && c.heartRate > 0 && (
               <div 
                 className="absolute -right-10 -bottom-10 w-32 h-32 bg-red-500/10 rounded-full blur-2xl" 
                 style={{ animation: `pulse ${60000 / c.heartRate}ms infinite` }}
               />
            )}
            {c && !c.isProcessing ? (
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 font-mono text-[10px] relative z-10">
                <div>
                  <span className="text-slate-500 tracking-wider">HEART RATE</span>
                  <div className={`text-sm mt-0.5 font-semibold flex items-center gap-1 ${c.heartRate > 100 ? "text-red-400" : c.heartRate > 90 ? "text-amber-400" : "text-emerald-400"}`}>
                    <Heart size={12} className={c.heartRate > 0 ? "animate-pulse" : ""} /> {c.heartRate} BPM
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">CONFIDENCE</span>
                  <div className={`text-sm mt-0.5 font-semibold ${c.heartRateConfidence > 0.5 ? "text-emerald-400" : c.heartRateConfidence > 0.2 ? "text-amber-400" : "text-slate-500"}`}>
                    {(c.heartRateConfidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">SIGNAL Q.</span>
                  <div className="text-slate-300 text-sm mt-0.5 font-semibold">{c.signalQuality.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">CAROTID EVM</span>
                  <div className={`text-sm mt-0.5 font-semibold ${c.carotidVisible ? "text-primary-400" : "text-slate-500"}`}>
                    {c.carotidPulseStrength.toFixed(3)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">CAROTID</span>
                  <div className={`text-sm mt-0.5 font-semibold ${c.carotidVisible ? "text-primary-400" : "text-slate-500"}`}>
                    {c.carotidVisible ? "VISIBLE" : "—"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 tracking-wider">SAMPLES</span>
                  <div className="text-slate-400 text-sm mt-0.5 font-semibold">{c.samplesCollected}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Loader2 size={12} className="text-primary-500 animate-spin" />
                <p className="text-slate-400 text-[11px] font-mono">
                  Collecting rPPG signal... {c ? `${c.samplesCollected}/${c.requiredSamples}` : ""}
                </p>
              </div>
            )}
          </Panel>

          {/* ── DECEPTION VERDICT PANEL ── */}
          <Panel
             className={`shrink-0 transition-colors duration-500 ${
               d?.verdict === "DECEPTIVE" ? "!border-red-900/80 shadow-[0_0_20px_rgba(220,38,38,0.2)]" :
               d?.verdict === "TRUTHFUL" ? "!border-emerald-900/50" :
               d?.verdict === "INCONCLUSIVE" ? "!border-amber-900/50" : ""
             }`}
             title="Deception Analysis (Real-Life Trials 2016)"
             icon={<Brain size={14} className={d?.verdict === "DECEPTIVE" ? "text-red-400" : "opacity-80"} />}
          >
            {d ? (
              <div className="space-y-3">
                {/* Verdict + Probability */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-3xl font-black ${
                      d.verdict === "DECEPTIVE" ? "text-red-500" :
                      d.verdict === "TRUTHFUL" ? "text-emerald-400" :
                      d.verdict === "INCONCLUSIVE" ? "text-amber-400" : "text-slate-500"
                    } drop-shadow-lg`}>
                      {d.deceptionProbability}%
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border tracking-wider ${
                      d.verdict === "DECEPTIVE" ? "bg-red-950/90 text-red-400 border-red-700/50 shadow-[0_0_10px_rgba(220,38,38,0.3)] animate-pulse" :
                      d.verdict === "TRUTHFUL" ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/50" :
                      d.verdict === "INCONCLUSIVE" ? "bg-amber-950/80 text-amber-400 border-amber-800/50" :
                      "bg-fin-bg text-slate-500 border-fin-border"
                    }`}>
                      {d.verdict}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-slate-400 font-mono">
                      CONF: <span className="text-slate-200">{(d.confidence * 100).toFixed(0)}%</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      PEAK: <span className="text-slate-200">{d.peakDeceptionScore}%</span>
                    </span>
                  </div>
                </div>

                {/* Probability bar */}
                <div className="w-full h-1.5 bg-fin-bg rounded-full overflow-hidden border border-fin-border/50">
                  <div
                    className={`h-full rounded-full transition-all duration-300 shadow-[0_0_10px_currentColor] ${
                      d.deceptionProbability > 65 ? "bg-red-500 text-red-500" :
                      d.deceptionProbability > 50 ? "bg-amber-500 text-amber-500" : "bg-emerald-500 text-emerald-500"
                    }`}
                    style={{ width: `${d.deceptionProbability}%` }}
                  />
                </div>

                {/* Triggered features */}
                {d.featureVector.filter((f) => f.triggered).length > 0 && (
                  <div className="space-y-1.5 bg-fin-bg/50 p-2.5 rounded border border-fin-border/30">
                    <span className="text-[10px] text-slate-400 font-mono uppercase font-semibold">Active Indicators:</span>
                    {d.featureVector.filter((f) => f.triggered).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                         <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${
                          f.category === "ocular" ? "bg-primary-400 text-primary-400" :
                          f.category === "kinetic" ? "bg-amber-400 text-amber-400" :
                          f.category === "cardiac" ? "bg-red-400 text-red-400" : "bg-purple-400 text-purple-400"
                        }`} />
                        <span className="text-slate-300 font-medium">{f.name}</span>
                        <span className="text-fin-border">—</span>
                        <span className="text-slate-500 truncate">{f.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Session stats */}
                <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-1">
                  <span>FRAMES: <span className="text-slate-300">{d.totalFramesAnalyzed}</span></span>
                  <span>SUSPECT: <span className="text-slate-300">{d.sessionDeceptiveRatio}%</span></span>
                  <span>CONSEC: <span className="text-slate-300">{d.consecutiveDeceptiveFrames}</span></span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 opacity-50">
                <Loader2 size={12} className="text-primary-500 animate-spin" />
                <p className="text-slate-400 text-[11px] font-mono">Initializing modal processing...</p>
              </div>
            )}
          </Panel>

          {/* Risk Card */}
          <Panel className={`shrink-0 transition-all duration-500 ${
            severity === "High" ? "!bg-red-950/20 !border-red-900/50 shadow-[0_0_20px_rgba(220,38,38,0.15)]" :
            severity === "Medium" ? "!bg-amber-950/20 !border-amber-900/50" : "!bg-emerald-950/10 !border-emerald-900/30"
          }`}>
            <h2 className="text-slate-400 text-[10px] uppercase font-semibold tracking-wider mb-1">Live Risk Score</h2>
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-black ${
                severity === "High" ? "text-red-500" : severity === "Medium" ? "text-amber-500" : "text-emerald-500"
              } drop-shadow-md`}>{riskScore}</span>
              <span className={`text-sm font-bold mb-0.5 ${
                severity === "High" ? "text-red-500" : severity === "Medium" ? "text-amber-500" : "text-emerald-500"
              }`}>/ 100</span>
            </div>
            {riskExplanation !== "awaiting subject detection" && riskExplanation !== "normal behavior" && (
              <div className={`mt-3 p-2.5 rounded-lg border flex items-start gap-2.5 text-[10px] shadow-inner ${
                severity === "High" ? "bg-red-950/40 border-red-900/40 text-red-300" :
                severity === "Medium" ? "bg-amber-950/40 border-amber-900/40 text-amber-300" :
                "bg-emerald-950/40 border-emerald-900/40 text-emerald-300"
              }`}>
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <p className="leading-relaxed"><strong>{severity.toUpperCase()}:</strong> {riskExplanation}</p>
              </div>
            )}
          </Panel>

          {/* Alert Timeline */}
          <Panel title="Event Timeline" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[10px] pr-2 custom-scrollbar">
              {displayAlerts.length === 0 && <p className="text-slate-500 italic">Listening for anomalies...</p>}
              {displayAlerts.map((a) => (
                <div key={a.id} className={`flex gap-3 items-start border-l-2 pl-3 py-0.5 transition-all ${
                  a.level === "High" ? "border-red-600" : a.level === "Medium" ? "border-amber-500" : a.level === "Low" ? "border-primary-500" : "border-emerald-500"
                }`}>
                  <span className="text-slate-500 shrink-0 select-none">{a.time}</span>
                  <span className={`leading-snug ${
                    a.level === "High" ? "text-red-200" : a.level === "Medium" ? "text-amber-200" : a.level === "Low" ? "text-primary-200" : "text-slate-300"
                  }`}>{a.msg}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Right Column: Node Graph & XAI */}
        <div className="col-span-8 flex flex-col gap-5">
          <Panel 
             title="Fusion Engine: Rule Graph"
             icon={<Activity size={14} className="text-primary-400" />}
             headerRight={<span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Multi-modal correlation view</span>}
             className="flex-1 relative shadow-inner overflow-hidden !p-0"
             noPadding
          >
            <div className="absolute inset-0 bg-fin-bg z-0" />
            <div className="relative z-10 w-full h-full">
              <NodeGraph metrics={combined} riskScore={riskScore} />
            </div>
          </Panel>

          <Panel className="!bg-indigo-950/10 !border-indigo-900/40 relative min-h-[140px] flex flex-col overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(#6366f1 1px, transparent 1px)", backgroundSize: "24px 24px" }}></div>
            <h2 className="text-primary-400 text-xs font-bold uppercase tracking-[0.15em] mb-4 z-10 flex items-center gap-2">
              <Scan size={14} /> Explainable AI (XAI) Output
            </h2>
            <div className="flex-1 bg-fin-bg/80 border border-fin-border/50 p-4 rounded-lg font-mono text-sm leading-relaxed text-slate-300 z-10 overflow-y-auto shadow-inner backdrop-blur-sm">
              {riskScore >= 25 ? (
                <>
                  <span className={`font-bold mb-2 block tracking-wide ${severity === "High" ? "text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]" : "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]"}`}>
                    &gt; {severity === "High" ? "WARNING: MANAGER ALERT TRIGGERED." : "CAUTION: ELEVATED INDICATORS."}
                  </span>
                  <span className="text-slate-400">System detected </span>
                  {riskFactors.map((f, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-slate-500"> correlated with </span>}
                      <span className={`border-b border-dashed font-medium ${
                        i === 0 ? "text-emerald-400 border-emerald-500/50" :
                        i === 1 ? "text-amber-400 border-amber-500/50" :
                        i === 2 ? "text-primary-400 border-primary-500/50" :
                        "text-orange-400 border-orange-500/50"
                      }`}>{f}</span>
                    </span>
                  ))}
                  <span className="text-slate-500">.</span>
                  <br /><br />
                  <span className="text-slate-400 bg-fin-bg px-2 py-1 rounded inline-block border border-fin-border/50">
                    <span className="text-slate-500 mr-2">ACTION:</span> 
                    {severity === "High"
                      ? <span className="text-red-300 font-semibold">Request secondary ID verification. Silent manager alert.</span>
                      : <span className="text-amber-300 font-semibold">Continue monitoring. Maintain visual contact.</span>
                    }
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
                  <span className="text-emerald-400 font-bold tracking-wide">&gt; STATUS: NORMAL.</span>
                  <span className="text-slate-500 ml-2">All biometric indicators within baseline parameters. No anomalies detected.</span>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* High-risk person registry slide-over */}
      <RegistryPanel
        isOpen={registryOpen}
        onClose={() => setRegistryOpen(false)}
        syncState={syncState}
      />
    </div>
  );
}
