-- ────────────────────────────────────────────────────────────────────────────
-- Migration 009: Phone Verified Column
--
-- Adds phone_verified boolean to the users table.
-- This is set to true only after the user has completed Supabase Phone OTP
-- verification — unlike phone_number which can be saved without verification.
--
-- New users (no risk_acknowledgments row) who verify their phone can access
-- the /tax-saver route but are blocked from the full portfolio app.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.users
  add column if not exists phone_verified boolean not null default false;

-- Index for efficient lookup in auth checks
create index if not exists users_phone_verified_idx
  on public.users (id)
  where phone_verified = true;
