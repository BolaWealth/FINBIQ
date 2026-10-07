// FINBIQ read + write queries — wallets, budgets, savings, notifications.
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

export async function createBudget(ownerUserId: string, categoryName: string, limitAmount: string, period = "monthly") {
  if (Number(limitAmount) <= 0) throw new Error("limitAmount must be > 0");
  const cat = (
    await pool.query(
      `INSERT INTO categories (owner_user_id, name, kind) VALUES ($1,$2,'expense')
       ON CONFLICT (owner_user_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [ownerUserId, categoryName]
    )
  ).rows[0];
  const b = (
    await pool.query(
      `INSERT INTO budgets (owner_user_id, category_id, period, limit_amount)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [ownerUserId, cat.id, period, limitAmount]
    )
  ).rows[0];
  return { id: b.id, category: categoryName, limitAmount, period };
}

// Demo spend rule: sum of posted outgoing transfers from owner's wallets.
export async function budgetSpend(ownerUserId: string) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(t.amount),0) AS spent
     FROM transfers t JOIN wallets w ON w.id = t.from_wallet_id
     WHERE w.owner_user_id = $1 AND t.status = 'posted'`,
    [ownerUserId]
  );
  return { spent: r.rows[0].spent };
}

export async function createSavingsGoal(ownerUserId: string, name: string, targetAmount: string, targetDate: string | null) {
  if (!name) throw new Error("name is required");
  if (Number(targetAmount) <= 0) throw new Error("targetAmount must be > 0");
  const g = (
    await pool.query(
      `INSERT INTO savings_goals (owner_user_id, name, target_amount, target_date)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [ownerUserId, name, targetAmount, targetDate]
    )
  ).rows[0];
  return { id: g.id, name, targetAmount };
}

export async function contributeToGoal(goalId: string, amount: string) {
  if (Number(amount) <= 0) throw new Error("amount must be > 0");
  await pool.query(`INSERT INTO savings_contributions (goal_id, amount) VALUES ($1,$2)`, [goalId, amount]);
  return { goalId, amount };
}

export async function listNotifications(userId: string) {
  const r = await pool.query(
    `SELECT id, type, title, body, read_at, created_at FROM notifications
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return r.rows;
}

export async function createNotification(userId: string, type: string, title: string, body = "") {
  const r = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4) RETURNING id`,
    [userId, type, title, body]
  );
  return { id: r.rows[0].id };
}
