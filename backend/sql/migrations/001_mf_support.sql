-- Add mutual fund columns to holdings table
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS scheme_code integer;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS scheme_name text;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS fund_house text;
