-- FINBIQ migrate 003 — BetterAuth two-factor (TOTP) tables. Matches better-auth 1.x twoFactor schema.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS "twoFactor" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  secret TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_two_factor_user ON "twoFactor"("userId");
