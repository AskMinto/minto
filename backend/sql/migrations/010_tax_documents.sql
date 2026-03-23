-- ────────────────────────────────────────────────────────────────────────────
-- Migration 010: Tax Documents (Web Tax Saver audit trail)
--
-- Creates:
--   tax_documents — per-document audit trail for web tax saver uploads
--
-- Unlike wa_documents (which tracks GCS upload/deletion for WhatsApp),
-- web uploads are parsed in-memory and never stored long-term.
-- This table records what documents were uploaded and their parse status,
-- enabling the /documents page and DPDPA right-of-access queries.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.tax_documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  doc_type        text not null,           -- 'cas' | 'broker_pl' | 'broker_holdings' | 'itr'
  broker_name     text,                    -- e.g. 'zerodha', 'groww' (null for CAS/ITR)
  file_name       text,                    -- original filename from the upload
  parse_status    text not null default 'parsed',  -- 'parsed' | 'failed'
  uploaded_at     timestamptz default now(),
  deleted_at      timestamptz              -- null unless user deleted via DPDPA right-to-erasure
);

create index if not exists tax_documents_user_id_idx
  on public.tax_documents (user_id);

-- RLS: users can only see their own documents
alter table public.tax_documents enable row level security;

create policy "Users own their tax documents"
  on public.tax_documents for all
  using (auth.uid() = user_id);

-- Service role can do everything (used by backend tax_chat router)
grant all on public.tax_documents to service_role;
