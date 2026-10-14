-- FINBIQ migrate 013 — withdrawals are negative contributions (net = SUM).
ALTER TABLE savings_contributions DROP CONSTRAINT IF EXISTS savings_contributions_amount_check;
ALTER TABLE savings_contributions ADD CONSTRAINT savings_contributions_amount_check CHECK (amount <> 0);
