# Local run (Windows, no Supabase / no Vercel)

## 1. Prerequisites (once)
1. Node 22 LTS from nodejs.org — verify: `node --version`, `npm --version`
2. Docker Desktop (for Postgres 16 + Redis 7) — verify: `docker --version`
3. Cloudflare R2 bucket + token (storage only; app runs without it, uploads fail until set)

## 2. Configure
```powershell
Copy-Item .env.example .env
Copy-Item apps\web\.env.example apps\web\.env
# edit .env: DATABASE_URL, BETTER_AUTH_SECRET, R2_* values
```

## 3. Start data services
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
