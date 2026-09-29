# Local run (Windows, no Supabase / no Vercel)

## 1. Prerequisites (once)
1. Node 22 LTS from nodejs.org — verify: `node --version`, `npm.cmd --version`
2. PostgreSQL 17 native (EDB installer) — Docker Desktop NOT required (needs Win10 22H2+, this machine is 1909). Verify: `psql --version`
   - During install set postgres superuser password `finbiq_dev_only`, port `5432`.
   - Or Docker path (only on Win10 22H2+/Win11): Docker Desktop — verify: `docker --version`
3. Cloudflare R2 bucket + token (storage only; app runs without it, uploads fail until set)

## 2. Configure
```powershell
Copy-Item .env.example .env
Copy-Item apps\web\.env.example apps\web\.env
# edit .env: DATABASE_URL, BETTER_AUTH_SECRET, R2_* values
```

## 3. Start data (native, no Docker)
```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -NoDocker
```
This starts the `postgresql-x64-17` service if stopped, creates role/db `finbiq`, applies schema+seed, then opens API + web windows.

## 3b. Start data (Docker path, Win10 22H2+ only)
```powershell
docker compose up -d postgres redis
docker compose ps
```

## 4. Apply DB (needs psql OR Docker)
```powershell
# via container (no local psql needed):
docker compose exec -T postgres psql -U finbiq -d finbiq -f - < services\api\db\schema.sql
docker compose exec -T postgres psql -U finbiq -d finbiq -f - < services\api\db\seed.sql
```

## 5. Install + run (needs Node)
```powershell
npm install -g pnpm
pnpm install
pnpm --filter @finbiq/api dev    # :4000  -> GET /health
pnpm --filter @finbiq/web dev    # :5173  -> local page
```

## 6. Verify
- API: `http://localhost:4000/health` -> `{"ok":true,...}`
- Balance: `http://localhost:4000/v1/wallets/11111111-1111-1111-1111-111111111111/balance` -> `842500`
- Budgets: `http://localhost:4000/v1/budgets?owner=demo-user-1`
- Web: `http://localhost:5173` shows "api: ok" once API runs
