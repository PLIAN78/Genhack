export type GraphNodeType = "vision" | "physiology" | "acoustic" | "risk" | "context";
export type SessionPhase = "calibration" | "inquiry" | "release";
export type RiskSeverity = "low" | "medium" | "high" | "critical";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  score: number;
  confidence: number;
  timestamp?: string;
  reason?: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface SessionEvent {
  session_id: string;
  timestamp?: string;
  phase: SessionPhase;
}

export interface VisionSignal {
  face_visible: boolean;
  person_count: number;
  motion_spike: number;
  proximity_breach: boolean;
  saccadic_sweep_rate: number;
  blink_rate_volatility: number;
  ventral_shielding_ratio: number;
  micro_dithering_amplitude: number;
  confidence: number;
  timestamp?: string;
}

export interface PhysiologySignal {
  heart_rate: number;
  breathing_rate: number;
  heart_rate_variability: number;
  quality: number;
  confidence: number;
  timestamp?: string;
}

export interface AnalyzeRequest {
  session: SessionEvent;
  vision: VisionSignal;
  physiology?: PhysiologySignal;
}

export interface RiskAlert {
  session_id: string;
  risk_score: number;
  severity: RiskSeverity;
  contributors: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  timestamp: string;
}