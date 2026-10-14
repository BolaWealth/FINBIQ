-- FINBIQ migrate 009 — transfer categories so spend tracks per category
-- across transfers, bills, and airtime/data.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General';
CREATE INDEX IF NOT EXISTS idx_transfers_category ON transfers(category);
