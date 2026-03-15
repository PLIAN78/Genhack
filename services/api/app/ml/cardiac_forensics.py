import numpy as np
from dataclasses import dataclass
from typing import Dict
from enum import Enum


class HRTrend(Enum):
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"


@dataclass
class CardiacFeatures:
    heart_rate: float
    heart_rate_confidence: float
    heart_rate_variability: float
    rmssd: float
    pnn50: float
    lf_hf_ratio: float
    approximate_entropy: float
    detrended_fluctuation: float
    heart_rate_trend: str
    heart_rate_elevation_percent: float
    hrv_change_percent: float
    carotid_pulse_visibility: float
    carotid_pulse_strength: float
    breathing_rate: float
    stress_index: float
    cardiovascular_stability: float

    def to_feature_vector(self) -> np.ndarray:
        return np.array([
            self.heart_rate / 200.0,
            self.heart_rate_confidence,
            self.heart_rate_variability / 100.0,
            self.rmssd / 100.0,
            self.pnn50 / 100.0,
            self.lf_hf_ratio / 5.0,
            self.approximate_entropy,
            self.detrended_fluctuation,
            self._trend_to_scalar(),
            self.heart_rate_elevation_percent / 100.0,
            self.hrv_change_percent / 100.0,
            self.carotid_pulse_visibility,
            self.carotid_pulse_strength,
            self.breathing_rate / 30.0,
            self.stress_index,
        ], dtype=np.float32)

    def _trend_to_scalar(self) -> float:
        trends = {
            "increasing": 1.0,
            "decreasing": 0.0,
            "stable": 0.5,
        }
        return trends.get(self.heart_rate_trend, 0.5)

    def to_dict(self) -> Dict:
        return {
            "heart_rate": float(self.heart_rate),
            "heart_rate_confidence": float(self.heart_rate_confidence),
            "heart_rate_variability": float(self.heart_rate_variability),
            "rmssd": float(self.rmssd),
            "pnn50": float(self.pnn50),
            "lf_hf_ratio": float(self.lf_hf_ratio),
            "approximate_entropy": float(self.approximate_entropy),
            "detrended_fluctuation": float(self.detrended_fluctuation),
            "heart_rate_trend": self.heart_rate_trend,
            "heart_rate_elevation_percent": float(self.heart_rate_elevation_percent),
            "hrv_change_percent": float(self.hrv_change_percent),
            "carotid_pulse_visibility": float(self.carotid_pulse_visibility),
            "carotid_pulse_strength": float(self.carotid_pulse_strength),
            "breathing_rate": float(self.breathing_rate),
            "stress_index": float(self.stress_index),
            "cardiovascular_stability": float(self.cardiovascular_stability),
        }


class CardiacForensicsExtractor:
    def __init__(self):
        self.baseline_heart_rate = None
        self.baseline_hrv = None

    def extract_features(self, face_image: np.ndarray) -> CardiacFeatures:
        return CardiacFeatures(
            heart_rate=np.random.uniform(60, 100),
            heart_rate_confidence=np.random.uniform(0.5, 1.0),
            heart_rate_variability=np.random.uniform(20, 80),
            rmssd=np.random.uniform(10, 60),
            pnn50=np.random.uniform(5, 50),
            lf_hf_ratio=np.random.uniform(1.0, 3.0),
            approximate_entropy=np.random.uniform(0.8, 1.5),
            detrended_fluctuation=np.random.uniform(0.5, 1.5),
            heart_rate_trend="stable",
            heart_rate_elevation_percent=np.random.uniform(-20, 30),
            hrv_change_percent=np.random.uniform(-30, 30),
            carotid_pulse_visibility=np.random.uniform(0.3, 1.0),
            carotid_pulse_strength=np.random.uniform(0.3, 1.0),
            breathing_rate=np.random.uniform(12, 20),
            stress_index=np.random.uniform(0, 1),
            cardiovascular_stability=np.random.uniform(0.5, 1.0),
        )