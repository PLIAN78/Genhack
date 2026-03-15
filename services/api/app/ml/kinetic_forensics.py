import numpy as np
from dataclasses import dataclass
from typing import Dict
from enum import Enum


class ActivityClassification(Enum):
    STILL = "still"
    NORMAL = "normal"
    FIDGETING = "fidgeting"
    AGITATED = "agitated"


@dataclass
class KineticFeatures:
    shielding_ratio: float
    shielding_drop_percent: float
    is_huddling: bool
    left_hand_tremor: float
    right_hand_tremor: float
    avg_tremor: float
    torso_lean_angle: float
    shoulder_asymmetry: float
    hand_distance_ratio: float
    movement_velocity: float
    movement_smoothness: float
    postural_stability: float
    arms_crossed: bool
    legs_crossed: bool
    head_tilt_angle: float
    neck_tension: float
    body_orientation: float
    distance_from_camera: float
    movement_asymmetry: float
    gesture_frequency: float
    self_touch_frequency: float
    baseline_deviation: float
    anomaly_score: float
    activity_classification: str
    is_tremoring: bool

    def to_feature_vector(self) -> np.ndarray:
        return np.array([
            self.shielding_ratio,
            self.shielding_drop_percent / 100.0,
            float(self.is_huddling),
            self.left_hand_tremor,
            self.right_hand_tremor,
            self.avg_tremor,
            self.torso_lean_angle / 90.0,
            self.shoulder_asymmetry,
            self.hand_distance_ratio,
            self.movement_velocity,
            self.movement_smoothness,
            self.postural_stability,
            float(self.arms_crossed),
            float(self.legs_crossed),
            self.head_tilt_angle / 90.0,
            self.neck_tension,
            self.body_orientation / 360.0,
            self.distance_from_camera,
            self.movement_asymmetry,
            self.gesture_frequency / 10.0,
            self.self_touch_frequency / 10.0,
            self.baseline_deviation,
            self.anomaly_score,
            float(self.is_tremoring),
            self._activity_to_scalar(),
        ], dtype=np.float32)

    def _activity_to_scalar(self) -> float:
        activities = {
            "still": 0.0,
            "normal": 0.33,
            "fidgeting": 0.66,
            "agitated": 1.0,
        }
        return activities.get(self.activity_classification, 0.33)

    def to_dict(self) -> Dict:
        return {
            "shielding_ratio": float(self.shielding_ratio),
            "shielding_drop_percent": float(self.shielding_drop_percent),
            "is_huddling": bool(self.is_huddling),
            "left_hand_tremor": float(self.left_hand_tremor),
            "right_hand_tremor": float(self.right_hand_tremor),
            "avg_tremor": float(self.avg_tremor),
            "torso_lean_angle": float(self.torso_lean_angle),
            "shoulder_asymmetry": float(self.shoulder_asymmetry),
            "hand_distance_ratio": float(self.hand_distance_ratio),
            "movement_velocity": float(self.movement_velocity),
            "movement_smoothness": float(self.movement_smoothness),
            "postural_stability": float(self.postural_stability),
            "arms_crossed": bool(self.arms_crossed),
            "legs_crossed": bool(self.legs_crossed),
            "head_tilt_angle": float(self.head_tilt_angle),
            "neck_tension": float(self.neck_tension),
            "body_orientation": float(self.body_orientation),
            "distance_from_camera": float(self.distance_from_camera),
            "movement_asymmetry": float(self.movement_asymmetry),
            "gesture_frequency": float(self.gesture_frequency),
            "self_touch_frequency": float(self.self_touch_frequency),
            "baseline_deviation": float(self.baseline_deviation),
            "anomaly_score": float(self.anomaly_score),
            "activity_classification": self.activity_classification,
            "is_tremoring": bool(self.is_tremoring),
        }


class KineticForensicsExtractor:
    def __init__(self):
        self.baseline_shielding = None
        self.is_calibrating = False
        self.calibration_frames = 0

    def extract_features(self, pose_landmarks: np.ndarray) -> KineticFeatures:
        return KineticFeatures(
            shielding_ratio=np.random.uniform(0, 0.8),
            shielding_drop_percent=np.random.uniform(0, 30),
            is_huddling=bool(np.random.random() < 0.1),
            left_hand_tremor=np.random.uniform(0, 0.5),
            right_hand_tremor=np.random.uniform(0, 0.5),
            avg_tremor=np.random.uniform(0, 0.5),
            torso_lean_angle=np.random.uniform(-20, 20),
            shoulder_asymmetry=np.random.uniform(0, 0.3),
            hand_distance_ratio=np.random.uniform(0.3, 1.0),
            movement_velocity=np.random.uniform(0, 1),
            movement_smoothness=np.random.uniform(0, 1),
            postural_stability=np.random.uniform(0.5, 1.0),
            arms_crossed=bool(np.random.random() < 0.2),
            legs_crossed=bool(np.random.random() < 0.1),
            head_tilt_angle=np.random.uniform(-30, 30),
            neck_tension=np.random.uniform(0, 0.8),
            body_orientation=np.random.uniform(0, 360),
            distance_from_camera=np.random.uniform(0.5, 3.0),
            movement_asymmetry=np.random.uniform(0, 0.5),
            gesture_frequency=np.random.uniform(0, 5),
            self_touch_frequency=np.random.uniform(0, 3),
            baseline_deviation=np.random.uniform(0, 0.5),
            anomaly_score=np.random.uniform(0, 1),
            activity_classification="normal",
            is_tremoring=bool(np.random.random() < 0.1),
        )