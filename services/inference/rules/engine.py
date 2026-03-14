import sys
import os
from typing import List, Tuple

# Enable importing from shared
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from shared.event_schema.schemas import VisionSignal, PhysiologySignal, RiskAlert, GraphNode, GraphEdge

# Thresholds & Weights
PHYSIOLOGY_QUALITY_THRESHOLD = 0.6
WEIGHT_OBSTRUCTION = 40.0
WEIGHT_PROXIMITY = 35.0
WEIGHT_SUDDEN_MOTION = 20.0
WEIGHT_ELEVATED_HR = 25.0

class FusionEngine:
    def evaluate(self, session_id: str, vision: VisionSignal, physiology: PhysiologySignal = None) -> RiskAlert:
        score = 0.0
        contributors = []
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []
        
        # 1. Vision Analysis
        if not vision.face_visible:
            score += WEIGHT_OBSTRUCTION
            contributors.append("face_obstruction")
            nodes.append(GraphNode(id="v_obs", label="Face Obscured", type="vision", score=WEIGHT_OBSTRUCTION, confidence=vision.confidence, reason="Face not visible in frame"))
            
        if vision.proximity_breach:
            score += WEIGHT_PROXIMITY
            contributors.append("proximity_breach")
            nodes.append(GraphNode(id="v_prox", label="Abnormal Proximity", type="vision", score=WEIGHT_PROXIMITY, confidence=vision.confidence, reason="Subject crossed counter zone"))
            
        if vision.motion_spike > 0.5:
            score += WEIGHT_SUDDEN_MOTION
            contributors.append("sudden_motion")
            nodes.append(GraphNode(id="v_motion", label="Sudden Motion", type="vision", score=WEIGHT_SUDDEN_MOTION, confidence=vision.confidence, reason=f"Spike magnitude: {vision.motion_spike}"))
            
        # 2. Physiology Analysis (Gated)
        if physiology and physiology.quality >= PHYSIOLOGY_QUALITY_THRESHOLD:
            # Simple baseline assumption for hackathon: HR > 90 is elevated
            if physiology.heart_rate > 90.0:
                score += WEIGHT_ELEVATED_HR
                contributors.append("elevated_hr")
                nodes.append(GraphNode(id="p_hr", label="Elevated HR", type="physiology", score=WEIGHT_ELEVATED_HR, confidence=physiology.confidence, reason=f"HR {physiology.heart_rate} bpm"))
        elif physiology and physiology.quality < PHYSIOLOGY_QUALITY_THRESHOLD:
            # Explicitly log that physiology was ignored due to bad lighting/quality
            nodes.append(GraphNode(id="p_ignored", label="Physiology Ignored", type="context", score=0.0, confidence=1.0, reason=f"Signal quality ({physiology.quality}) below threshold"))

        # 3. Final Scoring and Severity Matrix
        score = min(score, 100.0)
        severity = "low"
        if score >= 75.0:
            severity = "critical"
        elif score >= 50.0:
            severity = "high"
        elif score >= 25.0:
            severity = "medium"
            
        # 4. Connect explaining nodes to the core Risk node
        risk_node = GraphNode(id="risk_core", label=f"Risk: {severity.upper()}", type="risk", score=score, confidence=min([n.confidence for n in nodes] or [1.0]))
        nodes.append(risk_node)
        
        for n in nodes:
            if n.id != "risk_core" and n.id != "p_ignored":
                edges.append(GraphEdge(source=n.id, target="risk_core", weight=n.score))
                
        return RiskAlert(
            session_id=session_id,
            risk_score=score,
            severity=severity,
            contributors=contributors,
            nodes=nodes,
            edges=edges
        )
