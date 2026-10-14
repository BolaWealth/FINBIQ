-- FINBIQ migrate 010 — per-type notification preferences (PRD: users control alerts).
CREATE TABLE IF NOT EXISTS notification_prefs (
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('transaction','low_balance','budget','bill','security','goal','financing','account')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (owner_user_id, type)
);
