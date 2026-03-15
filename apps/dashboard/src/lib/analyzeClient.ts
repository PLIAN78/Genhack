import type { AnalyzeRequest, RiskAlert } from "./backendTypes";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function analyzeSignals(payload: AnalyzeRequest): Promise<RiskAlert> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analyze request failed: ${res.status} ${text}`);
  }

  return res.json();
}