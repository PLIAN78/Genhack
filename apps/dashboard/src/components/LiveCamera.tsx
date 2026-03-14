"use client";
import React, { useRef, useEffect, useState } from "react";
import { useOcularForensics, type OcularMetrics } from "../hooks/useOcularForensics";
import { useKineticForensics, type KineticMetrics } from "../hooks/useKineticForensics";
import { useCardiacForensics, type CardiacMetrics } from "../hooks/useCardiacForensics";
import { useDeceptionDetection, type DeceptionMetrics } from "../hooks/useDeceptionDetection";
import { useFaceEmbedding } from "../hooks/useFaceEmbedding";

export interface CombinedMetrics {
  ocular: OcularMetrics;
  kinetic: KineticMetrics;
  cardiac: CardiacMetrics;
  deception: DeceptionMetrics;
  // Privacy-preserving face embedding for registry matching. Refreshed every
  // ~3 seconds. Null until the first embedding is computed.
  faceEmbedding: Float32Array | null;
}

interface LiveCameraProps {
  onMetricsUpdate?: (metrics: CombinedMetrics) => void;
}

export default function LiveCamera({ onMetricsUpdate }: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStatus, setCameraStatus] = useState<"loading" | "active" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const animationFrameRef = useRef<number>(0);

  const ocular = useOcularForensics();
  const kinetic = useKineticForensics();
  const cardiac = useCardiacForensics();
  const deception = useDeceptionDetection();
  const faceEmbedding = useFaceEmbedding();

  const modelsReady = ocular.isReady && kinetic.isReady; // cardiac doesn't need a separate model

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraStatus("active");
        }
      } catch (err) {
        console.error("Camera access error:", err);
        setCameraStatus("error");
        if (err instanceof DOMException) {
          if (err.name === "NotAllowedError") setErrorMsg("Camera permission denied. Allow camera and refresh.");
          else if (err.name === "NotFoundError") setErrorMsg("No camera found.");
          else setErrorMsg(`Camera error: ${err.message}`);
        } else {
          setErrorMsg("Camera failed.");
        }
      }
    }
    startCamera();
    return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Processing loop — runs all three heads
  useEffect(() => {
    if (cameraStatus !== "active" || !modelsReady) return;
    let lastTimestamp = 0;

    function loop() {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const now = performance.now();
        if (now - lastTimestamp > 33) {
          // Run ocular first → extracts face landmarks
          ocular.processFrame(video, now);
          kinetic.processFrame(video, now + 0.01);

          // Pass face landmarks from ocular → cardiac for ROI extraction
          cardiac.setLandmarks(ocular.lastLandmarksRef.current);
          cardiac.processFrame(video, now + 0.02);

          // Run deception analysis on all metrics
          deception.analyze(ocular.metrics, kinetic.metrics, cardiac.metrics);

          // Compute face embedding for registry matching (throttled internally)
          faceEmbedding.processFrame(video, ocular.lastLandmarksRef.current);

          lastTimestamp = now;
        }
      }
      animationFrameRef.current = requestAnimationFrame(loop);
    }

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [cameraStatus, modelsReady, ocular.processFrame, kinetic.processFrame, cardiac.processFrame, deception.analyze, faceEmbedding.processFrame, ocular.metrics, kinetic.metrics, cardiac.metrics]);

  // Sync canvases with video
  useEffect(() => {
    const video = videoRef.current;
    const oc = ocular.canvasRef.current;
    const kc = kinetic.canvasRef.current;
    const cc = cardiac.canvasRef.current;
    if (!video) return;

    function syncSize() {
      const w = video!.videoWidth || video!.clientWidth;
      const h = video!.videoHeight || video!.clientHeight;
      if (oc) { oc.width = w; oc.height = h; }
      if (kc) { kc.width = w; kc.height = h; }
      if (cc) { cc.width = w; cc.height = h; }
    }

    const ro = new ResizeObserver(syncSize);
    ro.observe(video);
    video.addEventListener("loadedmetadata", syncSize);
    return () => ro.disconnect();
  }, [ocular.canvasRef, kinetic.canvasRef, cardiac.canvasRef]);

  // Bubble combined metrics (including latest face embedding)
  useEffect(() => {
    if (onMetricsUpdate) {
      onMetricsUpdate({
        ocular: ocular.metrics,
        kinetic: kinetic.metrics,
        cardiac: cardiac.metrics,
        deception: deception.metrics,
        faceEmbedding: faceEmbedding.lastEmbeddingRef.current,
      });
    }
  }, [ocular.metrics, kinetic.metrics, cardiac.metrics, deception.metrics, onMetricsUpdate, faceEmbedding.lastEmbeddingRef]);

  return (
    <div className="w-full h-full relative bg-black">
      {(cameraStatus === "loading" || !modelsReady) && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 font-mono text-xs uppercase tracking-widest">
              {!ocular.isReady ? "Loading Face Model..." : !kinetic.isReady ? "Loading Pose Model..." : "Starting Camera..."}
            </p>
          </div>
        </div>
      )}
      {cameraStatus === "error" && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <p className="text-red-400 font-mono text-xs uppercase tracking-widest text-center px-4">{errorMsg}</p>
        </div>
      )}

      <video ref={videoRef} autoPlay playsInline muted
        className="w-full h-full object-cover"
        style={{ display: cameraStatus === "active" ? "block" : "none", transform: "scaleX(-1)" }}
      />

      {/* Ocular Canvas */}
      <canvas ref={ocular.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ transform: "scaleX(-1)" }} />
      {/* Kinetic Canvas */}
      <canvas ref={kinetic.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ transform: "scaleX(-1)" }} />
      {/* Cardiac Canvas (ROI boxes + waveform) */}
      <canvas ref={cardiac.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ transform: "scaleX(-1)" }} />

      {/* Ocular HUD (top-left) */}
      {cameraStatus === "active" && ocular.metrics.faceDetected && (
        <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 pointer-events-none">
          <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide border ${
            ocular.metrics.isPeripheralSweep ? "bg-red-950/90 text-red-400 border-red-700 animate-pulse" : "bg-emerald-950/80 text-emerald-400 border-emerald-800/50"
          }`}>
            GAZE: {ocular.metrics.gazeDeviationDeg.toFixed(0)}° {ocular.metrics.gazeDirection.toUpperCase()}
            {ocular.metrics.isPeripheralSweep && " [SWEEP]"}
          </div>
          <div className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wide border bg-gray-900/80 text-gray-400 border-gray-700/50`}>
            EAR: {ocular.metrics.avgEAR.toFixed(3)} | BLINKS: {ocular.metrics.blinksPerMinute}/min
          </div>
        </div>
      )}

      {/* Kinetic HUD (top-right) */}
      {cameraStatus === "active" && kinetic.metrics.bodyDetected && (
        <div className="absolute top-2 right-12 z-20 flex flex-col gap-1 pointer-events-none items-end">
          {kinetic.metrics.isCalibrating ? (
            <div className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wide bg-blue-950/90 text-blue-400 border border-blue-700">
              CALIBRATING: {kinetic.metrics.calibrationProgress.toFixed(0)}%
            </div>
          ) : (
            <>
              <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide border ${
                kinetic.metrics.isHuddling ? "bg-red-950/90 text-red-400 border-red-700 animate-pulse" : "bg-emerald-950/80 text-emerald-400 border-emerald-800/50"
              }`}>
                SHIELD: {kinetic.metrics.currentShieldingRatio.toFixed(2)} ({kinetic.metrics.shieldingDrop.toFixed(0)}% drop)
                {kinetic.metrics.isHuddling && " [HUDDLE]"}
              </div>
              <div className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wide border ${
                kinetic.metrics.isTremoring ? "bg-orange-950/90 text-orange-400 border-orange-700 animate-pulse" : "bg-gray-900/80 text-gray-400 border-gray-700/50"
              }`}>
                TREMOR: {kinetic.metrics.avgTremor.toFixed(3)} {kinetic.metrics.isTremoring && "[DITHER]"}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cardiac HUD (bottom-left) */}
      {cameraStatus === "active" && cardiac.metrics.heartRate > 0 && (
        <div className="absolute bottom-2 left-2 z-20 pointer-events-none">
          <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide border ${
            cardiac.metrics.heartRate > 100 ? "bg-red-950/90 text-red-400 border-red-700 animate-pulse" : "bg-emerald-950/80 text-emerald-400 border-emerald-800/50"
          }`}>
            {cardiac.metrics.heartRate} BPM (conf: {(cardiac.metrics.heartRateConfidence * 100).toFixed(0)}%)
          </div>
        </div>
      )}

      {cameraStatus === "active" && modelsReady && !ocular.metrics.faceDetected && !kinetic.metrics.bodyDetected && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 z-20 pointer-events-none">
          <span className="px-3 py-1 bg-yellow-950/90 text-yellow-400 border border-yellow-700 rounded text-xs font-mono animate-pulse">
            NO SUBJECT DETECTED
          </span>
        </div>
      )}
    </div>
  );
}
