# ADR-0002: Double-entry ledger on local Postgres

Date: 2026-09-27
Status: Accepted

## Decision
- Never update wallet balances directly. Balances are derived: `SUM(credit - debit)` over `journal_lines`.
- Every money movement writes one `journal_entries` row + >=2 `journal_lines` rows in a single DB transaction, with `CHECK (debit >= 0, credit >= 0, NOT (debit > 0 AND credit > 0))` and app-level `SUM(debit) = SUM(credit)` validation.
- Idempotency via `transfers.idempotency_key UNIQUE` (client-supplied). Retries reuse the key, never double-post.
- Currencies stored as `CHAR(3)` + `NUMERIC(19,4)` amounts; display rounding only at presentation.

## Tables (see services/api/db/schema.sql)
`user/session/account/verification` (BetterAuth) + `businesses`, `wallets`, `journal_entries`, `journal_lines`, `transfers`, `categories`, `budgets`, `savings_goals`, `savings_contributions`, `rewards_points`, `notifications`.
