"""
Train models for the Security Copilot ML backend.

This is a reconstructed training script that creates a binary classifier
from synthetic multimodal features if no dataset is provided.

Usage:
    python services/api/scripts/train_models.py --train-all
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import numpy as np

# Make package imports work when running as a script
ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.api.app.ml.ocular_forensics import OcularFeatures
from services.api.app.ml.kinetic_forensics import KineticFeatures
from services.api.app.ml.cardiac_forensics import CardiacFeatures
from services.api.app.ml.threat_classifier import ThreatClassifier


def random_ocular(high_risk: bool) -> OcularFeatures:
    if high_risk:
        return OcularFeatures(
            gaze_deviation_deg=np.random.uniform(18, 45),
            gaze_direction=random.choice(["left", "right", "center_left", "center_right"]),
            blink_rate=np.random.uniform(18, 35),
            blink_volatility=np.random.uniform(0.4, 1.0),
            saccadic_sweep_rate=np.random.uniform(3, 7),
            eye_aspect_ratio=np.random.uniform(0.12, 0.35),
            emotion_anger=np.random.uniform(0.1, 0.6),
            emotion_disgust=np.random.uniform(0.0, 0.4),
            emotion_fear=np.random.uniform(0.2, 0.8),
            emotion_surprise=np.random.uniform(0.0, 0.5),
            emotion_sadness=np.random.uniform(0.0, 0.4),
            microexpression_score=np.random.uniform(0.08, 0.35),
            peripheral_sweep_detected=np.random.random() < 0.55,
            gaze_aversion=np.random.random() < 0.45,
            pupil_dilation_percent=np.random.uniform(5, 30),
        )

    return OcularFeatures(
        gaze_deviation_deg=np.random.uniform(0, 15),
        gaze_direction="center",
        blink_rate=np.random.uniform(8, 20),
        blink_volatility=np.random.uniform(0.05, 0.35),
        saccadic_sweep_rate=np.random.uniform(0.5, 3),
        eye_aspect_ratio=np.random.uniform(0.2, 0.45),
        emotion_anger=np.random.uniform(0.0, 0.2),
        emotion_disgust=np.random.uniform(0.0, 0.15),
        emotion_fear=np.random.uniform(0.0, 0.2),
        emotion_surprise=np.random.uniform(0.0, 0.2),
        emotion_sadness=np.random.uniform(0.0, 0.2),
        microexpression_score=np.random.uniform(0.0, 0.1),
        peripheral_sweep_detected=False,
        gaze_aversion=np.random.random() < 0.08,
        pupil_dilation_percent=np.random.uniform(-8, 10),
    )


def random_kinetic(high_risk: bool) -> KineticFeatures:
    if high_risk:
        return KineticFeatures(
            shielding_ratio=np.random.uniform(0.2, 0.9),
            shielding_drop_percent=np.random.uniform(10, 45),
            is_huddling=np.random.random() < 0.3,
            left_hand_tremor=np.random.uniform(0.15, 0.55),
            right_hand_tremor=np.random.uniform(0.15, 0.55),
            avg_tremor=np.random.uniform(0.15, 0.55),
            torso_lean_angle=np.random.uniform(-30, 30),
            shoulder_asymmetry=np.random.uniform(0.05, 0.4),
            hand_distance_ratio=np.random.uniform(0.2, 0.9),
            movement_velocity=np.random.uniform(0.2, 1.0),
            movement_smoothness=np.random.uniform(0.0, 0.7),
            postural_stability=np.random.uniform(0.2, 0.8),
            arms_crossed=np.random.random() < 0.4,
            legs_crossed=np.random.random() < 0.2,
            head_tilt_angle=np.random.uniform(-35, 35),
            neck_tension=np.random.uniform(0.3, 0.9),
            body_orientation=np.random.uniform(0, 360),
            distance_from_camera=np.random.uniform(0.5, 3.0),
            movement_asymmetry=np.random.uniform(0.1, 0.6),
            gesture_frequency=np.random.uniform(1.0, 6.0),
            self_touch_frequency=np.random.uniform(1.0, 4.0),
            baseline_deviation=np.random.uniform(0.2, 0.8),
            anomaly_score=np.random.uniform(0.4, 1.0),
            activity_classification=random.choice(["fidgeting", "agitated"]),
            is_tremoring=np.random.random() < 0.5,
        )

    return KineticFeatures(
        shielding_ratio=np.random.uniform(0.0, 0.4),
        shielding_drop_percent=np.random.uniform(0, 15),
        is_huddling=False,
        left_hand_tremor=np.random.uniform(0.0, 0.2),
        right_hand_tremor=np.random.uniform(0.0, 0.2),
        avg_tremor=np.random.uniform(0.0, 0.2),
        torso_lean_angle=np.random.uniform(-12, 12),
        shoulder_asymmetry=np.random.uniform(0.0, 0.15),
        hand_distance_ratio=np.random.uniform(0.4, 1.0),
        movement_velocity=np.random.uniform(0.0, 0.7),
        movement_smoothness=np.random.uniform(0.4, 1.0),
        postural_stability=np.random.uniform(0.6, 1.0),
        arms_crossed=np.random.random() < 0.1,
        legs_crossed=np.random.random() < 0.05,
        head_tilt_angle=np.random.uniform(-15, 15),
        neck_tension=np.random.uniform(0.0, 0.4),
        body_orientation=np.random.uniform(0, 360),
        distance_from_camera=np.random.uniform(0.5, 3.0),
        movement_asymmetry=np.random.uniform(0.0, 0.2),
        gesture_frequency=np.random.uniform(0.0, 3.0),
        self_touch_frequency=np.random.uniform(0.0, 1.0),
        baseline_deviation=np.random.uniform(0.0, 0.3),
        anomaly_score=np.random.uniform(0.0, 0.4),
        activity_classification=random.choice(["still", "normal"]),
        is_tremoring=False,
    )


def random_cardiac(high_risk: bool) -> CardiacFeatures:
    if high_risk:
        return CardiacFeatures(
            heart_rate=np.random.uniform(85, 130),
            heart_rate_confidence=np.random.uniform(0.6, 1.0),
            heart_rate_variability=np.random.uniform(10, 40),
            rmssd=np.random.uniform(8, 30),
            pnn50=np.random.uniform(2, 20),
            lf_hf_ratio=np.random.uniform(2.0, 4.5),
            approximate_entropy=np.random.uniform(0.8, 1.5),
            detrended_fluctuation=np.random.uniform(0.6, 1.4),
            heart_rate_trend="increasing",
            heart_rate_elevation_percent=np.random.uniform(8, 35),
            hrv_change_percent=np.random.uniform(-40, -5),
            carotid_pulse_visibility=np.random.uniform(0.3, 1.0),
            carotid_pulse_strength=np.random.uniform(0.3, 1.0),
            breathing_rate=np.random.uniform(18, 28),
            stress_index=np.random.uniform(0.5, 1.0),
            cardiovascular_stability=np.random.uniform(0.2, 0.8),
        )

    return CardiacFeatures(
        heart_rate=np.random.uniform(58, 90),
        heart_rate_confidence=np.random.uniform(0.6, 1.0),
        heart_rate_variability=np.random.uniform(35, 85),
        rmssd=np.random.uniform(20, 70),
        pnn50=np.random.uniform(15, 55),
        lf_hf_ratio=np.random.uniform(0.8, 2.2),
        approximate_entropy=np.random.uniform(0.8, 1.5),
        detrended_fluctuation=np.random.uniform(0.6, 1.4),
        heart_rate_trend="stable",
        heart_rate_elevation_percent=np.random.uniform(-10, 8),
        hrv_change_percent=np.random.uniform(-10, 10),
        carotid_pulse_visibility=np.random.uniform(0.3, 1.0),
        carotid_pulse_strength=np.random.uniform(0.3, 1.0),
        breathing_rate=np.random.uniform(10, 18),
        stress_index=np.random.uniform(0.0, 0.5),
        cardiovascular_stability=np.random.uniform(0.6, 1.0),
    )


def make_dataset(n_samples: int = 2000):
    classifier = ThreatClassifier()
    xs = []
    ys = []

    for _ in range(n_samples):
        label = 1 if np.random.random() < 0.5 else 0
        ocular = random_ocular(high_risk=bool(label))
        kinetic = random_kinetic(high_risk=bool(label))
        cardiac = random_cardiac(high_risk=bool(label))
        x = classifier.build_feature_vector(ocular, kinetic, cardiac)
        xs.append(x)
        ys.append(label)

    return np.array(xs, dtype=np.float32), np.array(ys, dtype=np.int32)


def train_model():
    x, y = make_dataset()

    try:
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import accuracy_score, classification_report
    except ImportError as e:
        raise RuntimeError("scikit-learn is required for training") from e

    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.2, random_state=42, stratify=y
    )

    model = None
    model_name = None

    try:
        from xgboost import XGBClassifier

        model = XGBClassifier(
            n_estimators=120,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.9,
            colsample_bytree=0.9,
            eval_metric="logloss",
            random_state=42,
        )
        model_name = "xgboost"
    except Exception:
        from sklearn.ensemble import RandomForestClassifier

        model = RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            random_state=42,
        )
        model_name = "random_forest"

    model.fit(x_train, y_train)
    preds = model.predict(x_test)

    acc = accuracy_score(y_test, preds)
    print(f"model: {model_name}")
    print(f"accuracy: {acc:.4f}")
    print(classification_report(y_test, preds))

    feature_names = [f"f_{i}" for i in range(x.shape[1])]
    classifier = ThreatClassifier()
    classifier.save_model(model, feature_names)

    print("saved model to services/api/models/threat_model.pkl")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-all", action="store_true", help="train the threat model")
    args = parser.parse_args()

    if args.train_all:
        train_model()
    else:
        print("Nothing to do. Use --train-all")


if __name__ == "__main__":
    main()