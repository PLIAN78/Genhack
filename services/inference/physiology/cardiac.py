import numpy as np
from typing import List, Dict

class CardiacForensics:
    def __init__(self):
        self.baseline_hr: float = None
        self.hr_history: List[float] = []
        
    def _pos_extraction_mock(self, green_channel_intensity: List[float]) -> float:
        """
        Mock implementation of Plane-Orthogonal-to-Skin (POS) algorithm.
        In reality, this extracts the pulse wave from the Green channel 
        and applies a 0.75-4 Hz temporal filter (45-240 BPM).
        """
        if len(green_channel_intensity) < 30:
            return 70.0 # Default rest
            
        # Mocking finding frequency peaks in the 0.75-4Hz range
        # Assume intensity fluctuates with blood volume
        variance = np.var(green_channel_intensity[-30:]) * 100
        # Map variance proxy to a BPM
        return min(max(60.0 + variance, 45.0), 200.0)

    def _evm_carotid_mock(self, neck_roi_motion: float) -> float:
        """
        Mock of Eulerian Video Magnification (EVM) for carotid pulse visibility.
        Detects physical thumping of the neck artery.
        Returns a confidence score of pulse physical visibility (0.0 - 1.0).
        """
        # Simulated spatial filtering amplification proxy
        visibility_score = min(neck_roi_motion * 10.0, 1.0)
        return float(visibility_score)

    def process_physiology(self, green_intensity: List[float], neck_motion: float, is_calibration: bool) -> Dict[str, float]:
        """
        Main entry point for Cardiac/rPPG metrics.
        """
        hr = self._pos_extraction_mock(green_intensity)
        carotid_visibility = self._evm_carotid_mock(neck_motion)
        
        # Determine signal quality based on length of good extraction data
        quality = 0.95 if len(green_intensity) >= 30 else (len(green_intensity) / 30.0)
        
        if is_calibration:
            if quality > 0.6:
                self.hr_history.append(hr)
            if len(self.hr_history) > 30:
                self.baseline_hr = np.mean(self.hr_history)
            return {"status": "calibrating", "quality": quality}
            
        # Inquiry Phase Analysis
        is_elevated = False
        if self.baseline_hr and hr > (self.baseline_hr * 1.2): # 20% increase
            is_elevated = True
            
        return {
            "heart_rate": hr,
            "carotid_visibility": carotid_visibility,
            "quality": quality,
            "is_elevated": is_elevated
        }
