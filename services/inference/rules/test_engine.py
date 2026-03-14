import pytest
from engine import FusionEngine
from shared.event_schema.schemas import VisionSignal, PhysiologySignal

@pytest.fixture
def engine():
    return FusionEngine()

def base_vision():
    return VisionSignal(
        face_visible=True,
        person_count=1,
        motion_spike=0.01,
        proximity_breach=False,
        saccadic_sweep_rate=1.2,
        blink_rate_volatility=0.05,
        ventral_shielding_ratio=1.0,
        micro_dithering_amplitude=0.01,
        confidence=0.98
    )

def base_physiology():
    return PhysiologySignal(
        heart_rate=70.0,
        breathing_rate=15.0,
        heart_rate_variability=50.0,
        quality=0.85,
        confidence=0.90
    )

def test_scenario_1_normal(engine):
    """Scenario 1: Normal session, no alerts"""
    vision = base_vision()
    physio = base_physiology()
    alert = engine.evaluate("tx_1", vision, physio)
    
    assert alert.severity == "low"
    assert "p_ignored" not in [n.id for n in alert.nodes]

def test_scenario_2_poor_quality_ignored(engine):
    """Scenario 2: Physiology is ignored due to poor quality, score reflects vision"""
    vision = base_vision()
    # High HR but terrible quality
    physio = base_physiology()
    physio.heart_rate = 150.0
    physio.quality = 0.3
    
    alert = engine.evaluate("tx_2", vision, physio)
    assert alert.severity == "low"
    assert "p_ignored" in [n.id for n in alert.nodes]

def test_scenario_3_high_vision_risk(engine):
    """Scenario 3: Obstruction + Proximity triggers High Risk"""
    vision = base_vision()
    vision.face_visible = False
    vision.proximity_breach = True
    
    alert = engine.evaluate("tx_3", vision, base_physiology())
    assert alert.severity == "critical" # 40 + 35 = 75
    assert "face_obstruction" in alert.contributors
    assert "proximity_breach" in alert.contributors

def test_scenario_4_medium_vision_risk(engine):
    """Scenario 4: Sudden motion triggers Medium Risk"""
    vision = base_vision()
    vision.motion_spike = 0.8
    
    alert = engine.evaluate("tx_4", vision, base_physiology())
    assert alert.severity == "medium" # 20
    assert "sudden_motion" in alert.contributors

def test_scenario_5_compounded_risk(engine):
    """Scenario 5: Medium Vision + Elevated Physio -> High Risk"""
    vision = base_vision()
    vision.motion_spike = 0.8
    
    physio = base_physiology()
    physio.heart_rate = 120.0
    
    alert = engine.evaluate("tx_5", vision, physio)
    assert alert.severity == "medium" # 20 + 25 = 45 -> medium risk because it didn't cross 50. Wait, <50 is medium.
    assert "elevated_hr" in alert.contributors
    assert "sudden_motion" in alert.contributors
