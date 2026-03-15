import numpy as np
from dataclasses import dataclass
from typing import Dict
import cv2


@dataclass
class OcularFeatures:
    gaze_deviation_deg: float
    gaze_direction: str
    blink_rate: float
    blink_volatility: float
    saccadic_sweep_rate: float
    eye_aspect_ratio: float
    emotion_anger: float
    emotion_disgust: float
    emotion_fear: float
    emotion_surprise: float
    emotion_sadness: float
    microexpression_score: float
    peripheral_sweep_detected: bool
    gaze_aversion: bool
    pupil_dilation_percent: float
    
    def to_feature_vector(self) -> np.ndarray:
        return np.array([
            self.gaze_deviation_deg / 180.0,
            self._gaze_direction_to_scalar(),
            self.blink_rate / 30.0,
            self.blink_volatility,
            self.saccadic_sweep_rate / 10.0,
            self.eye_aspect_ratio,
            self.emotion_anger,
            self.emotion_disgust,
            self.emotion_fear,
            self.emotion_surprise,
            self.emotion_sadness,
            self.microexpression_score,
            float(self.peripheral_sweep_detected),
            float(self.gaze_aversion),
            self.pupil_dilation_percent / 100.0,
            0.0, 0.0, 0.0, 0.0, 0.0,
        ])
    
    def _gaze_direction_to_scalar(self) -> float:
        directions = {
            'left': 0.0,
            'center_left': 0.25,
            'center': 0.5,
            'center_right': 0.75,
            'right': 1.0,
            'up': 0.3,
            'down': 0.7,
        }
        return directions.get(self.gaze_direction, 0.5)

    def to_dict(self) -> Dict:
        return {
            'gaze_deviation_deg': float(self.gaze_deviation_deg),
            'gaze_direction': self.gaze_direction,
            'blink_rate': float(self.blink_rate),
            'blink_volatility': float(self.blink_volatility),
            'saccadic_sweep_rate': float(self.saccadic_sweep_rate),
            'eye_aspect_ratio': float(self.eye_aspect_ratio),
            'emotion_anger': float(self.emotion_anger),
            'emotion_disgust': float(self.emotion_disgust),
            'emotion_fear': float(self.emotion_fear),
            'emotion_surprise': float(self.emotion_surprise),
            'emotion_sadness': float(self.emotion_sadness),
            'microexpression_score': float(self.microexpression_score),
            'peripheral_sweep_detected': bool(self.peripheral_sweep_detected),
            'gaze_aversion': bool(self.gaze_aversion),
            'pupil_dilation_percent': float(self.pupil_dilation_percent),
        }


class OcularForensicsExtractor:
    def __init__(self):
        self.baseline_blink_rate = None
        self.baseline_pupil_size = None
    
    def extract_features(self, face_image: np.ndarray) -> OcularFeatures:
        features = OcularFeatures(
            gaze_deviation_deg=np.random.uniform(0, 30),
            gaze_direction='center',
            blink_rate=np.random.uniform(12, 25),
            blink_volatility=np.random.uniform(0.1, 0.8),
            saccadic_sweep_rate=np.random.uniform(1, 5),
            eye_aspect_ratio=np.random.uniform(0.1, 0.5),
            emotion_anger=np.random.uniform(0, 0.3),
            emotion_disgust=np.random.uniform(0, 0.3),
            emotion_fear=np.random.uniform(0, 0.3),
            emotion_surprise=np.random.uniform(0, 0.3),
            emotion_sadness=np.random.uniform(0, 0.3),
            microexpression_score=np.random.uniform(0, 0.2),
            peripheral_sweep_detected=False,
            gaze_aversion=False,
            pupil_dilation_percent=np.random.uniform(-10, 20),
        )
        return features