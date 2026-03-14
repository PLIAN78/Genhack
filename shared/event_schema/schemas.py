from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
import json

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
    # Ocular and Kinetic metrics
    face_visible: bool
    person_count: int
    motion_spike: float
    proximity_breach: bool
    saccadic_sweep_rate: float
    blink_rate_volatility: float
    ventral_shielding_ratio: float
    micro_dithering_amplitude: float
    
    # Must include confidence and timestamps
    confidence: float = Field(..., ge=0.0, le=1.0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class PhysiologySignal(BaseModel):
    heart_rate: float
    breathing_rate: float
    heart_rate_variability: float
    
    # Quality score gates the usage of this data
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
    # Every alert must include contributors ("why" it triggered)
    contributors: List[str]
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# ==========================================
# 3 Realistic Sample Payloads (Hackathon Demo)
# ==========================================

# 1. Normal Baseline (Calibration Phase)
sample_normal = SessionEvent(
    session_id="tx_12345", 
    phase="calibration"
).dict()

sample_vision_normal = VisionSignal(
    face_visible=True,
    person_count=1,
    motion_spike=0.02,
    proximity_breach=False,
    saccadic_sweep_rate=1.2,
    blink_rate_volatility=0.05,
    ventral_shielding_ratio=1.0,
    micro_dithering_amplitude=0.01,
    confidence=0.98
).dict()

sample_physiology_normal = PhysiologySignal(
    heart_rate=72.5,
    breathing_rate=16.0,
    heart_rate_variability=45.0,
    quality=0.85,
    confidence=0.90
).dict()

# 2. Obstruction + Motion Event (Invasive Proximity)
sample_vision_anomaly = VisionSignal(
    face_visible=False,
    person_count=2,
    motion_spike=0.85,
    proximity_breach=True,
    saccadic_sweep_rate=5.5,
    blink_rate_volatility=0.45,
    ventral_shielding_ratio=0.75, # Huddling
    micro_dithering_amplitude=0.30,
    confidence=0.92
).dict()

# 3. Elevated Physiology (Inquiry Phase - High Cognitive Load)
sample_risk_alert = RiskAlert(
    session_id="tx_12345",
    risk_score=85.0,
    severity="high",
    contributors=["repeated_obstruction", "sudden_forward_motion", "elevated_hr"],
    nodes=[
        GraphNode(id="n1", label="HR Spike", type="physiology", score=0.85, confidence=0.88, reason="HR +30% from baseline"),
        GraphNode(id="n2", label="Proximity Breach", type="vision", score=0.9, confidence=0.95, reason="Person leaning over counter"),
        GraphNode(id="n3", label="High Risk", type="risk", score=0.85, confidence=0.92)
    ],
    edges=[
        GraphEdge(source="n1", target="n3", weight=0.6),
        GraphEdge(source="n2", target="n3", weight=0.4)
    ]
).dict()

if __name__ == "__main__":
    print(json.dumps(sample_risk_alert, default=str, indent=2))
