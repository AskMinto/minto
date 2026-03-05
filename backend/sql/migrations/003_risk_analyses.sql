-- Add risk_analyses table for AI-generated portfolio risk analysis
create table if not exists public.risk_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  analysis jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists risk_analyses_user_id_key on public.risk_analyses (user_id);

alter table public.risk_analyses enable row level security;

create policy "Users manage own risk analyses" on public.risk_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
