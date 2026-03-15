"""
Threat Classification Module

Combines ocular, kinetic, and cardiac forensic features into a
multimodal behavioral threat assessment.

This is a reconstructed implementation based on the branch summary.
"""

from __future__ import annotations

import json
import os
import pickle
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

from .ocular_forensics import OcularFeatures, OcularForensicsExtractor
from .kinetic_forensics import KineticFeatures, KineticForensicsExtractor
from .cardiac_forensics import CardiacFeatures, CardiacForensicsExtractor


MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class ThreatAssessment:
    """Container for final threat assessment."""
    threat_score: float
    threat_level: str
    confidence: float
    reasoning: str
    triggered_signals: list[str]
    ocular_features: Dict[str, Any]
    kinetic_features: Dict[str, Any]
    cardiac_features: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ThreatClassifier:
    """
    Main numerical threat classifier.

    If a trained model exists, it will be used.
    Otherwise, a deterministic heuristic fallback is used.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = Path(model_path) if model_path else MODEL_DIR / "threat_model.pkl"
        self.model = None
        self.feature_names = []
        self._load_model_if_exists()

    def _load_model_if_exists(self) -> None:
        if self.model_path.exists():
            try:
                with open(self.model_path, "rb") as f:
                    payload = pickle.load(f)
                self.model = payload.get("model")
                self.feature_names = payload.get("feature_names", [])
            except Exception:
                self.model = None
                self.feature_names = []

    def save_model(self, model: Any, feature_names: list[str]) -> None:
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.model_path, "wb") as f:
            pickle.dump({"model": model, "feature_names": feature_names}, f)
        self.model = model
        self.feature_names = feature_names

    def build_feature_vector(
        self,
        ocular: OcularFeatures,
        kinetic: KineticFeatures,
        cardiac: CardiacFeatures,
    ) -> np.ndarray:
        ocular_vec = ocular.to_feature_vector()
        kinetic_vec = kinetic.to_feature_vector()
        cardiac_vec = cardiac.to_feature_vector()
        return np.concatenate([ocular_vec, kinetic_vec, cardiac_vec], axis=0).astype(np.float32)

    def predict_score(
        self,
        ocular: OcularFeatures,
        kinetic: KineticFeatures,
        cardiac: CardiacFeatures,
    ) -> tuple[float, float]:
        """
        Returns:
            (threat_score, confidence)
        """
        x = self.build_feature_vector(ocular, kinetic, cardiac).reshape(1, -1)

        if self.model is not None:
            try:
                if hasattr(self.model, "predict_proba"):
                    proba = float(self.model.predict_proba(x)[0][1])
                    confidence = max(proba, 1.0 - proba)
                    return proba, confidence
                pred = float(self.model.predict(x)[0])
                score = float(np.clip(pred, 0.0, 1.0))
                confidence = 0.75
                return score, confidence
            except Exception:
                pass

        return self._heuristic_score(ocular, kinetic, cardiac)

    def _heuristic_score(
        self,
        ocular: OcularFeatures,
        kinetic: KineticFeatures,
        cardiac: CardiacFeatures,
    ) -> tuple[float, float]:
        """
        Fallback threat scoring heuristic.
        """
        score = 0.0

        # Ocular
        score += min(ocular.gaze_deviation_deg / 90.0, 1.0) * 0.08
        score += min(ocular.blink_rate / 40.0, 1.0) * 0.06
        score += min(ocular.saccadic_sweep_rate / 8.0, 1.0) * 0.08
        score += ocular.emotion_fear * 0.08
        score += ocular.emotion_anger * 0.06
        score += ocular.microexpression_score * 0.10
        score += (1.0 if ocular.peripheral_sweep_detected else 0.0) * 0.08
        score += (1.0 if ocular.gaze_aversion else 0.0) * 0.05
        score += min(max(ocular.pupil_dilation_percent, 0.0) / 40.0, 1.0) * 0.06

        # Kinetic
        score += min(kinetic.shielding_drop_percent / 50.0, 1.0) * 0.07
        score += (1.0 if kinetic.is_huddling else 0.0) * 0.05
        score += min(kinetic.avg_tremor / 0.6, 1.0) * 0.08
        score += min(abs(kinetic.torso_lean_angle) / 45.0, 1.0) * 0.03
        score += (1.0 if kinetic.arms_crossed else 0.0) * 0.03
        score += min(kinetic.self_touch_frequency / 5.0, 1.0) * 0.07
        score += min(kinetic.baseline_deviation / 0.7, 1.0) * 0.07
        score += kinetic.anomaly_score * 0.10
        score += (1.0 if kinetic.is_tremoring else 0.0) * 0.06

        # Cardiac
        score += min(max(cardiac.heart_rate_elevation_percent, 0.0) / 40.0, 1.0) * 0.10
        score += min(abs(cardiac.hrv_change_percent) / 50.0, 1.0) * 0.05
        score += cardiac.stress_index * 0.12
        score += (1.0 - cardiac.cardiovascular_stability) * 0.08
        if cardiac.heart_rate_trend == "increasing":
            score += 0.04

        score = float(np.clip(score, 0.0, 1.0))

        # heuristic confidence rises with stronger evidence
        confidence = float(np.clip(0.55 + abs(score - 0.5), 0.0, 0.95))
        return score, confidence

    def score_to_level(self, score: float) -> str:
        if score < 0.25:
            return "low"
        if score < 0.50:
            return "guarded"
        if score < 0.75:
            return "elevated"
        return "high"

    def identify_triggered_signals(
        self,
        ocular: OcularFeatures,
        kinetic: KineticFeatures,
        cardiac: CardiacFeatures,
    ) -> list[str]:
        signals: list[str] = []

        if ocular.gaze_deviation_deg > 20:
            signals.append("high gaze deviation")
        if ocular.saccadic_sweep_rate > 3.5:
            signals.append("frequent ocular sweeps")
        if ocular.microexpression_score > 0.12:
            signals.append("microexpression anomaly")
        if ocular.gaze_aversion:
            signals.append("gaze aversion")
        if ocular.peripheral_sweep_detected:
            signals.append("peripheral sweep detected")

        if kinetic.avg_tremor > 0.3:
            signals.append("hand tremor")
        if kinetic.self_touch_frequency > 1.5:
            signals.append("elevated self-touch frequency")
        if kinetic.anomaly_score > 0.65:
            signals.append("kinetic anomaly")
        if kinetic.is_huddling:
            signals.append("huddling posture")
        if kinetic.is_tremoring:
            signals.append("visible tremor")

        if cardiac.stress_index > 0.65:
            signals.append("physiological stress")
        if cardiac.heart_rate_elevation_percent > 10:
            signals.append("elevated heart rate")
        if cardiac.heart_rate_trend == "increasing":
            signals.append("increasing heart rate trend")

        return signals

    def assess(
        self,
        ocular: OcularFeatures,
        kinetic: KineticFeatures,
        cardiac: CardiacFeatures,
        reasoner: Optional["LLMThreatReasoner"] = None,
    ) -> ThreatAssessment:
        score, confidence = self.predict_score(ocular, kinetic, cardiac)
        threat_level = self.score_to_level(score)
        triggered = self.identify_triggered_signals(ocular, kinetic, cardiac)

        default_reasoning = (
            f"Threat level is {threat_level} with score {score:.2f}. "
            f"Signals detected: {', '.join(triggered) if triggered else 'none significant'}."
        )

        reasoning = default_reasoning
        if reasoner is not None:
            try:
                reasoning = reasoner.reason(
                    threat_score=score,
                    threat_level=threat_level,
                    triggered_signals=triggered,
                    ocular=ocular.to_dict(),
                    kinetic=kinetic.to_dict(),
                    cardiac=cardiac.to_dict(),
                )
            except Exception:
                reasoning = default_reasoning

        return ThreatAssessment(
            threat_score=score,
            threat_level=threat_level,
            confidence=confidence,
            reasoning=reasoning,
            triggered_signals=triggered,
            ocular_features=ocular.to_dict(),
            kinetic_features=kinetic.to_dict(),
            cardiac_features=cardiac.to_dict(),
        )


class LLMThreatReasoner:
    """
    Optional reasoning layer using OpenAI if OPENAI_API_KEY is available.
    Falls back to deterministic text otherwise.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.api_key = os.getenv("OPENAI_API_KEY")

    def reason(
        self,
        threat_score: float,
        threat_level: str,
        triggered_signals: list[str],
        ocular: Dict[str, Any],
        kinetic: Dict[str, Any],
        cardiac: Dict[str, Any],
    ) -> str:
        if not self.api_key:
            return (
                f"Assessment is {threat_level} ({threat_score:.2f}). "
                f"Primary contributors: {', '.join(triggered_signals) if triggered_signals else 'no dominant anomalies'}."
            )

        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.api_key)

            prompt = {
                "threat_score": threat_score,
                "threat_level": threat_level,
                "triggered_signals": triggered_signals,
                "ocular": ocular,
                "kinetic": kinetic,
                "cardiac": cardiac,
            }

            response = client.responses.create(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You are a concise behavioral-threat reasoning assistant. "
                            "Explain the likely drivers of the score in 2-4 sentences. "
                            "Do not claim certainty. Avoid medical diagnosis."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(prompt),
                    },
                ],
            )

            text = getattr(response, "output_text", None)
            if text:
                return text.strip()

        except Exception:
            pass

        return (
            f"Assessment is {threat_level} ({threat_score:.2f}). "
            f"Primary contributors: {', '.join(triggered_signals) if triggered_signals else 'no dominant anomalies'}."
        )


class MultimodalThreatEngine:
    """
    End-to-end orchestrator:
    - extracts ocular features from face image
    - extracts kinetic features from pose landmarks
    - extracts cardiac features from face image
    - returns final ThreatAssessment
    """

    def __init__(
        self,
        classifier: Optional[ThreatClassifier] = None,
        reasoner: Optional[LLMThreatReasoner] = None,
    ):
        self.ocular_extractor = OcularForensicsExtractor()
        self.kinetic_extractor = KineticForensicsExtractor()
        self.cardiac_extractor = CardiacForensicsExtractor()
        self.classifier = classifier or ThreatClassifier()
        self.reasoner = reasoner or LLMThreatReasoner()

    def analyze(
        self,
        face_image: np.ndarray,
        pose_landmarks: np.ndarray,
    ) -> ThreatAssessment:
        ocular = self.ocular_extractor.extract_features(face_image)
        kinetic = self.kinetic_extractor.extract_features(pose_landmarks)
        cardiac = self.cardiac_extractor.extract_features(face_image)

        return self.classifier.assess(
            ocular=ocular,
            kinetic=kinetic,
            cardiac=cardiac,
            reasoner=self.reasoner,
        )