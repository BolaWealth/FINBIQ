-- FINBIQ schema v0.1.0 — local Postgres 16. Apply with: psql $DATABASE_URL -f schema.sql
-- Order: extensions -> betterauth -> domain -> ledger -> app -> indexes.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ BetterAuth (required tables, stock shape) ============
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Domain: business mode ============
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_members (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','admin','staff','viewer')),
  PRIMARY KEY (business_id, user_id)
);

-- ============ Wallets (one row per personal wallet / business wallet) ============
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  business_id UUID REFERENCES businesses(id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((business_id IS NULL) OR (business_id IS NOT NULL))
);

-- ============ Ledger (double-entry) ============
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo TEXT NOT NULL DEFAULT '',
  reference_type TEXT NOT NULL DEFAULT '' CHECK (reference_type IN ('','transfer','bank','bill','savings','adjustment')),
  reference_id TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  debit NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0)),
  CHECK ((debit > 0) OR (credit > 0))
);

-- Balance view (never store balances on wallets table)
CREATE OR REPLACE VIEW wallet_balances AS
SELECT wallet_id, SUM(credit - debit)::NUMERIC(19,4) AS balance
FROM journal_lines GROUP BY wallet_id;

-- ============ Transfers (idempotency + status, posts to ledger on success) ============
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  from_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  to_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','posted','failed','reversed')),
  entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_wallet_id <> to_wallet_id)
);

-- ============ App: budgeting / savings / rewards / notifications ============
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('income','expense')),
  UNIQUE (owner_user_id, name)
);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly','custom')),
  limit_amount NUMERIC(19,4) NOT NULL CHECK (limit_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(19,4) NOT NULL CHECK (target_amount > 0),
  target_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS savings_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rewards_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK (points <> 0),
  reason TEXT NOT NULL CHECK (reason IN ('save_streak','budget_adherence','on_time_payment','goal_complete','adjustment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('transaction','low_balance','budget','bill','security','goal','financing')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_journal_lines_wallet ON journal_lines(wallet_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_budgets_owner ON budgets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_goals_owner ON savings_goals(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_user ON rewards_points(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
