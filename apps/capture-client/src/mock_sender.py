"""
Capture Client Contract & Mock Sender

Assumptions:
1. Frame Transport:
   - Raw frames or compressed thumbnails are decoupled from telemetry.
   - For MVP, frames could be pushed over WebSocket or WebRTC, but telemetry goes via REST to trigger the Rule Engine asynchronously.
2. Retry Logic:
   - If the backend is down, the edge client caches the last 10 seconds of telemetry and retries.
   - Quality drops (e.g. poor lighting) are sent as low confidence/low quality; we do NOT drop the event, we let the backend Rule Engine discard it safely.
3. Payload Format:
   - See `shared/event_schema/schemas.py` for exact JSON structure constraints.
"""

import time
import requests
import json
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO)

API_URL = "http://localhost:8000/ingest"

# Helpers to build valid Pydantic-compliant dicts
def get_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def build_vision(face_vis=True, count=1, motion=0.01, prox=False, conf=0.95, shield=1.0) -> dict:
    return {
        "face_visible": face_vis,
        "person_count": count,
        "motion_spike": motion,
        "proximity_breach": prox,
        "saccadic_sweep_rate": 1.2,
        "blink_rate_volatility": 0.05,
        "ventral_shielding_ratio": shield,
        "micro_dithering_amplitude": 0.01,
        "confidence": conf,
        "timestamp": get_now()
    }

def build_physio(hr=70.0, hr_qual=0.85) -> dict:
    return {
        "heart_rate": hr,
        "breathing_rate": 15.0,
        "heart_rate_variability": 50.0,
        "quality": hr_qual,
        "confidence": 0.90,
        "timestamp": get_now()
    }

def send_payload(endpoint: str, data: dict):
    try:
        url = f"{API_URL}/{endpoint}"
        resp = requests.post(url, json=data)
        logging.info(f"Sent {endpoint}: {resp.status_code}")
    except requests.exceptions.ConnectionError:
        logging.error("Backend not running. Start with: uvicorn app.main:app")

def simulate():
    logging.info("Starting Simulation: Normal Session (5s)")
    for i in range(5):
        send_payload("vision", build_vision())
        send_payload("physiology", build_physio())
        time.append(1)
        time.sleep(1)

    logging.info("Starting Simulation: Obstruction Event (Face Hidden for 2s)")
    for i in range(2):
        send_payload("vision", build_vision(face_vis=False, conf=0.99))
        send_payload("physiology", build_physio(hr=75.0, hr_qual=0.4)) # poor lighting drops quality
        time.sleep(1)
        
    logging.info("Starting Simulation: Sudden Motion Event (2s)")
    for i in range(2):
        send_payload("vision", build_vision(motion=0.85, prox=True, shield=0.75))
        send_payload("physiology", build_physio(hr=85.0))
        time.sleep(1)

    logging.info("Starting Simulation: Elevated Physiology with Good Quality (3s)")
    for i in range(3):
        send_payload("vision", build_vision(motion=0.2)) 
        send_payload("physiology", build_physio(hr=115.0, hr_qual=0.95)) # Strong HR spike
        time.sleep(1)
        
    logging.info("Simulation Complete")

if __name__ == "__main__":
    simulate()
