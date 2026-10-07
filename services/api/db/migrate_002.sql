-- FINBIQ migrate 002 — extend transfer statuses per PRD Sec.8 (pending/processing/completed/failed/reversed/cancelled).
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_status_check;
ALTER TABLE transfers ADD CONSTRAINT transfers_status_check
  CHECK (status IN ('pending','processing','completed','failed','reversed','cancelled'));
