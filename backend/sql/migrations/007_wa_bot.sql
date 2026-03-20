-- ────────────────────────────────────────────────────────────────────────────
-- Migration 007: WhatsApp Tax Bot
--
-- Creates:
--   wa_agent_sessions  — full conversation + session_state per phone number
--   wa_documents       — DPDPA raw-file audit trail
--
-- Session state is managed by the Python app via Supabase REST (service-role).
-- No direct Postgres connection required — consistent with the rest of the stack.
-- ────────────────────────────────────────────────────────────────────────────

-- ── WhatsApp agent sessions ───────────────────────────────────────────────────

create table if not exists public.wa_agent_sessions (
  id              uuid primary key default gen_random_uuid(),
  wa_phone        text not null unique,      -- E.164 phone number (user key)
  session_state   jsonb not null default '{}',
  messages        jsonb not null default '[]',  -- last 30 messages (role/content pairs)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists wa_agent_sessions_wa_phone_idx
  on public.wa_agent_sessions (wa_phone);

-- Keep updated_at current
create or replace function public.wa_agent_sessions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wa_agent_sessions_updated_at on public.wa_agent_sessions;
create trigger wa_agent_sessions_updated_at
  before update on public.wa_agent_sessions
  for each row execute function public.wa_agent_sessions_set_updated_at();

grant all on public.wa_agent_sessions to service_role;

-- ── DPDPA document audit trail ────────────────────────────────────────────────

create table if not exists public.wa_documents (
  id              uuid primary key default gen_random_uuid(),
  wa_phone        text not null,                -- E.164 phone number of the user
  doc_type        text not null,                -- 'cas' | 'broker_pl' | 'broker_holdings' | 'itr'
  broker_name     text,                         -- e.g. 'zerodha', 'groww', 'upstox' (null for CAS/ITR)
  gcs_path        text,                         -- gs://bucket/path; nulled after deletion
  parse_status    text not null default 'pending',  -- 'pending' | 'parsed' | 'failed'
  error_detail    text,
  uploaded_at     timestamptz default now(),
  parsed_at       timestamptz,
  gcs_deleted_at  timestamptz                   -- Timestamp when raw file was purged (DPDPA ≤60s)
);

-- Index for efficient lookups by phone (used during DPDPA deletion requests)
create index if not exists wa_documents_wa_phone_idx
  on public.wa_documents (wa_phone);

-- Index for monitoring parse status
create index if not exists wa_documents_parse_status_idx
  on public.wa_documents (parse_status)
  where parse_status = 'pending';

-- Grant service-role full access (used by the WhatsApp bot backend)
grant all on public.wa_documents to service_role;
