-- FINBIQ migrate 006 — bills (recorded locally; live biller rails need a payments partner).
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  biller TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Bills',
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bills_owner ON bills(owner_user_id);
