// FINBIQ BetterAuth config — local Postgres, email/password + TOTP 2FA.
// Tables: services/api/db/schema.sql + migrate_003.sql. See docs/adr/0004-local-auth.md.
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-replace-me",
  database: pool,
  emailAndPassword: {
    enabled: true,
    // LOCAL ONLY: no SMTP here, so verification mail can't be delivered.
    // Prod MUST set requireEmailVerification: true + SMTP (see ADR-0004).
    requireEmailVerification: false,
    autoSignIn: true,
  },
  plugins: [twoFactor()],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: { database: { generateId: false } },
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:5173"],
});

export type Session = typeof auth.$Infer.Session;
