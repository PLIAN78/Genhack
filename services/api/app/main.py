from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import json
import asyncio

app = FastAPI(title="Security Copilot API", version="0.1.0")

# CORS config for dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For hackathon MVP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Minimal Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_event(self, event_type: str, payload: Dict[str, Any]):
        message = json.dumps({"type": event_type, "payload": payload})
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except WebSocketDisconnect:
                self.disconnect(connection)

manager = ConnectionManager()

@app.get("/health")
async def health_check():
    """Health check endpoint for the backend."""
    return {"status": "healthy", "version": "0.1.0"}

@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """Live event streaming endpoint for the dashboard."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive holding for inbound ws messages if any
            data = await websocket.receive_text()
            # For hackathon, mainly broadcasting from REST to WS
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/ingest/vision")
async def ingest_vision(payload: Dict[str, Any]):
    """Ingests face, motion, proximity, and scanning metrics."""
    # In full implementation, this triggers the rules engine.
    # For now, just broadcast to the dashboard for MVP feedback.
    await manager.broadcast_event("vision_update", payload)
    return {"status": "received", "event_type": "vision"}

@app.post("/ingest/physiology")
async def ingest_physiology(payload: Dict[str, Any]):
    """Ingests HR, BR, and signal quality metrics (e.g. from SmartSpectra)."""
    # Gated check logic will reside in the rules engine.
    await manager.broadcast_event("physiology_update", payload)
    return {"status": "received", "event_type": "physiology"}

@app.post("/ingest/acoustic")
async def ingest_acoustic(payload: Dict[str, Any]):
    """Ingests Jitter, Shimmer, and Cognitive Latency metrics."""
    await manager.broadcast_event("acoustic_update", payload)
    return {"status": "received", "event_type": "acoustic"}

if __name__ == "__main__":
    import uvicorn
    # Local run instructions: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
