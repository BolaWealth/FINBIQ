-- FINBIQ seed v0.1.0 — demo data only. Apply after schema.sql:
-- psql $DATABASE_URL -f db/schema.sql -f db/seed.sql
-- Fixed IDs keep demo + web stub stable. All ledger inserts balance (debit = credit).

INSERT INTO "user" (id, name, email, "emailVerified") VALUES
  ('demo-user-1', 'Demo User', 'demo@finbiq.local', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallets (id, owner_user_id, currency) VALUES
  ('11111111-1111-1111-1111-111111111111', 'demo-user-1', 'NGN'),
  ('22222222-2222-2222-2222-222222222222', 'demo-user-1', 'NGN'),
  ('00000000-0000-0000-0000-000000000000', 'demo-user-1', 'NGN')
ON CONFLICT (id) DO NOTHING;

-- Opening balance: credit personal 842500, debit equity 842500 (net zero).
INSERT INTO journal_entries (id, memo, reference_type, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'opening balance', 'adjustment', 'demo-user-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO journal_lines (entry_id, wallet_id, debit, credit) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 0, 842500),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 842500, 0)
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, owner_user_id, name, kind) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'demo-user-1', 'Food', 'expense'),
  ('c0000000-0000-0000-0000-000000000002', 'demo-user-1', 'Salary', 'income')
ON CONFLICT (id) DO NOTHING;

INSERT INTO budgets (id, owner_user_id, category_id, period, limit_amount) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'demo-user-1', 'c0000000-0000-0000-0000-000000000001', 'monthly', 100000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO savings_goals (id, owner_user_id, name, target_amount, target_date) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'demo-user-1', 'Rent', 310000, CURRENT_DATE + INTERVAL '90 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO savings_contributions (goal_id, amount) VALUES
  ('d0000000-0000-0000-0000-000000000001', 50000),
  ('d0000000-0000-0000-0000-000000000001', 160000)
ON CONFLICT DO NOTHING;

INSERT INTO notifications (user_id, type, title, body) VALUES
  ('demo-user-1', 'budget', 'Food budget at 75%', 'You have used 75% of your food budget this month.')
ON CONFLICT DO NOTHING;
