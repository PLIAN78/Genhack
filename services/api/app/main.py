from datetime import datetime
from typing import List, Optional, Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(
    title="Security Copilot API",
    version="2.0.0",
    description="Dashboard-connected multimodal risk analysis API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GraphNode(BaseModel):
    id: str
    label: str
    type: Literal["vision", "physiology", "acoustic", "risk", "context"]
    score: float
    confidence: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    reason: Optional[str] = None


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float


class SessionEvent(BaseModel):
    session_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    phase: Literal["calibration", "inquiry", "release"]


class VisionSignal(BaseModel):
    face_visible: bool
    person_count: int
    motion_spike: float
    proximity_breach: bool
    saccadic_sweep_rate: float
    blink_rate_volatility: float
    ventral_shielding_ratio: float
    micro_dithering_amplitude: float
    confidence: float = Field(..., ge=0.0, le=1.0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PhysiologySignal(BaseModel):
    heart_rate: float
    breathing_rate: float
    heart_rate_variability: float
    quality: float = Field(..., ge=0.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AcousticSignal(BaseModel):
    f0_jitter: float
    shimmer: float
    cognitive_latency_ms: float
    confidence: float = Field(..., ge=0.0, le=1.0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class RiskAlert(BaseModel):
    session_id: str
    risk_score: float = Field(..., ge=0.0, le=100.0)
    severity: Literal["low", "medium", "high", "critical"]
    contributors: List[str]
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AnalyzeRequest(BaseModel):
    session: SessionEvent
    vision: VisionSignal
    physiology: Optional[PhysiologySignal] = None
    acoustic: Optional[AcousticSignal] = None


def compute_risk(payload: AnalyzeRequest) -> RiskAlert:
    contributors: List[str] = []
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []

    risk_score = 0.0

    v = payload.vision
    p = payload.physiology

    if not v.face_visible:
        risk_score += 10
        contributors.append("face_not_visible")
        nodes.append(
            GraphNode(
                id="vision_face_hidden",
                label="Face Not Visible",
                type="vision",
                score=0.55,
                confidence=v.confidence,
                reason="Face tracking lost or obstructed.",
            )
        )

    if v.person_count > 1:
        risk_score += 12
        contributors.append("multiple_people_detected")
        nodes.append(
            GraphNode(
                id="vision_multi_person",
                label="Multiple People",
                type="vision",
                score=min(1.0, 0.4 + 0.2 * (v.person_count - 1)),
                confidence=v.confidence,
                reason=f"{v.person_count} people detected in frame.",
            )
        )

    if v.motion_spike > 0.6:
        risk_score += 18
        contributors.append("motion_spike")
        nodes.append(
            GraphNode(
                id="vision_motion_spike",
                label="Motion Spike",
                type="vision",
                score=min(1.0, v.motion_spike),
                confidence=v.confidence,
                reason=f"Motion spike reached {v.motion_spike:.2f}.",
            )
        )

    if v.proximity_breach:
        risk_score += 18
        contributors.append("proximity_breach")
        nodes.append(
            GraphNode(
                id="vision_proximity",
                label="Proximity Breach",
                type="vision",
                score=0.9,
                confidence=v.confidence,
                reason="Subject moved into restricted proximity zone.",
            )
        )

    if v.saccadic_sweep_rate > 4:
        risk_score += 10
        contributors.append("high_saccadic_sweep")
        nodes.append(
            GraphNode(
                id="vision_saccades",
                label="Rapid Eye Sweeps",
                type="vision",
                score=min(1.0, v.saccadic_sweep_rate / 8.0),
                confidence=v.confidence,
                reason=f"Saccadic sweep rate {v.saccadic_sweep_rate:.2f}.",
            )
        )

    if v.blink_rate_volatility > 0.35:
        risk_score += 8
        contributors.append("blink_instability")
        nodes.append(
            GraphNode(
                id="vision_blink_volatility",
                label="Blink Instability",
                type="vision",
                score=min(1.0, v.blink_rate_volatility),
                confidence=v.confidence,
                reason=f"Blink volatility {v.blink_rate_volatility:.2f}.",
            )
        )

    if v.ventral_shielding_ratio < 0.85:
        risk_score += 10
        contributors.append("ventral_shielding")
        nodes.append(
            GraphNode(
                id="vision_shielding",
                label="Protective Posture",
                type="vision",
                score=min(1.0, 1.0 - v.ventral_shielding_ratio),
                confidence=v.confidence,
                reason=f"Shielding ratio reduced to {v.ventral_shielding_ratio:.2f}.",
            )
        )

    if v.micro_dithering_amplitude > 0.2:
        risk_score += 9
        contributors.append("micro_dithering")
        nodes.append(
            GraphNode(
                id="vision_micro_dither",
                label="Fine Tremor",
                type="vision",
                score=min(1.0, v.micro_dithering_amplitude),
                confidence=v.confidence,
                reason=f"Micro-dithering amplitude {v.micro_dithering_amplitude:.2f}.",
            )
        )

    if p and p.quality > 0.2:
        if p.heart_rate > 100:
            risk_score += 15
            contributors.append("elevated_hr")
            nodes.append(
                GraphNode(
                    id="phys_hr",
                    label="Elevated Heart Rate",
                    type="physiology",
                    score=min(1.0, p.heart_rate / 140.0),
                    confidence=p.confidence,
                    reason=f"Heart rate {p.heart_rate:.1f} BPM.",
                )
            )

        if p.breathing_rate > 22:
            risk_score += 7
            contributors.append("elevated_breathing")
            nodes.append(
                GraphNode(
                    id="phys_breathing",
                    label="Elevated Breathing Rate",
                    type="physiology",
                    score=min(1.0, p.breathing_rate / 30.0),
                    confidence=p.confidence,
                    reason=f"Breathing rate {p.breathing_rate:.1f} breaths/min.",
                )
            )

        if p.heart_rate_variability < 25:
            risk_score += 8
            contributors.append("low_hrv")
            nodes.append(
                GraphNode(
                    id="phys_hrv",
                    label="Reduced HRV",
                    type="physiology",
                    score=min(1.0, max(0.0, (30 - p.heart_rate_variability) / 30.0)),
                    confidence=p.confidence,
                    reason=f"HRV {p.heart_rate_variability:.1f}.",
                )
            )

    risk_score = max(0.0, min(100.0, round(risk_score, 1)))

    if risk_score >= 75:
        severity = "critical"
    elif risk_score >= 50:
        severity = "high"
    elif risk_score >= 25:
        severity = "medium"
    else:
        severity = "low"

    risk_node = GraphNode(
        id="risk_final",
        label="Risk Assessment",
        type="risk",
        score=round(risk_score / 100.0, 3),
        confidence=0.9,
        reason=f"Overall severity classified as {severity}.",
    )
    nodes.append(risk_node)

    for node in nodes:
        if node.id != "risk_final":
            edges.append(
                GraphEdge(
                    source=node.id,
                    target="risk_final",
                    weight=round(min(1.0, max(0.2, node.score)), 2),
                )
            )

    return RiskAlert(
        session_id=payload.session.session_id,
        risk_score=risk_score,
        severity=severity,
        contributors=contributors,
        nodes=nodes,
        edges=edges,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=RiskAlert)
def analyze(payload: AnalyzeRequest):
    return compute_risk(payload)