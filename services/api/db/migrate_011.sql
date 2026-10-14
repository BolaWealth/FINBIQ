-- FINBIQ migrate 011 — allow 'redemption' points reason (cashback).
ALTER TABLE rewards_points DROP CONSTRAINT IF EXISTS rewards_points_reason_check;
ALTER TABLE rewards_points ADD CONSTRAINT rewards_points_reason_check
  CHECK (reason IN ('save_streak','budget_adherence','on_time_payment','goal_complete','adjustment','redemption'));
