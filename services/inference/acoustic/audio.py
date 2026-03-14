import numpy as np
# In a real environment, we'd use scipy.signal for STFT computation 
# from scipy.signal import stft

class AcousticForensics:
    def __init__(self):
        self.baseline_f0: float = None
        self.f0_history = []
        
    def _extract_f0_jitter(self, audio_chunk: np.ndarray, fs: int = 16000) -> float:
        """
        Calculates Fundamental Frequency (F0) instability in the 8-12 Hz tremor range.
        For MVP, calculates simple standard deviation of simulated pitch periods.
        """
        if len(audio_chunk) == 0:
            return 0.0
            
        # Extracted pitch periods (T0) via autocorrelation proxy
        periods = np.abs(audio_chunk - np.mean(audio_chunk))
        
        # Jitter: cycle-to-cycle variability
        if len(periods) > 1:
            diffs = np.diff(periods)
            jitter = np.mean(np.abs(diffs)) / (np.mean(periods) + 1e-6)
            return float(jitter)
            
        return 0.0

    def _extract_shimmer(self, audio_chunk: np.ndarray) -> float:
        """
        Calculates Amplitude instability (Shimmer) cycle-to-cycle.
        """
        if len(audio_chunk) <= 1:
            return 0.0
            
        amps = np.abs(audio_chunk)
        diffs = np.diff(amps)
        shimmer = np.mean(np.abs(diffs)) / (np.mean(amps) + 1e-6)
        
        return float(shimmer)

    def process_audio(self, raw_audio: List[float], lip_sync_latency_ms: float, is_calibration: bool) -> Dict[str, float]:
        """
        Main entry point for acoustic stress analysis.
        """
        # Convert raw to numpy array chunk
        audio_arr = np.array(raw_audio)
        
        jitter = self._extract_f0_jitter(audio_arr)
        shimmer = self._extract_shimmer(audio_arr)
        
        if is_calibration:
            self.f0_history.append(jitter)
            if len(self.f0_history) > 30: # 30 chunks
                self.baseline_f0 = np.mean(self.f0_history)
            return {"status": "calibrating"}
            
        # Cognitive Latency / "Liar's Gap" Check
        latency_flag = lip_sync_latency_ms > 1500 # > 1.5 seconds delay to answer
        
        is_stressed = False
        if self.baseline_f0 and jitter > self.baseline_f0 * 1.5:
             is_stressed = True
             
        return {
            "f0_jitter": jitter,
            "shimmer": shimmer,
            "cognitive_latency_ms": lip_sync_latency_ms,
            "latency_flag": latency_flag,
            "is_stressed": is_stressed
        }
