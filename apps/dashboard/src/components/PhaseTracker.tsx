import React from 'react';
import { AnalysisPhase } from '../hooks/usePhaseAnalysis';
import { Activity, Play, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

interface PhaseTrackerProps {
  currentPhase: AnalysisPhase;
  onAdvance: (phase: AnalysisPhase) => void;
  calibrationProgress?: number; // 0 to 100 based on samples
}

export default function PhaseTracker({ currentPhase, onAdvance, calibrationProgress = 0 }: PhaseTrackerProps) {
  return (
    <div className="bg-fin-panel border border-fin-border rounded-xl p-3 mb-5 shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-6 flex-1">
        
        {/* Phase A: Calibration */}
        <div className={`flex items-center gap-3 flex-1 transition-opacity duration-300 ${currentPhase === 'A_CALIBRATION' ? 'opacity-100' : 'opacity-50'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentPhase === 'A_CALIBRATION' ? 'bg-primary-600 text-white shadow-[0_0_10px_rgba(124,58,237,0.4)]' : 'bg-slate-800 text-slate-400'}`}>
            A
          </div>
          <div>
            <h3 className={`text-xs uppercase font-bold tracking-wider ${currentPhase === 'A_CALIBRATION' ? 'text-primary-400' : 'text-slate-500'}`}>Baseline</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-500 transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, calibrationProgress))}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{calibrationProgress.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-700 w-8" />

        {/* Phase B: Inquiry */}
        <div className={`flex items-center gap-3 flex-1 transition-opacity duration-300 ${currentPhase === 'B_INQUIRY' ? 'opacity-100' : currentPhase === 'C_RELEASE' ? 'opacity-50' : 'opacity-30'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentPhase === 'B_INQUIRY' ? 'bg-amber-600 text-white shadow-[0_0_10px_rgba(217,119,6,0.4)]' : 'bg-slate-800 text-slate-400'}`}>
            B
          </div>
          <div>
            <h3 className={`text-xs uppercase font-bold tracking-wider ${currentPhase === 'B_INQUIRY' ? 'text-amber-400' : 'text-slate-500'}`}>Inquiry Core</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 sequence-pulse">Detecting Delta Spikes</p>
          </div>
        </div>

        <div className="h-px bg-slate-700 w-8" />

        {/* Phase C: Release */}
        <div className={`flex items-center gap-3 flex-1 transition-opacity duration-300 ${currentPhase === 'C_RELEASE' ? 'opacity-100' : 'opacity-30'}`}>
           <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentPhase === 'C_RELEASE' ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(5,150,105,0.4)]' : 'bg-slate-800 text-slate-400'}`}>
            C
          </div>
          <div>
            <h3 className={`text-xs uppercase font-bold tracking-wider ${currentPhase === 'C_RELEASE' ? 'text-emerald-400' : 'text-slate-500'}`}>The Release</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 sequence-pulse">Detecting Duping Drops</p>
          </div>
        </div>

      </div>

      {/* Manual Controls */}
      <div className="flex gap-2 ml-6 border-l border-fin-border pl-6">
        {currentPhase === 'A_CALIBRATION' && (
           <Button 
             variant="primary" 
             size="sm" 
             onClick={() => onAdvance('B_INQUIRY')}
             disabled={calibrationProgress < 20} // Require at least 20% calibration
             leftIcon={<Play size={14} />}
           >
             Begin Inquiry
           </Button>
        )}
        
        {currentPhase === 'B_INQUIRY' && (
           <Button 
             className="bg-emerald-600 hover:bg-emerald-500 text-white"
             size="sm" 
             onClick={() => onAdvance('C_RELEASE')}
             leftIcon={<CheckCircle2 size={14} />}
           >
             Complete Tx (Release)
           </Button>
        )}

        {currentPhase === 'C_RELEASE' && (
           <Button 
             variant="secondary"
             size="sm" 
             onClick={() => onAdvance('A_CALIBRATION')}
             leftIcon={<RefreshCw size={14} />}
           >
             Reset Session
           </Button>
        )}
      </div>
    </div>
  );
}
