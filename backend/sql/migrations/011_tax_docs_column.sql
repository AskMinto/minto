-- Migration 011: add intake_answers and tax_docs columns to tax_sessions
--
-- intake_answers: stores the 3-question intake (income_slab, tax_regime, holdings)
-- tax_docs:       keyed manifest of documents — null = not yet uploaded, string = extracted text

ALTER TABLE tax_sessions
  ADD COLUMN IF NOT EXISTS intake_answers jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_docs       jsonb DEFAULT '{}'::jsonb;
