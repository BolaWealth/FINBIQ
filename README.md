# FINBIQ — Your money. Your business. Your financial intelligence.

AI-powered personal + business finance platform. Full PRD: `FINBIQ — Product Requirements Document NEW.md` (Sec.43–45 cover local execution, accounts/files, tool rationale).

Live: `http://localhost:5173` (web) + `http://localhost:4000` (API) · Public: `https://finbiq-app.netlify.app` · Repo: `https://github.com/BolaWealth/FINBIQ`

## Stack (locked)
- DB: Local Postgres 17 native, double-entry ledger (no Supabase/Neon)
- Auth: BetterAuth 1.7 — email/password, TOTP 2FA, console-token password reset (no SMTP locally)
- Storage: Cloudflare R2 stubs (keys pending owner)
- Hosting: local device (`start-local.ps1 -NoDocker`); static mirror on Netlify (no Vercel); Docker path documented for Win10 22H2+
- AI: Gemini 3.5-flash, grounded in ledger data, rule-based fallback (key in gitignored `.env`)
- Design: token-driven CSS (`packages/design-system/tokens.css`, currently deep purple + white)

## Repo layout
```
apps/web/            # Vite 5 + React 18 PWA (manifest, sw.js, install button)
services/api/        # Node stdlib-http API + tsx watch; db/ (schema, seed, migrate_002-014); test/ (17 tests)
packages/design-system/ # tokens.json/.css (single source of truth)
packages/shared/     # (reserved)
infra/               # docker-compose.yml (Win22H2+ path), cloudflared.exe (gitignored)
docs/adr/            # 0001 local stack, 0002 ledger, 0003 auth/storage, 0004 local-auth
scripts/             # gen-icons.mjs (dependency-free PWA icon generator)
```

## Start
```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -NoDocker
# API :4000, web :5173. First run: install Node 22 LTS + PostgreSQL 17 (superuser postgres / finbiq_dev_only).
# pnpm install --allow-build=esbuild (pnpm 12 build approval)
```

## Endpoints (selection)
Transfers, fund (cash/card-recorded), bills, airtime/data, budgets + per-category spend, savings (flexible/locked/group, contribute/withdraw, member breakdown), notifications + prefs, reports/summary, insights, AI ask, rewards earn/redeem, business CRUD + summary, financing estimate, investments catalog, metrics, activity + CSV export, Paystack initialize/verify/webhook (test keys).

## Status
MVP P0 per NEW PRD Sec.25/28 complete except partner-gated rails (bank, live lending/investments, telco fulfillment, SMTP mail). Regulated items stay behind licensed partners (PRD Sec.23).
