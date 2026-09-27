# FINBIQ — Your money. Your business. Your financial intelligence.

AI-powered personal + business finance platform. See `FINBIQ - Product Requirements Document.docx` for full PRD.

## Stack (locked)
- DB: Local Postgres 16 (no Supabase) + Redis 7 for cache/queues
- Auth: BetterAuth (self-hosted, Postgres-backed)
- Storage: Cloudflare R2 (S3-compatible)
- Hosting: Local device via Docker Compose (no Vercel)
- Web preview: `design-preview.html` (static, open by double-click)

## Repo layout
```
apps/web/            # Vite+React (local dev, no Vercel)
services/api/        # Node + Hono/Fastify + BetterAuth + Drizzle
packages/design-system/ # tokens + components (see design-preview.html)
packages/shared/     # shared types/validation
infra/               # local compose, Caddy
docs/adr/            # architecture decisions
```

## Local prerequisites (install once)
1. Node 20 LTS + pnpm
2. Docker Desktop (includes Compose)
3. Cloudflare R2 bucket + API token

## Start (after prerequisites)
```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis
# then: pnpm install, pnpm db:migrate, pnpm dev
```

## Phases
0. Foundation (this commit) -> 1. Design system -> 2. DB schema -> 3. BetterAuth -> 4. API skeleton -> 5. Wallet/ledger -> MVP features -> AI v1 -> hardening
