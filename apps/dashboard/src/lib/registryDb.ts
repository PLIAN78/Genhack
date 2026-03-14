// All database I/O for the high-risk person registry goes through this module.
// Nothing outside this file calls getSupabaseClient() or constructs queries.
// Every function is async, returns a safe default on failure, and never throws
// into the calling hook so the live detection pipeline cannot crash.

import { getSupabaseClient } from "./supabaseClient";
import { REGISTRY_CONFIG } from "./registryConfig";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistryPerson {
  id: string;
  cumulative_risk: number;
  encounter_count: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  reason_for_flagging: string;
  status: "active" | "reviewed" | "cleared";
  notes: string | null;
  spike_triggered: boolean;
  sustained_triggered: boolean;
}

export interface MatchResult {
  id: string;
  cumulative_risk: number;
  encounter_count: number;
  last_seen_at: string;
  reason_for_flagging: string;
  status: string;
  similarity: number;
}

export interface CreatePersonParams {
  face_embedding: number[];
  initial_risk: number;
  reason_for_flagging: string;
  spike_triggered: boolean;
  sustained_triggered: boolean;
}

export interface LogEncounterParams {
  person_id: string;
  risk_score: number;
  deception_score: number;
  effective_score: number;
  phase: string;
  was_suspicious: boolean;
}

export interface ListPersonsOptions {
  status?: string;
  search?: string;
  sortBy?: "cumulative_risk" | "last_seen_at" | "encounter_count";
  sortDir?: "asc" | "desc";
  limit?: number;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns the single closest registry match for the given face embedding,
 * or null if no match exceeds the configured similarity threshold.
 */
export async function findMatch(
  embedding: Float32Array
): Promise<MatchResult | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.rpc("match_persons", {
      query_embedding: Array.from(embedding),
      match_threshold: REGISTRY_CONFIG.matchConfidenceThreshold,
      match_count: 1,
    });

    if (error) {
      console.error("[Registry] findMatch error:", error.message);
      return null;
    }

    return (data as MatchResult[])?.[0] ?? null;
  } catch (err) {
    console.error("[Registry] findMatch exception:", err);
    return null;
  }
}

/**
 * Inserts a new person into the registry.
 * Returns the new record's UUID, or null on failure.
 */
export async function createPerson(
  params: CreatePersonParams
): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("high_risk_registry")
      .insert({
        face_embedding: params.face_embedding,
        cumulative_risk: params.initial_risk,
        encounter_count: 1,
        reason_for_flagging: params.reason_for_flagging,
        spike_triggered: params.spike_triggered,
        sustained_triggered: params.sustained_triggered,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Registry] createPerson error:", error.message);
      return null;
    }

    return (data as { id: string })?.id ?? null;
  } catch (err) {
    console.error("[Registry] createPerson exception:", err);
    return null;
  }
}

/**
 * Atomically increments cumulative_risk and encounter_count for a known person
 * when they are seen again in a suspicious encounter.
 * Only updates last_seen_at (no score change) when not suspicious.
 */
export async function updatePersonEncounter(params: {
  person_id: string;
  was_suspicious: boolean;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const now = new Date().toISOString();

  try {
    if (params.was_suspicious) {
      // Atomic increment via DB function to prevent race conditions
      const { error } = await client.rpc("increment_person_risk", {
        p_person_id: params.person_id,
        p_increment: REGISTRY_CONFIG.cumulativeRiskIncrement,
        p_now: now,
      });

      if (error) {
        console.error("[Registry] increment_person_risk error:", error.message);
        return false;
      }
    } else {
      // Non-suspicious sighting: only refresh last_seen_at
      const { error } = await client
        .from("high_risk_registry")
        .update({ last_seen_at: now, updated_at: now })
        .eq("id", params.person_id);

      if (error) {
        console.error("[Registry] updatePersonEncounter (non-suspicious) error:", error.message);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error("[Registry] updatePersonEncounter exception:", err);
    return false;
  }
}

/**
 * Appends an entry to the encounter audit log.
 * Failures are silently logged — the audit log is non-critical.
 */
export async function logEncounter(params: LogEncounterParams): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client.from("encounter_log").insert({
      person_id: params.person_id,
      risk_score: params.risk_score,
      deception_score: params.deception_score,
      effective_score: params.effective_score,
      phase: params.phase,
      was_suspicious: params.was_suspicious,
    });

    if (error) {
      console.error("[Registry] logEncounter error:", error.message);
    }
  } catch (err) {
    console.error("[Registry] logEncounter exception:", err);
  }
}

/**
 * Returns all registry persons with optional filter/sort/search.
 */
export async function listPersons(
  opts: ListPersonsOptions = {}
): Promise<RegistryPerson[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    let query = client.from("high_risk_registry").select(
      "id, cumulative_risk, encounter_count, last_seen_at, created_at, " +
        "updated_at, reason_for_flagging, status, notes, " +
        "spike_triggered, sustained_triggered"
    );

    if (opts.status && opts.status !== "all") {
      query = query.eq("status", opts.status);
    }

    if (opts.search) {
      query = query.ilike("reason_for_flagging", `%${opts.search}%`);
    }

    const sortCol = opts.sortBy ?? "last_seen_at";
    const ascending = opts.sortDir === "asc";
    query = query.order(sortCol, { ascending });
    query = query.limit(opts.limit ?? REGISTRY_CONFIG.maxRegistryRows);

    const { data, error } = await query;

    if (error) {
      console.error("[Registry] listPersons error:", error.message);
      return [];
    }

    return (data as unknown as RegistryPerson[]) ?? [];
  } catch (err) {
    console.error("[Registry] listPersons exception:", err);
    return [];
  }
}

/**
 * Updates the workflow status and optional notes for a specific person.
 * Used by human reviewers from the RegistryPanel UI.
 */
export async function updatePersonStatus(
  id: string,
  status: "active" | "reviewed" | "cleared",
  notes: string | null
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from("high_risk_registry")
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[Registry] updatePersonStatus error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Registry] updatePersonStatus exception:", err);
    return false;
  }
}
