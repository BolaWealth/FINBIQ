// FINBIQ BetterAuth config stub v0.1.0 — install deps in Step 5 (needs Node 20).
// Deps: better-auth, pg. Tables: see services/api/db/schema.sql (user/session/account/verification).
import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-replace-me",
  database: pool,
  emailAndPassword: { enabled: true, requireEmailVerification: true, autoSignIn: false },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: { database: { generateId: false } },
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:5173"],
});

export type Session = typeof auth.$Infer.Session;
