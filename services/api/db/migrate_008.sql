-- FINBIQ migrate 008 — Paystack card funding (payments + journal support).
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack')),
  reference TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'initialized' CHECK (status IN ('initialized','success','failed','abandoned')),
  provider_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_wallet ON payments(wallet_id);

-- Allow Paystack funding entries in the journal.
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN ('','transfer','bank','bill','savings','adjustment','paystack'));
