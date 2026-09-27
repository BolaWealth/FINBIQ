# API DB v0.1.0

`db/schema.sql` is the source of truth until Drizzle is installed (Step 4).

## Apply locally (needs Postgres running)
```powershell
psql $env:DATABASE_URL -f services/api/db/schema.sql
```

## Key rules
- Balances via `wallet_balances` view only.
- `transfers.idempotency_key` is UNIQUE — retry with same key.
- Every `journal_entries` insert must have lines summing `debit = credit` (enforced in app, checked in review).
