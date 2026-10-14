-- FINBIQ migrate 015 — esusu circles, family wallets, autopilot, merchant links.
CREATE TABLE IF NOT EXISTS esusu_circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  pot_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
  current_round INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','complete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS esusu_members (
  circle_id UUID NOT NULL REFERENCES esusu_circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  payout_order INTEGER NOT NULL,
  paid_rounds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (circle_id, user_id)
);
CREATE TABLE IF NOT EXISTS family_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  allowance NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (allowance >= 0),
  spend_cap NUMERIC(19,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS autopilot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'sweep' CHECK (kind IN ('sweep')),
  goal_id UUID REFERENCES savings_goals(id) ON DELETE CASCADE,
  min_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
  last_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  amount NUMERIC(19,4),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
