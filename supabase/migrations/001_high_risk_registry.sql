-- High-Risk Person Registry
-- Run this migration against your Supabase project via the SQL editor or CLI.
-- Requires the pgvector extension (enabled by default on all Supabase projects).

create extension if not exists vector;

-- ── Main registry table ──────────────────────────────────────────────────────
create table if not exists high_risk_registry (
  id                  uuid        primary key default gen_random_uuid(),
  -- Privacy-preserving face representation (MediaPipe ImageEmbedder, 1024-dim)
  face_embedding      vector(1024) not null,
  cumulative_risk     float       not null default 0  check (cumulative_risk >= 0 and cumulative_risk <= 100),
  encounter_count     int         not null default 0  check (encounter_count >= 0),
  last_seen_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Human-readable explanation of why this person was flagged
  reason_for_flagging text        not null,
  -- Workflow status for human reviewers
  status              text        not null default 'active'
                        check (status in ('active', 'reviewed', 'cleared')),
  notes               text,
  -- Audit: which rule triggered the initial flag
  spike_triggered     boolean     not null default false,
  sustained_triggered boolean     not null default false
);

-- ── Per-encounter audit log ───────────────────────────────────────────────────
create table if not exists encounter_log (
  id              uuid        primary key default gen_random_uuid(),
  person_id       uuid        not null references high_risk_registry(id) on delete cascade,
  risk_score      float       not null,
  deception_score float       not null,
  effective_score float       not null,
  encountered_at  timestamptz not null default now(),
  phase           text,
  was_suspicious  boolean     not null
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- IVFFlat index for approximate nearest-neighbor cosine similarity queries.
-- lists=100 is suitable for up to ~1 million rows; lower for small datasets.
create index if not exists high_risk_registry_embedding_idx
  on high_risk_registry using ivfflat (face_embedding vector_cosine_ops)
  with (lists = 10);

create index if not exists encounter_log_person_id_idx
  on encounter_log (person_id);

create index if not exists high_risk_registry_status_idx
  on high_risk_registry (status);

create index if not exists high_risk_registry_last_seen_idx
  on high_risk_registry (last_seen_at desc);

-- ── RPC: vector similarity match ─────────────────────────────────────────────
-- Returns the closest matching person(s) above the similarity threshold.
create or replace function match_persons(
  query_embedding vector(1024),
  match_threshold float,
  match_count     int
)
returns table (
  id                  uuid,
  cumulative_risk     float,
  encounter_count     int,
  last_seen_at        timestamptz,
  reason_for_flagging text,
  status              text,
  similarity          float
)
language sql stable
as $$
  select
    id,
    cumulative_risk,
    encounter_count,
    last_seen_at,
    reason_for_flagging,
    status,
    1 - (face_embedding <=> query_embedding) as similarity
  from high_risk_registry
  where status != 'cleared'
    and 1 - (face_embedding <=> query_embedding) > match_threshold
  order by face_embedding <=> query_embedding
  limit match_count;
$$;

-- ── RPC: atomic cumulative risk increment ────────────────────────────────────
-- Increments cumulative_risk and encounter_count in a single statement to
-- prevent race conditions if this is ever called from concurrent sessions.
create or replace function increment_person_risk(
  p_person_id uuid,
  p_increment  float,
  p_now        timestamptz
)
returns void
language sql
as $$
  update high_risk_registry
  set
    cumulative_risk = least(100, cumulative_risk + p_increment),
    encounter_count = encounter_count + 1,
    last_seen_at    = p_now,
    updated_at      = p_now
  where id = p_person_id;
$$;
