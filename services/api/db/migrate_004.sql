-- FINBIQ migrate 004 — allow 'account' notification type (welcome/onboarding notices).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('transaction','low_balance','budget','bill','security','goal','financing','account'));
