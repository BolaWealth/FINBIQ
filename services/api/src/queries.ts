// FINBIQ read queries v0.1.0 — wallet balance, budgets, savings goals.
import { pool } from "./auth.js";

export async function getWalletBalance(walletId: string) {
  const r = await pool.query("SELECT balance FROM wallet_balances WHERE wallet_id = $1", [walletId]);
  return { walletId, balance: r.rows[0]?.balance ?? "0.0000" };
}

export async function listBudgets(ownerUserId: string) {
  const r = await pool.query(
    `SELECT b.id, b.limit_amount, b.period, c.name AS category
     FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
     WHERE b.owner_user_id = $1 ORDER BY b.created_at`,
    [ownerUserId]
  );
  return r.rows;
}

export async function listSavingsGoals(ownerUserId: string) {
  const r = await pool.query(
    `SELECT g.id, g.name, g.target_amount,
       COALESCE((SELECT SUM(amount) FROM savings_contributions s WHERE s.goal_id = g.id), 0) AS saved
     FROM savings_goals g WHERE g.owner_user_id = $1 ORDER BY g.created_at`,
    [ownerUserId]
  );
  return r.rows;
}
