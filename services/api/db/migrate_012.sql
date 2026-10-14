-- FINBIQ migrate 012 — savings product types (PRD Sec.13): flexible vs locked.
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'flexible'
  CHECK (type IN ('flexible','locked','group'));
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS locked_until DATE;
