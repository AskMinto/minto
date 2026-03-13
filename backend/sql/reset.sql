-- =============================================================================
-- reset.sql  —  Full schema reset for Minto
-- Run this in Supabase SQL Editor to drop and recreate all tables from scratch.
-- WARNING: This will delete ALL data.
-- =============================================================================

-- Drop all tables (order matters for FK dependencies)
drop table if exists public.price_alerts cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.chats cascade;
drop table if exists public.cas_uploads cascade;
drop table if exists public.financial_profiles cascade;
drop table if exists public.risk_analyses cascade;
drop table if exists public.risk_profiles cascade;
drop table if exists public.risk_acknowledgments cascade;
drop table if exists public.holdings cascade;
drop table if exists public.users cascade;

-- =============================================================================
-- Tables
-- =============================================================================

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone_number text,
  created_at timestamptz default now()
);

create table public.risk_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  accepted_at timestamptz not null,
  version text not null
);

create table public.risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  risk_level text not null,
  risk_score int not null,
  quiz_answers jsonb not null,
  updated_at timestamptz default now()
);
create unique index risk_profiles_user_id_key on public.risk_profiles (user_id);

create table public.risk_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  analysis jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index risk_analyses_user_id_key on public.risk_analyses (user_id);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  source text,
  isin text,
  symbol text,
  exchange text,
  instrument_id text,
  qty numeric not null,
  avg_cost numeric,
  asset_type text,
  sector text,
  mcap_bucket text,
  scheme_code integer,
  scheme_name text,
  fund_house text,
  created_at timestamptz default now()
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  title text,
  last_message_at timestamptz
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text,
  content text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table public.cas_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  status text,
  parsed_holdings jsonb,
  errors jsonb,
  created_at timestamptz default now()
);

create table public.financial_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  version text not null default 'v1',
  responses jsonb not null,
  metrics jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index financial_profiles_user_id_key on public.financial_profiles (user_id);

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  symbol text,
  exchange text,
  scheme_code integer,
  display_name text not null,
  alert_type text not null,
  target_value numeric not null,
  status text not null default 'active',
  triggered_at timestamptz,
  triggered_price numeric,
  created_at timestamptz not null default now()
);
create index price_alerts_status_idx on public.price_alerts (status) where status = 'active';

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.users enable row level security;
alter table public.risk_acknowledgments enable row level security;
alter table public.risk_profiles enable row level security;
alter table public.risk_analyses enable row level security;
alter table public.holdings enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.cas_uploads enable row level security;
alter table public.financial_profiles enable row level security;
alter table public.price_alerts enable row level security;

-- =============================================================================
-- RLS Policies
-- =============================================================================

create policy "Users manage own profile"
  on public.users for all
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage own risk acknowledgments"
  on public.risk_acknowledgments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own risk profiles"
  on public.risk_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own risk analyses"
  on public.risk_analyses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own holdings"
  on public.holdings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own chats"
  on public.chats for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own chat messages"
  on public.chat_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own cas uploads"
  on public.cas_uploads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own financial profiles"
  on public.financial_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own alerts"
  on public.price_alerts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
