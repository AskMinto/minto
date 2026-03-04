-- Core user profile
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz default now()
);

create table if not exists public.risk_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  accepted_at timestamptz not null,
  version text not null
);

create table if not exists public.risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  risk_level text not null,
  risk_score int not null,
  quiz_answers jsonb not null,
  updated_at timestamptz default now()
);

create unique index if not exists risk_profiles_user_id_key on public.risk_profiles (user_id);

create table if not exists public.holdings (
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

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  title text,
  last_message_at timestamptz
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text,
  content text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists public.cas_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  status text,
  parsed_holdings jsonb,
  errors jsonb,
  created_at timestamptz default now()
);

create table if not exists public.financial_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  version text not null default 'v1',
  responses jsonb not null,
  metrics jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists financial_profiles_user_id_key
  on public.financial_profiles (user_id);

-- RLS policies
alter table public.users enable row level security;
alter table public.risk_acknowledgments enable row level security;
alter table public.risk_profiles enable row level security;
alter table public.holdings enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.cas_uploads enable row level security;
alter table public.financial_profiles enable row level security;

create policy "Users manage own profile" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage own risk acknowledgments" on public.risk_acknowledgments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own risk profiles" on public.risk_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own holdings" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own chats" on public.chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own chat messages" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own cas uploads" on public.cas_uploads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own financial profiles" on public.financial_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
