-- ────────────────────────────────────────────────────────────────────────────
-- Migration 008: Tax Sessions (Web Tax Saver)
--
-- Creates:
--   tax_sessions — per-user tax harvesting session for the web interface
--
-- Keyed by user_id (Supabase auth UUID) unlike wa_agent_sessions which
-- is keyed by phone number. This enables RLS so users can only read their
-- own session via the regular Supabase client, but all writes go through
-- the service-role client in the backend.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.tax_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  session_state   jsonb not null default '{}',
  messages        jsonb not null default '[]',   -- last 30 messages (role/content pairs)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint tax_sessions_user_id_unique unique (user_id)
);

create index if not exists tax_sessions_user_id_idx
  on public.tax_sessions (user_id);

-- Keep updated_at current
create or replace function public.tax_sessions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tax_sessions_updated_at on public.tax_sessions;
create trigger tax_sessions_updated_at
  before update on public.tax_sessions
  for each row execute function public.tax_sessions_set_updated_at();

-- RLS: users can only see their own session
alter table public.tax_sessions enable row level security;

create policy "Users own their tax session"
  on public.tax_sessions for all
  using (auth.uid() = user_id);

-- Service role can do everything (used by backend tax_chat router)
grant all on public.tax_sessions to service_role;
