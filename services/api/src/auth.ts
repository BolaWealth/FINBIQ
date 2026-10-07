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
    sendResetPassword: async ({ user, url }) => {
      // LOCAL ONLY: log the reset link to the API console instead of emailing.
      // Prod MUST send this via SMTP (see ADR-0004).
      console.log(`[password-reset] ${user.email}: ${url}`);
    },
  },
  plugins: [twoFactor()],
  databaseHooks: {
    user: {
      create: {
        // Local onboarding: every new account starts with a wallet + defaults
        // so the dashboard works immediately (PRD Sec.24 Step 3).
        after: async (user) => {
          const w = await pool.query(
            `INSERT INTO wallets (owner_user_id, currency) VALUES ($1,'NGN') RETURNING id`,
            [user.id]
          );
          await pool.query(
            `INSERT INTO categories (owner_user_id, name, kind) VALUES
             ($1,'Food','expense'), ($1,'Salary','income') ON CONFLICT DO NOTHING`,
            [user.id]
          );
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body) VALUES
             ($1,'account','Welcome to FINBIQ','Your wallet is ready. Set a budget or savings goal to begin.')`,
            [user.id]
          );
          console.log(`[onboarding] wallet ${w.rows[0].id} created for ${user.id}`);
        },
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: { database: { generateId: false } },
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:5173"],
});

export type Session = typeof auth.$Infer.Session;
