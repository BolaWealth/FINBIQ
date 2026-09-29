# ADR-0001: Local-first stack (no Supabase, no Vercel)

Date: 2026-09-27
Status: Accepted

## Decision
- Postgres 16 running locally (Docker `postgres:16-alpine`), owner-managed.
- Redis 7 locally for BetterAuth rate-limit, sessions cache, job queues.
- BetterAuth self-hosted against local Postgres (tables: user, session, account, verification).
- Cloudflare R2 for object storage via S3 API + presigned URLs.
- Host API + web on local device via Docker Compose / `pnpm dev`. No Vercel, no Supabase.

## Rationale
- Avoid managed subscription cost during MVP.
- Keep ledger data local for control.
- R2 decouples file storage from DB host.
- Vite+React + Node API avoids Vercel lock-in.

## Consequences
- Must install Node 22 + Docker Desktop locally.
- Backups are owner responsibility (`pg_dump` cron + R2 copy).
- R2 still requires network + Cloudflare account.
