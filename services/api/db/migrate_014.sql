-- FINBIQ migrate 014 — track who contributed what (group savings breakdown).
ALTER TABLE savings_contributions ADD COLUMN IF NOT EXISTS contributor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contrib_goal ON savings_contributions(goal_id);
