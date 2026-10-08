-- FINBIQ migrate 007 — airtime & data purchases (recorded locally; live
-- fulfillment needs a telco aggregator partner).
CREATE TABLE IF NOT EXISTS airtime_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('airtime','data')),
  network TEXT NOT NULL,
  phone TEXT NOT NULL,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_airtime_owner ON airtime_purchases(owner_user_id);
