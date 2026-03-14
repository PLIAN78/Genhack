import { useState, useRef, useCallback, useEffect } from 'react';
import type { CombinedMetrics } from '../components/LiveCamera';

export type AnalysisPhase = 'A_CALIBRATION' | 'B_INQUIRY' | 'C_RELEASE';

export interface BaselineStats {
  heartRate: { mean: number; stdDev: number };
  blinkRateVolatility: { mean: number; stdDev: number };
  tremorMagnitude: { mean: number; stdDev: number };
  shieldingRatio: { mean: number; stdDev: number };
}

export interface PhaseAlert {
  id: number;
  time: string;
  msg: string;
  level: "High" | "Medium" | "Low";
  source: "Cardiac" | "Ocular" | "Kinetic";
}

// Utility to calculate mean and standard deviation
const calcStats = (arr: number[]) => {
  if (arr.length === 0) return { mean: 0, stdDev: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  return { mean, stdDev: Math.sqrt(variance) };
};

const getTimeStr = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0');

export function usePhaseAnalysis(metrics: CombinedMetrics | null) {
  const [currentPhase, setCurrentPhase] = useState<AnalysisPhase>('A_CALIBRATION');
  const [baseline, setBaseline] = useState<BaselineStats | null>(null);
  const [phaseAlerts, setPhaseAlerts] = useState<PhaseAlert[]>([]);
  
  // Data collection buffers for Phase A
  const hrBuffer = useRef<number[]>([]);
  const blinkVolBuffer = useRef<number[]>([]);
  const tremorBuffer = useRef<number[]>([]);
  const shieldBuffer = useRef<number[]>([]);

  // Throttling references
  const lastAlertTime = useRef<Record<string, number>>({});

  const triggerAlert = useCallback((msg: string, level: "High" | "Medium" | "Low", source: "Cardiac" | "Ocular" | "Kinetic", throttleKey: string, cooldownMs = 3000) => {
    const now = Date.now();
    if (now - (lastAlertTime.current[throttleKey] || 0) > cooldownMs) {
      lastAlertTime.current[throttleKey] = now;
      setPhaseAlerts(prev => [{
        id: now + Math.random(),
        time: getTimeStr(),
        msg,
        level,
        source
      }, ...prev].slice(0, 50));
    }
  }, []);

  // Main processing loop
  useEffect(() => {
    if (!metrics) return;

    const { cardiac, ocular, kinetic } = metrics;

    if (currentPhase === 'A_CALIBRATION') {
      // Collect baseline data (only if metrics are valid/confident)
      if (cardiac.heartRate > 0 && cardiac.heartRateConfidence > 0.2) {
        hrBuffer.current.push(cardiac.heartRate);
      }
      if (ocular.faceDetected) {
        blinkVolBuffer.current.push(ocular.blinkRateVolatility);
      }
      if (kinetic.bodyDetected) {
        tremorBuffer.current.push(kinetic.avgTremor);
        shieldBuffer.current.push(kinetic.currentShieldingRatio);
      }
      
      // Limit buffer sizes to prevent memory leaks during long calibrations (max 60 seconds at 30fps)
      if (hrBuffer.current.length > 1800) hrBuffer.current.shift();
      if (blinkVolBuffer.current.length > 1800) blinkVolBuffer.current.shift();
      if (tremorBuffer.current.length > 1800) tremorBuffer.current.shift();
      if (shieldBuffer.current.length > 1800) shieldBuffer.current.shift();

    } else if (currentPhase === 'B_INQUIRY' && baseline) {
      // In Inquiry, look for Delta Spikes (> 2 Standard Deviations above mean)
      
      if (cardiac.heartRate > 0 && cardiac.heartRateConfidence > 0.3) {
        const threshold = baseline.heartRate.mean + (3 * Math.max(baseline.heartRate.stdDev, 3)); // min stdDev floor
        if (cardiac.heartRate > threshold) {
          triggerAlert(`DELTA SPIKE: Heart Rate soared to ${cardiac.heartRate} BPM (Baseline: ${baseline.heartRate.mean.toFixed(0)})`, 'High', 'Cardiac', 'hrSpike', 5000);
        }
      }

      if (ocular.faceDetected) {
        const threshold = baseline.blinkRateVolatility.mean + (3 * Math.max(baseline.blinkRateVolatility.stdDev, 0.1));
        if (ocular.blinkRateVolatility > threshold && ocular.blinkRateVolatility > 0.5) {
          triggerAlert(`DELTA SPIKE: Rapid Blink Volatility detected (${ocular.blinkRateVolatility.toFixed(2)})`, 'Medium', 'Ocular', 'blinkSpike', 4000);
        }
      }

      if (kinetic.bodyDetected) {
        // Shielding drop means they are huddling. Lower ratio = more huddling.
        // We look for drops below the mean.
        const threshold = baseline.shieldingRatio.mean - (2.5 * Math.max(baseline.shieldingRatio.stdDev, 0.05));
        if (kinetic.currentShieldingRatio < threshold && kinetic.currentShieldingRatio > 0) {
           triggerAlert(`DELTA SPIKE: Sudden Ventral Shielding / Huddle detected`, 'High', 'Kinetic', 'shieldSpike', 5000);
        }

        const tremorThreshold = baseline.tremorMagnitude.mean + (3 * Math.max(baseline.tremorMagnitude.stdDev, 0.05));
        if (kinetic.avgTremor > tremorThreshold && kinetic.avgTremor > 0.2) {
          triggerAlert(`DELTA SPIKE: Micro-Tremor magnitude spiked (${kinetic.avgTremor.toFixed(2)})`, 'Medium', 'Kinetic', 'tremorSpike', 4000);
        }
      }

    } else if (currentPhase === 'C_RELEASE' && baseline) {
      // In Release, look for "Duping Delight" or rapid drops (values returning instantly to baseline or below)
      // Only trigger if we had a spike previously, or if it's a huge sudden drop.
      
      // Heart rate dropping significantly below mean, or returning to mean extremely rapidly after being high
      if (cardiac.heartRate > 0 && cardiac.heartRateConfidence > 0.3) {
         if (cardiac.heartRate < baseline.heartRate.mean - (2 * baseline.heartRate.stdDev)) {
             triggerAlert(`RAPID RELEASE: Heart Rate plummeted below baseline (${cardiac.heartRate} BPM)`, 'Medium', 'Cardiac', 'hrDrop', 10000);
         }
      }
      
      // Look for sudden posture opening (shielding ratio jumping high)
      if (kinetic.bodyDetected) {
         const threshold = baseline.shieldingRatio.mean + (2 * Math.max(baseline.shieldingRatio.stdDev, 0.05));
         if (kinetic.currentShieldingRatio > threshold) {
             triggerAlert(`RAPID RELEASE: Subject immediately opened posture (Relief Indicator)`, 'Medium', 'Kinetic', 'shieldDrop', 10000);
         }
      }
    }
  }, [metrics, currentPhase, baseline, triggerAlert]);

  // Phase Transition Control
  const advancePhase = useCallback((targetPhase: AnalysisPhase) => {
    if (targetPhase === 'B_INQUIRY' && currentPhase === 'A_CALIBRATION') {
      // Compute baselines before transitioning
      const newBaseline: BaselineStats = {
        heartRate: calcStats(hrBuffer.current),
        blinkRateVolatility: calcStats(blinkVolBuffer.current),
        tremorMagnitude: calcStats(tremorBuffer.current),
        shieldingRatio: calcStats(shieldBuffer.current),
      };
      setBaseline(newBaseline);
      
      // Inject timeline marker
      setPhaseAlerts(prev => [{
        id: Date.now() + Math.random(),
        time: getTimeStr(),
        msg: `PHASE CHANGE: INQUIRY (Baseline established - HR: $\mu$${newBaseline.heartRate.mean.toFixed(0)}, $\sigma$${newBaseline.heartRate.stdDev.toFixed(1)})`,
        level: "Low",
        source: "Ocular" // generic
      }, ...prev]);
      
    } else if (targetPhase === 'C_RELEASE' && currentPhase === 'B_INQUIRY') {
       // Inject timeline marker
      setPhaseAlerts(prev => [{
        id: Date.now() + Math.random(),
        time: getTimeStr(),
        msg: `PHASE CHANGE: RELEASE (Scanning for Duping Delight & Relief signatures)`,
        level: "Low",
        source: "Ocular"
      }, ...prev]);
    } else if (targetPhase === 'A_CALIBRATION') {
       // Reset
       hrBuffer.current = [];
       blinkVolBuffer.current = [];
       tremorBuffer.current = [];
       shieldBuffer.current = [];
       setBaseline(null);
       
       setPhaseAlerts(prev => [{
        id: Date.now() + Math.random(),
        time: getTimeStr(),
        msg: `SYSTEM RESET: Commencing new Calibration baseline`,
        level: "Low",
        source: "Ocular"
      }, ...prev]);
    }

    setCurrentPhase(targetPhase);
  }, [currentPhase]);

  // Expose clear function for alerts
  const clearAlerts = useCallback(() => {
    setPhaseAlerts([]);
  }, []);

  return {
    currentPhase,
    advancePhase,
    baseline,
    phaseAlerts,
    clearAlerts,
    // Buffer sizes for UI progress reporting
    bufferStats: {
      hrSamples: hrBuffer.current.length,
      tremorSamples: tremorBuffer.current.length,
    }
  };
}
