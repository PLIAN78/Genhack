"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  RefreshCw,
  Search,
  ChevronDown,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  Loader2,
} from "lucide-react";
import {
  listPersons,
  updatePersonStatus,
  type RegistryPerson,
} from "../lib/registryDb";
import { REGISTRY_CONFIG } from "../lib/registryConfig";
import type { RegistrySyncState } from "../hooks/useRegistrySync";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncateId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 40) return "text-amber-400";
  return "text-emerald-400";
}

function riskBg(score: number): string {
  if (score >= 70) return "bg-red-950/60 border-red-700/50";
  if (score >= 40) return "bg-amber-950/60 border-amber-700/50";
  return "bg-emerald-950/40 border-emerald-800/40";
}

function statusBadge(status: string): string {
  switch (status) {
    case "active":
      return "bg-red-950/70 text-red-400 border-red-700/50";
    case "reviewed":
      return "bg-amber-950/70 text-amber-400 border-amber-700/50";
    case "cleared":
      return "bg-emerald-950/70 text-emerald-400 border-emerald-800/50";
    default:
      return "bg-slate-800 text-slate-400 border-slate-600";
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SyncStatusPill({ state }: { state: RegistrySyncState }) {
  const pillMap: Record<
    string,
    { label: string; className: string; pulse?: boolean }
  > = {
    disabled: {
      label: "Registry disabled",
      className: "bg-slate-800 text-slate-500 border-slate-700",
    },
    idle: {
      label: "Idle — awaiting Phase B",
      className: "bg-slate-800 text-slate-400 border-slate-700",
    },
    encounter_active: {
      label: "Encounter active",
      className: "bg-indigo-950/70 text-indigo-400 border-indigo-700/50",
      pulse: true,
    },
    matching: {
      label: "Matching…",
      className: "bg-primary-900/60 text-primary-300 border-primary-700/50",
      pulse: true,
    },
    new_person_flagged: {
      label: "New person flagged",
      className: "bg-red-950/70 text-red-300 border-red-700/50",
    },
    known_person_updated: {
      label: "Known — risk updated",
      className: "bg-orange-950/70 text-orange-300 border-orange-700/50",
    },
    known_person_seen: {
      label: "Known — not suspicious",
      className: "bg-emerald-950/60 text-emerald-400 border-emerald-800/50",
    },
    error: {
      label: state.error ?? "Error",
      className: "bg-red-950/70 text-red-400 border-red-700/50",
    },
  };

  const pill = pillMap[state.status] ?? pillMap.idle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border ${pill.className} ${pill.pulse ? "animate-pulse" : ""}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {pill.label}
      {state.matchConfidence > 0 && (
        <span className="opacity-60 ml-1">
          ({(state.matchConfidence * 100).toFixed(0)}% conf)
        </span>
      )}
    </span>
  );
}

function PersonRow({
  person,
  onStatusChange,
}: {
  person: RegistryPerson;
  onStatusChange: (
    id: string,
    status: "active" | "reviewed" | "cleared",
    notes: string | null
  ) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(
    newStatus: "active" | "reviewed" | "cleared"
  ) {
    setSaving(true);
    await onStatusChange(person.id, newStatus, person.notes);
    setSaving(false);
  }

  return (
    <div
      className={`rounded-lg border p-3 space-y-2.5 transition-colors duration-200 ${riskBg(person.cumulative_risk)}`}
    >
      {/* Row header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] text-slate-500 shrink-0">
            #{truncateId(person.id)}
          </span>
          <span
            className={`text-base font-black tabular-nums shrink-0 ${riskColor(person.cumulative_risk)}`}
          >
            {person.cumulative_risk.toFixed(0)}
          </span>
          <span className="text-slate-500 text-[10px] font-mono">/ 100</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {saving ? (
            <Loader2 size={12} className="text-slate-400 animate-spin" />
          ) : (
            <select
              value={person.status}
              onChange={(e) =>
                handleStatusChange(
                  e.target.value as "active" | "reviewed" | "cleared"
                )
              }
              className={`text-[10px] font-mono font-semibold border rounded px-1.5 py-0.5 cursor-pointer bg-transparent appearance-none outline-none ${statusBadge(person.status)}`}
            >
              <option value="active">ACTIVE</option>
              <option value="reviewed">REVIEWED</option>
              <option value="cleared">CLEARED</option>
            </select>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {formatRelativeTime(person.last_seen_at)}
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp size={10} />
          {person.encounter_count} encounter{person.encounter_count !== 1 ? "s" : ""}
        </span>
        {person.spike_triggered && (
          <span className="text-red-400/70">SPIKE</span>
        )}
        {person.sustained_triggered && (
          <span className="text-amber-400/70">SUSTAINED</span>
        )}
      </div>

      {/* Reason */}
      <p className="text-[10px] text-slate-400 leading-relaxed break-words font-mono">
        {person.reason_for_flagging}
      </p>

      {/* Notes if present */}
      {person.notes && (
        <p className="text-[10px] text-slate-500 italic leading-relaxed break-words">
          Note: {person.notes}
        </p>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface RegistryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  syncState: RegistrySyncState;
}

export function RegistryPanel({
  isOpen,
  onClose,
  syncState,
}: RegistryPanelProps) {
  const [persons, setPersons] = useState<RegistryPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] =
    useState<"cumulative_risk" | "last_seen_at" | "encounter_count">(
      "last_seen_at"
    );

  const fetchPersons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPersons({
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: search.trim() || undefined,
        sortBy,
        sortDir: "desc",
      });
      setPersons(data);
    } catch {
      setError("Failed to load registry data.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, sortBy]);

  // Fetch when panel opens or filters change.
  useEffect(() => {
    if (isOpen) fetchPersons();
  }, [isOpen, fetchPersons]);

  // Refresh when a new person is flagged or a known person is updated.
  useEffect(() => {
    if (
      isOpen &&
      (syncState.status === "new_person_flagged" ||
        syncState.status === "known_person_updated")
    ) {
      fetchPersons();
    }
  }, [syncState.status, isOpen, fetchPersons]);

  const handleStatusChange = useCallback(
    async (
      id: string,
      status: "active" | "reviewed" | "cleared",
      notes: string | null
    ) => {
      await updatePersonStatus(id, status, notes);
      setPersons((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
    },
    []
  );

  if (!isOpen) return null;

  const activeCount = persons.filter((p) => p.status === "active").length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed top-0 right-0 h-full w-[480px] max-w-full z-50 flex flex-col bg-fin-panel border-l border-fin-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-fin-border bg-fin-panel/80 shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary-400" />
            <h2 className="text-sm font-semibold tracking-wide text-slate-200">
              High-Risk Registry
            </h2>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-950/70 text-red-400 border border-red-700/50 text-[10px] font-mono font-bold">
                {activeCount} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPersons}
              disabled={loading}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Sync status */}
        {REGISTRY_CONFIG.enabled && (
          <div className="px-4 py-2 border-b border-fin-border/50 bg-fin-bg/30 shrink-0">
            <SyncStatusPill state={syncState} />
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 px-4 py-3 border-b border-fin-border/50 shrink-0">
          <div className="flex-1 relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              placeholder="Search reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 bg-fin-bg border border-fin-border rounded text-[11px] font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-primary-500/60"
            />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-2.5 pr-6 py-1.5 bg-fin-bg border border-fin-border rounded text-[11px] font-mono text-slate-300 focus:outline-none focus:border-primary-500/60 cursor-pointer"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="reviewed">Reviewed</option>
              <option value="cleared">Cleared</option>
            </select>
            <ChevronDown
              size={10}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
          </div>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as
                    | "cumulative_risk"
                    | "last_seen_at"
                    | "encounter_count"
                )
              }
              className="appearance-none pl-2.5 pr-6 py-1.5 bg-fin-bg border border-fin-border rounded text-[11px] font-mono text-slate-300 focus:outline-none focus:border-primary-500/60 cursor-pointer"
            >
              <option value="last_seen_at">Recent</option>
              <option value="cumulative_risk">Risk ↓</option>
              <option value="encounter_count">Encounters ↓</option>
            </select>
            <ChevronDown
              size={10}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 text-slate-500 text-[11px] font-mono py-8 justify-center">
              <Loader2 size={14} className="animate-spin text-primary-500" />
              Loading registry…
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-start gap-2.5 text-[11px] font-mono text-red-300 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" />
              {error}
              <button
                onClick={fetchPersons}
                className="ml-auto text-red-400 hover:text-red-300 underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Registry not configured */}
          {!loading && !error && !REGISTRY_CONFIG.enabled && (
            <div className="text-center py-12 space-y-2">
              <Shield size={32} className="mx-auto text-slate-700" />
              <p className="text-slate-500 text-xs font-mono">
                Registry is disabled.
              </p>
              <p className="text-slate-600 text-[10px] font-mono">
                Set NEXT_PUBLIC_REGISTRY_ENABLED=true in .env.local
              </p>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && REGISTRY_CONFIG.enabled && persons.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <Users size={32} className="mx-auto text-slate-700" />
              <p className="text-slate-500 text-xs font-mono">
                No flagged persons yet.
              </p>
              <p className="text-slate-600 text-[10px] font-mono">
                Registry entries are created when a subject reaches a high risk
                score during Phase B (Inquiry).
              </p>
            </div>
          )}

          {/* Person list */}
          {!loading && !error && persons.length > 0 && (
            <>
              <p className="text-[10px] text-slate-500 font-mono">
                {persons.length} record{persons.length !== 1 ? "s" : ""}
                {statusFilter !== "all" ? ` · ${statusFilter}` : ""}
              </p>
              {persons.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-fin-border/50 bg-fin-bg/30 shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1.5">
            <CheckCircle size={10} className="text-emerald-600" />
            Stored in Supabase · Embeddings only, no raw images
          </span>
          {!REGISTRY_CONFIG.enabled && (
            <span className="text-[10px] text-slate-600 font-mono">
              Feature disabled
            </span>
          )}
        </div>
      </div>
    </>
  );
}
