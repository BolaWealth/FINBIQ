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

// Demo spend rule: sum of completed outgoing transfers from owner's wallets.
export async function budgetSpend(ownerUserId: string) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(t.amount),0) AS spent
     FROM transfers t JOIN wallets w ON w.id = t.from_wallet_id
     WHERE w.owner_user_id = $1 AND t.status = 'completed'`,
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
  const g = await pool.query(`SELECT owner_user_id, name, target_amount FROM savings_goals WHERE id = $1`, [goalId]);
  if (g.rowCount) {
    const owner = g.rows[0].owner_user_id;
    await awardPoints(owner, 10, "save_streak");
    const tot = await pool.query(`SELECT COALESCE(SUM(amount),0) AS s FROM savings_contributions WHERE goal_id = $1`, [goalId]);
    if (Number(tot.rows[0].s) >= Number(g.rows[0].target_amount)) {
      await awardPoints(owner, 50, "goal_complete");
      await createNotification(owner, "goal", `Goal "${g.rows[0].name}" completed`, "You earned 50 FINBIQ Points.");
    }
  }
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

// ---- MVP gap closure vs PRD Sec.8/19/21/33: history, reports, insights, rewards, profile ----

export async function listTransfers(ownerUserId: string) {
  const r = await pool.query(
    `SELECT t.id, t.amount, t.currency, t.status, t.created_at,
       t.from_wallet_id, t.to_wallet_id
     FROM transfers t JOIN wallets w ON w.id = t.from_wallet_id
     WHERE w.owner_user_id = $1 ORDER BY t.created_at DESC LIMIT 50`,
    [ownerUserId]
  );
  return r.rows;
}

export async function getTransfer(transferId: string) {
  const r = await pool.query(`SELECT * FROM transfers WHERE id = $1`, [transferId]);
  if (!r.rowCount) throw new Error("transfer not found");
  const lines = await pool.query(
    `SELECT wallet_id, debit, credit FROM journal_lines WHERE entry_id = $1`,
    [r.rows[0].entry_id]
  );
  return { ...r.rows[0], lines: lines.rows };
}

export async function financeSummary(ownerUserId: string) {
  const wallets = await pool.query(
    `SELECT w.id, COALESCE(SUM(l.credit - l.debit),0) AS balance
     FROM wallets w LEFT JOIN journal_lines l ON l.wallet_id = w.id
     WHERE w.owner_user_id = $1 GROUP BY w.id`,
    [ownerUserId]
  );
  const flows = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN w.id = t.to_wallet_id THEN t.amount ELSE 0 END),0) AS inflow,
       COALESCE(SUM(CASE WHEN w.id = t.from_wallet_id THEN t.amount ELSE 0 END),0) AS outflow
     FROM transfers t JOIN wallets w ON (w.id = t.from_wallet_id OR w.id = t.to_wallet_id)
     WHERE w.owner_user_id = $1 AND t.status = 'completed'`,
    [ownerUserId]
  );
  const savings = await pool.query(
    `SELECT COALESCE(SUM(s.amount),0) AS saved, COALESCE(SUM(g.target_amount),0) AS target
     FROM savings_goals g LEFT JOIN savings_contributions s ON s.goal_id = g.id
     WHERE g.owner_user_id = $1`,
    [ownerUserId]
  );
  return {
    wallets: wallets.rows,
    totalBalance: wallets.rows.reduce((a, w) => a + Number(w.balance), 0),
    inflow: flows.rows[0].inflow,
    outflow: flows.rows[0].outflow,
    saved: savings.rows[0].saved,
    savingsTarget: savings.rows[0].target,
  };
}

// Rule-based, data-grounded insights (PRD Sec.15 basic AI + Sec.36 anti-hallucination:
// every insight cites a real aggregate, never invents figures).
export async function insights(ownerUserId: string) {
  const out: string[] = [];
  const spend = await budgetSpend(ownerUserId);
  const budgets = await listBudgets(ownerUserId);
  for (const b of budgets) {
    const pct = Number(b.limit_amount) > 0 ? (Number(spend.spent) / Number(b.limit_amount)) * 100 : 0;
    if (pct >= 100) out.push(`You have exceeded your ${b.category ?? "budget"} budget (${pct.toFixed(0)}% of ${b.limit_amount}).`);
    else if (pct >= 75) out.push(`You have used ${pct.toFixed(0)}% of your ${b.category ?? "budget"} budget this month.`);
  }
  const goals = await listSavingsGoals(ownerUserId);
  for (const g of goals) {
    const pct = Number(g.target_amount) > 0 ? (Number(g.saved) / Number(g.target_amount)) * 100 : 0;
    if (pct >= 100) out.push(`Goal "${g.name}" fully funded — consider setting a next goal.`);
    else out.push(`Goal "${g.name}" is ${pct.toFixed(0)}% funded (${g.saved} of ${g.target_amount}).`);
  }
  if (!out.length) out.push("No activity yet — make a transfer or set a budget to generate insights.");
  return out;
}

export async function rewardPoints(userId: string) {
  const r = await pool.query(`SELECT COALESCE(SUM(points),0) AS total FROM rewards_points WHERE user_id = $1`, [userId]);
  return { total: Number(r.rows[0].total) };
}

export async function awardPoints(userId: string, points: number, reason: string) {
  await pool.query(`INSERT INTO rewards_points (user_id, points, reason) VALUES ($1,$2,$3)`, [userId, points, reason]);
}

export async function getProfile(userId: string) {
  const u = await pool.query(`SELECT id, name, email, "emailVerified" FROM "user" WHERE id = $1`, [userId]);
  if (!u.rowCount) throw new Error("user not found");
  const w = await pool.query(`SELECT id, currency FROM wallets WHERE owner_user_id = $1`, [userId]);
  return { ...u.rows[0], wallets: w.rows };
}
