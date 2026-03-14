"use client";
import React, { useState, useCallback, useRef } from "react";
import NodeGraph from "../components/NodeGraph";
import LiveCamera from "../components/LiveCamera";
import type { CombinedMetrics } from "../components/LiveCamera";
import { AlertCircle, Activity, Camera, Users, Eye, Scan, Shield, Heart, Brain } from "lucide-react";

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
  const alertIdRef = useRef(0);
  const lastSweepAlertRef = useRef(0);
  const lastVolatilityAlertRef = useRef(0);
  const lastHuddleAlertRef = useRef(0);
  const lastTremorAlertRef = useRef(0);
  const lastHRAlertRef = useRef(0);
  const lastDeceptionAlertRef = useRef(0);

  const handleMetrics = useCallback((m: CombinedMetrics) => {
    setCombined(m);
    const now = Date.now();
    const o = m.ocular;
    const k = m.kinetic;

    // Ocular alerts
    if (o.isPeripheralSweep && now - lastSweepAlertRef.current > 3000) {
      lastSweepAlertRef.current = now;
      alertIdRef.current += 1;
      setAlerts((prev) => [
        { id: alertIdRef.current, time: getTimeStr(), msg: `Peripheral sweep: Gaze ${o.gazeDeviationDeg.toFixed(0)}° ${o.gazeDirection}`, level: "High" },
        ...prev,
      ].slice(0, 30));
    }
    if (o.blinkRateVolatility > 0.5 && now - lastVolatilityAlertRef.current > 5000) {
      lastVolatilityAlertRef.current = now;
      alertIdRef.current += 1;
      setAlerts((prev) => [
        { id: alertIdRef.current, time: getTimeStr(), msg: `Blink volatility: ${o.blinkRateVolatility.toFixed(2)} (Freeze-then-Burst)`, level: "Medium" },
        ...prev,
      ].slice(0, 30));
    }

    // Kinetic alerts
    if (k.isHuddling && now - lastHuddleAlertRef.current > 3000) {
      lastHuddleAlertRef.current = now;
      alertIdRef.current += 1;
      setAlerts((prev) => [
        { id: alertIdRef.current, time: getTimeStr(), msg: `Ventral Shielding detected: ${k.shieldingDrop.toFixed(0)}% drop from baseline`, level: "High" },
        ...prev,
      ].slice(0, 30));
    }
    if (k.isTremoring && now - lastTremorAlertRef.current > 4000) {
      lastTremorAlertRef.current = now;
      alertIdRef.current += 1;
      setAlerts((prev) => [
        { id: alertIdRef.current, time: getTimeStr(), msg: `Micro-dithering: Hand tremor ${k.avgTremor.toFixed(2)} (4-12Hz band)`, level: "Medium" },
        ...prev,
      ].slice(0, 30));
    }

    // Cardiac alerts
    const c = m.cardiac;
    if (c.heartRate > 100 && c.heartRateConfidence > 0.2 && now - lastHRAlertRef.current > 5000) {
      lastHRAlertRef.current = now;
      alertIdRef.current += 1;
      setAlerts((prev) => [
        { id: alertIdRef.current, time: getTimeStr(), msg: `Elevated HR: ${c.heartRate} BPM (rPPG confidence: ${(c.heartRateConfidence * 100).toFixed(0)}%)`, level: "High" },
        ...prev,
      ].slice(0, 30));
    }
    if (c.carotidVisible && now - lastHRAlertRef.current > 8000) {
      alertIdRef.current += 1;
      setAlerts((prev) => [
        { id: alertIdRef.current, time: getTimeStr(), msg: `Carotid pulse amplification detected (EVM strength: ${c.carotidPulseStrength.toFixed(2)})`, level: "Medium" },
        ...prev,
      ].slice(0, 30));
    }

    // Deception alerts
    const d = m.deception;
    if (d.verdict === "DECEPTIVE" && d.confidence > 0.3 && now - lastDeceptionAlertRef.current > 6000) {
      lastDeceptionAlertRef.current = now;
      alertIdRef.current += 1;
      const triggeredFeatures = d.featureVector.filter((f) => f.triggered).map((f) => f.name).join(", ");
      setAlerts((prev) => [
        { id: alertIdRef.current, time: getTimeStr(), msg: `⚠ DECEPTION DETECTED (${d.deceptionProbability}%) — ${triggeredFeatures}`, level: "High" },
        ...prev,
      ].slice(0, 30));
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

  const riskFactors = (o && k) ? [
    o.isPeripheralSweep && `peripheral scanning (${o.gazeDeviationDeg.toFixed(0)}°)`,
    o.saccadicSweepRate > 8 && `rapid saccades (${o.saccadicSweepRate}/min)`,
    o.blinkRateVolatility > 0.3 && `blink volatility (${o.blinkRateVolatility.toFixed(2)})`,
    k.isHuddling && `ventral shielding (${k.shieldingDrop.toFixed(0)}% drop)`,
    k.isTremoring && `micro-dithering (tremor: ${k.avgTremor.toFixed(2)})`,
    c && c.heartRate > 90 && c.heartRateConfidence > 0.2 && `elevated HR (${c.heartRate} BPM via rPPG)`,
    c?.carotidVisible && `carotid pulse visible (EVM: ${c.carotidPulseStrength.toFixed(2)})`,
  ].filter(Boolean) : [];

  const riskExplanation = riskFactors.length > 0 ? riskFactors.join(" + ") : (o?.faceDetected ? "normal behavior" : "awaiting subject detection");

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 font-sans">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Activity className="text-blue-500" /> Security Copilot
        </h1>
        <div className="flex gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-mono flex items-center gap-2 ${
            trafficColor === "green" ? "bg-green-900/50 text-green-400" :
            trafficColor === "yellow" ? "bg-yellow-900/50 text-yellow-400" :
            "bg-red-900/50 text-red-400 animate-pulse"
          }`}>
            <Camera size={12} /> CAM-01 ({o?.faceDetected ? "Tracking" : "Active"})
          </span>
          {k?.isCalibrating && (
            <span className="px-3 py-1 bg-blue-900/50 text-blue-400 rounded-full text-xs font-mono flex items-center gap-2">
              Calibrating Body Baseline: {k.calibrationProgress.toFixed(0)}%
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 80px)" }}>
        {/* Left Column */}
        <div className="col-span-4 flex flex-col gap-3 overflow-hidden">
          {/* Live Camera */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden aspect-video relative shrink-0">
            <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-red-500 text-[10px] font-mono font-bold tracking-wider z-20">
              <div className="animate-pulse w-2 h-2 rounded-full bg-red-500"></div> LIVE
            </div>
            <LiveCamera onMetricsUpdate={handleMetrics} />
          </div>

          {/* Ocular Forensics Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 shrink-0">
            <h2 className="text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-2 flex items-center gap-1.5">
              <Eye size={10} /> Ocular Forensics
            </h2>
            {o?.faceDetected ? (
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-[10px]">
                <div>
                  <span className="text-gray-500">Gaze</span>
                  <div className={`font-bold ${o.gazeDeviationDeg > 30 ? "text-red-400" : "text-emerald-400"}`}>
                    {o.gazeDeviationDeg.toFixed(1)}° {o.gazeDirection}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Blinks/min</span>
                  <div className="text-white font-bold">{o.blinksPerMinute}</div>
                </div>
                <div>
                  <span className="text-gray-500">EAR</span>
                  <div className={`font-bold ${o.isBlinking ? "text-yellow-400" : "text-gray-300"}`}>{o.avgEAR.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Saccades</span>
                  <div className={`font-bold ${o.saccadicSweepRate > 15 ? "text-orange-400" : "text-gray-300"}`}>{o.saccadicSweepRate}/min</div>
                </div>
                <div>
                  <span className="text-gray-500">Volatility</span>
                  <div className={`font-bold ${o.blinkRateVolatility > 0.5 ? "text-red-400" : "text-gray-300"}`}>{o.blinkRateVolatility.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Total Blinks</span>
                  <div className="text-gray-300 font-bold">{o.blinkCount}</div>
                </div>
              </div>
            ) : (
              <p className="text-gray-600 text-[10px] font-mono">Waiting for face...</p>
            )}
          </div>

          {/* Kinetic Forensics Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 shrink-0">
            <h2 className="text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-2 flex items-center gap-1.5">
              <Shield size={10} /> Kinetic Forensics
            </h2>
            {k?.bodyDetected ? (
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-[10px]">
                <div>
                  <span className="text-gray-500">Shield Ratio</span>
                  <div className={`font-bold ${k.isHuddling ? "text-red-400" : "text-emerald-400"}`}>
                    {k.currentShieldingRatio.toFixed(3)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Drop</span>
                  <div className={`font-bold ${k.shieldingDrop > 20 ? "text-red-400" : k.shieldingDrop > 10 ? "text-yellow-400" : "text-gray-300"}`}>
                    {k.shieldingDrop.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Status</span>
                  <div className={`font-bold ${k.isHuddling ? "text-red-400" : "text-emerald-400"}`}>
                    {k.isCalibrating ? "CALIB..." : k.isHuddling ? "⚠ HUDDLE" : "NORMAL"}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">L Tremor</span>
                  <div className={`font-bold ${k.leftHandTremor > 0.5 ? "text-orange-400" : "text-gray-300"}`}>{k.leftHandTremor.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-gray-500">R Tremor</span>
                  <div className={`font-bold ${k.rightHandTremor > 0.5 ? "text-orange-400" : "text-gray-300"}`}>{k.rightHandTremor.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Lean</span>
                  <div className={`font-bold ${k.torsoLean > 20 ? "text-yellow-400" : "text-gray-300"}`}>{k.torsoLean.toFixed(1)}°</div>
                </div>
              </div>
            ) : (
              <p className="text-gray-600 text-[10px] font-mono">Waiting for body pose...</p>
            )}
          </div>

          {/* Cardiac Forensics Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 shrink-0">
            <h2 className="text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-2 flex items-center gap-1.5">
              <Heart size={10} /> Cardiac Forensics (rPPG)
            </h2>
            {c && !c.isProcessing ? (
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-[10px]">
                <div>
                  <span className="text-gray-500">Heart Rate</span>
                  <div className={`font-bold ${c.heartRate > 100 ? "text-red-400" : c.heartRate > 90 ? "text-yellow-400" : "text-emerald-400"}`}>
                    ♥ {c.heartRate} BPM
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Confidence</span>
                  <div className={`font-bold ${c.heartRateConfidence > 0.5 ? "text-emerald-400" : c.heartRateConfidence > 0.2 ? "text-yellow-400" : "text-gray-500"}`}>
                    {(c.heartRateConfidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Signal Qual</span>
                  <div className="text-gray-300 font-bold">{c.signalQuality.toFixed(3)}</div>
                </div>
                <div>
                  <span className="text-gray-500">Carotid EVM</span>
                  <div className={`font-bold ${c.carotidVisible ? "text-purple-400" : "text-gray-500"}`}>
                    {c.carotidPulseStrength.toFixed(3)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Carotid</span>
                  <div className={`font-bold ${c.carotidVisible ? "text-purple-400" : "text-gray-500"}`}>
                    {c.carotidVisible ? "VISIBLE" : "—"}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Samples</span>
                  <div className="text-gray-300 font-bold">{c.samplesCollected}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-600 text-[10px] font-mono">
                  Collecting rPPG signal... {c ? `${c.samplesCollected}/${c.requiredSamples}` : ""}
                </p>
              </div>
            )}
          </div>

          {/* ── DECEPTION VERDICT PANEL ── */}
          <div className={`bg-gray-900 border rounded-xl p-3 shrink-0 ${
            d?.verdict === "DECEPTIVE" ? "border-red-700/80 shadow-[0_0_15px_rgba(220,38,38,0.2)]" :
            d?.verdict === "TRUTHFUL" ? "border-emerald-700/50" :
            d?.verdict === "INCONCLUSIVE" ? "border-yellow-700/50" : "border-gray-800"
          }`}>
            <h2 className="text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-2 flex items-center gap-1.5">
              <Brain size={10} /> Deception Analysis (Real-Life Trials 2016)
            </h2>
            {d ? (
              <div className="space-y-2">
                {/* Verdict + Probability */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black ${
                      d.verdict === "DECEPTIVE" ? "text-red-500" :
                      d.verdict === "TRUTHFUL" ? "text-emerald-400" :
                      d.verdict === "INCONCLUSIVE" ? "text-yellow-400" : "text-gray-500"
                    }`}>
                      {d.deceptionProbability}%
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                      d.verdict === "DECEPTIVE" ? "bg-red-950/90 text-red-400 border-red-700 animate-pulse" :
                      d.verdict === "TRUTHFUL" ? "bg-emerald-950/80 text-emerald-400 border-emerald-800" :
                      d.verdict === "INCONCLUSIVE" ? "bg-yellow-950/80 text-yellow-400 border-yellow-800" :
                      "bg-gray-800 text-gray-500 border-gray-700"
                    }`}>
                      {d.verdict}
                    </span>
                  </div>
                  <span className="text-[9px] text-gray-500 font-mono">
                    conf: {(d.confidence * 100).toFixed(0)}% | peak: {d.peakDeceptionScore}%
                  </span>
                </div>

                {/* Probability bar */}
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      d.deceptionProbability > 65 ? "bg-red-500" :
                      d.deceptionProbability > 50 ? "bg-yellow-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${d.deceptionProbability}%` }}
                  />
                </div>

                {/* Triggered features */}
                {d.featureVector.filter((f) => f.triggered).length > 0 && (
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-gray-500 font-mono uppercase">Active Deception Indicators:</span>
                    {d.featureVector.filter((f) => f.triggered).map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[9px] font-mono">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          f.category === "ocular" ? "bg-blue-400" :
                          f.category === "kinetic" ? "bg-orange-400" :
                          f.category === "cardiac" ? "bg-red-400" : "bg-purple-400"
                        }`} />
                        <span className="text-gray-300">{f.name}</span>
                        <span className="text-gray-600">—</span>
                        <span className="text-gray-500 truncate">{f.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Session stats */}
                <div className="flex gap-3 text-[9px] font-mono text-gray-600 pt-1 border-t border-gray-800">
                  <span>Frames: {d.totalFramesAnalyzed}</span>
                  <span>Session Deceptive: {d.sessionDeceptiveRatio}%</span>
                  <span>Consec: {d.consecutiveDeceptiveFrames}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-600 text-[10px] font-mono">Initializing multimodal analysis...</p>
            )}
          </div>

          {/* Risk Card */}
          <div className={`bg-gray-900 border rounded-xl p-3 shrink-0 ${
            severity === "High" ? "border-red-900/50 shadow-[0_0_10px_rgba(220,38,38,0.1)]" :
            severity === "Medium" ? "border-yellow-900/50" : "border-green-900/50"
          }`}>
            <h2 className="text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-1">Risk Score</h2>
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-black ${
                severity === "High" ? "text-red-500" : severity === "Medium" ? "text-yellow-500" : "text-green-500"
              }`}>{riskScore}</span>
              <span className={`text-sm font-bold mb-0.5 ${
                severity === "High" ? "text-red-500" : severity === "Medium" ? "text-yellow-500" : "text-green-500"
              }`}>/ 100</span>
            </div>
            <div className={`mt-2 p-2 rounded flex items-start gap-2 text-[10px] ${
              severity === "High" ? "bg-red-950/30 border border-red-900/50 text-red-400" :
              severity === "Medium" ? "bg-yellow-950/30 border border-yellow-900/50 text-yellow-400" :
              "bg-green-950/30 border border-green-900/50 text-green-400"
            }`}>
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <p><strong>{severity}:</strong> {riskExplanation}</p>
            </div>
          </div>

          {/* Alert Timeline */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex-1 flex flex-col min-h-0 overflow-hidden">
            <h2 className="text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-2">Event Timeline</h2>
            <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10px]">
              {alerts.length === 0 && <p className="text-gray-600">Monitoring...</p>}
              {alerts.map((a) => (
                <div key={a.id} className={`flex gap-2 items-start border-l-2 pl-2 ${
                  a.level === "High" ? "border-red-600" : a.level === "Medium" ? "border-yellow-600" : "border-green-600"
                }`}>
                  <span className="text-gray-500 shrink-0">{a.time}</span>
                  <span className="text-gray-300">{a.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Node Graph & XAI */}
        <div className="col-span-8 flex flex-col gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex-1 relative shadow-inner">
            <div className="absolute top-4 left-4 z-10">
              <h2 className="text-gray-400 text-sm uppercase font-semibold tracking-wider">Fusion Engine: Rule Graph</h2>
              <p className="text-xs text-gray-500 mt-1">Multi-modal signal correlation</p>
            </div>
            <NodeGraph />
          </div>

          <div className="bg-gray-900 border border-indigo-900/40 rounded-xl p-4 min-h-[120px] flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(#4f46e5 1px, transparent 1px), linear-gradient(90deg, #4f46e5 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
            <h2 className="text-indigo-400 text-xs font-bold uppercase tracking-[0.15em] mb-2 z-10 flex items-center gap-2">
              <Scan size={12} /> Explainable AI (XAI) Output
            </h2>
            <div className="flex-1 bg-black/30 border border-gray-800 p-3 rounded font-mono text-sm leading-relaxed text-gray-300 z-10 overflow-y-auto">
              {riskScore >= 25 ? (
                <>
                  <span className={`font-bold mb-1 block ${severity === "High" ? "text-red-400" : "text-yellow-400"}`}>
                    &gt; {severity === "High" ? "WARNING: MANAGER ALERT TRIGGERED." : "CAUTION: ELEVATED INDICATORS."}
                  </span>
                  <span className="text-gray-400">System detected </span>
                  {riskFactors.map((f, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-gray-400"> correlated with </span>}
                      <span className={`border-b border-dashed ${
                        i === 0 ? "text-emerald-400 border-emerald-500" :
                        i === 1 ? "text-yellow-400 border-yellow-500" :
                        i === 2 ? "text-indigo-400 border-indigo-500" :
                        "text-orange-400 border-orange-500"
                      }`}>{f}</span>
                    </span>
                  ))}
                  <span className="text-gray-400">.</span>
                  <br /><br />
                  <span className="text-gray-500">
                    Action: {severity === "High"
                      ? "Request secondary ID verification. Silent manager alert."
                      : "Continue monitoring. Maintain visual contact."
                    }
                  </span>
                </>
              ) : (
                <>
                  <span className="text-green-400 font-bold mb-1 block">&gt; STATUS: NORMAL.</span>
                  <span className="text-gray-400">All biometric indicators within baseline parameters. No anomalies detected.</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
