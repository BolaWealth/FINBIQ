-- FINBIQ migrate 005 — fix inverted transfer lines (sender was credited).
-- Correct rule: debit sender, credit receiver.
UPDATE journal_lines l SET debit = l.credit, credit = l.debit
FROM journal_entries e
WHERE l.entry_id = e.id AND e.reference_type = 'transfer';
