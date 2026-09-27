# ADR-0003: BetterAuth + R2 wiring

Date: 2026-09-27
Status: Accepted

## Auth (BetterAuth, self-hosted)
- Postgres-backed via `DATABASE_URL`; tables from `services/api/db/schema.sql` (`user/session/account/verification`).
- `emailAndPassword` with `requireEmailVerification`; session 7d + `updateAge` 1d; `advanced.database.generateId = false` (DB defaults own IDs).
- Business mode via app tables `businesses/business_members` (not BetterAuth org plugin yet — keeps Step 4 dependency-free).
- Rate-limit + IP/userAgent captured in `session` rows; transaction PIN/MFA deferred to Step 6.

## Storage (Cloudflare R2, S3-compatible)
- `S3Client` with `R2_ENDPOINT` + `R2_ACCESS_KEY_ID/SECRET`; bucket `R2_BUCKET`.
- Private by default; read via presigned GET (15 min), upload via presigned PUT (10 min).
- Keys: `kyc/{userId}/{uuid}-{filename}`, `receipts/{transferId}.pdf`. No Supabase Storage.
