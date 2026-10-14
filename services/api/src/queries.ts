// FINBIQ read + write queries — wallets, budgets, savings, notifications.
import { pool } from "./auth.js";

// System equity wallet: balancing side of external inflows/outflows.
// Never counts as user money in aggregates (see financeSummary).
const EQUITY_WALLET_ID = "00000000-0000-0000-0000-000000000000";

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
    `SELECT g.id, g.name, g.target_amount, g.type, g.locked_until,
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

// Spend per category across ALL outflows: transfers (own category),
// bills (own category), airtime/data (kind as category). Completed only.
export async function budgetSpend(ownerUserId: string) {
  const r = await pool.query(
    `SELECT category, SUM(amount) AS spent FROM (
       SELECT t.category, t.amount FROM transfers t
       JOIN wallets w ON w.id = t.from_wallet_id
       WHERE w.owner_user_id = $1 AND t.status = 'completed'
       UNION ALL
       SELECT b.category, b.amount FROM bills b
       WHERE b.owner_user_id = $1 AND b.status = 'completed'
       UNION ALL
       SELECT INITCAP(a.kind) AS category, a.amount FROM airtime_purchases a
       WHERE a.owner_user_id = $1 AND a.status = 'completed'
     ) s GROUP BY category`,
    [ownerUserId]
  );
  const byCategory: Record<string, string> = {};
  let total = 0;
  for (const row of r.rows) {
    byCategory[row.category] = row.spent;
    total += Number(row.spent);
  }
  return { spent: String(total), byCategory };
}

export async function createSavingsGoal(
  ownerUserId: string, name: string, targetAmount: string, targetDate: string | null,
  type = "flexible", lockedUntil: string | null = null
) {
  if (!name) throw new Error("name is required");
  if (Number(targetAmount) <= 0) throw new Error("targetAmount must be > 0");
  if (!["flexible", "locked", "group"].includes(type)) throw new Error("unknown goal type");
  if (type === "locked" && !lockedUntil) throw new Error("locked goals need a locked_until date");
  const g = (
    await pool.query(
      `INSERT INTO savings_goals (owner_user_id, name, target_amount, target_date, type, locked_until)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [ownerUserId, name, targetAmount, targetDate, type, lockedUntil]
    )
  ).rows[0];
  return { id: g.id, name, targetAmount, type };
}

// Withdraw saved funds back to a wallet. Locked goals refuse before maturity.
// Withdrawals are negative contributions (history stays complete).
export async function withdrawFromGoal(ownerUserId: string, goalId: string, walletId: string, amount: string) {
  if (Number(amount) <= 0) throw new Error("amount must be > 0");
  const g = await pool.query(`SELECT * FROM savings_goals WHERE id = $1 AND owner_user_id = $2`, [goalId, ownerUserId]);
  if (!g.rowCount) throw new Error("goal not found");
  if (g.rows[0].type === "locked" && g.rows[0].locked_until && new Date(g.rows[0].locked_until) > new Date()) {
    throw new Error(`locked until ${g.rows[0].locked_until}`);
  }
  const w = await pool.query(`SELECT id FROM wallets WHERE id = $1 AND owner_user_id = $2`, [walletId, ownerUserId]);
  if (!w.rowCount) throw new Error("wallet not found");
  const tot = await pool.query(`SELECT COALESCE(SUM(amount),0) AS s FROM savings_contributions WHERE goal_id = $1`, [goalId]);
  if (Number(tot.rows[0].s) < Number(amount)) throw new Error("insufficient saved funds");
  const equity = "00000000-0000-0000-0000-000000000000";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO savings_contributions (goal_id, amount, contributor_user_id) VALUES ($1,$2,$3)`, [goalId, -Number(amount), ownerUserId]);
    const entry = (
      await client.query(
        `INSERT INTO journal_entries (memo, reference_type, reference_id, created_by)
         VALUES ('savings withdrawal','savings',$1,$2) RETURNING id`,
        [goalId, ownerUserId]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO journal_lines (entry_id, wallet_id, debit, credit) VALUES ($1,$2,0,$3), ($1,$4,$3,0)`,
      [entry.id, walletId, amount, equity]
    );
    await client.query("COMMIT");
    await moneyAlerts(ownerUserId, walletId).catch(() => {});
    return { goalId, amount };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function contributeToGoal(goalId: string, amount: string, contributorUserId: string | null = null) {
  if (Number(amount) <= 0) throw new Error("amount must be > 0");
  const g = await pool.query(`SELECT owner_user_id, name, target_amount FROM savings_goals WHERE id = $1`, [goalId]);
  if (!g.rowCount) throw new Error("goal not found");
  const who = contributorUserId ?? g.rows[0].owner_user_id;
  await pool.query(`INSERT INTO savings_contributions (goal_id, amount, contributor_user_id) VALUES ($1,$2,$3)`, [goalId, amount, who]);
  {
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
  const pref = await pool.query(
    `SELECT enabled FROM notification_prefs WHERE owner_user_id = $1 AND type = $2`,
    [userId, type]
  );
  if (pref.rowCount && !pref.rows[0].enabled) return { skipped: true as const };
  const r = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4) RETURNING id`,
    [userId, type, title, body]
  );
  return { id: r.rows[0].id };
}

const NOTICE_TYPES = ['transaction','low_balance','budget','bill','security','goal','financing','account'];

export async function getPrefs(ownerUserId: string) {
  const r = await pool.query(`SELECT type, enabled FROM notification_prefs WHERE owner_user_id = $1`, [ownerUserId]);
  const map: Record<string, boolean> = {};
  for (const row of r.rows) map[row.type] = row.enabled;
  return NOTICE_TYPES.map((type) => ({ type, enabled: map[type] ?? true }));
}

export async function setPref(ownerUserId: string, type: string, enabled: boolean) {
  if (!NOTICE_TYPES.includes(type)) throw new Error("unknown notification type");
  await pool.query(
    `INSERT INTO notification_prefs (owner_user_id, type, enabled) VALUES ($1,$2,$3)
     ON CONFLICT (owner_user_id, type) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [ownerUserId, type, enabled]
  );
  return { type, enabled };
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
  // Exclude the system equity wallet: it holds the balancing side of external
  // inflows/outflows, so including it nets the user's money to zero and the
  // AI snapshot would report "total balance: 0".
  const wallets = await pool.query(
    `SELECT w.id, COALESCE(SUM(l.credit - l.debit),0) AS balance
     FROM wallets w LEFT JOIN journal_lines l ON l.wallet_id = w.id
     WHERE w.owner_user_id = $1 AND w.id <> '00000000-0000-0000-0000-000000000000'
     GROUP BY w.id`,
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
    if (pct >= 100) out.push(`Goal "${g.name}" fully funded (${g.saved} of ${g.target_amount}) — consider setting a next goal.`);
    else out.push(`Goal "${g.name}" is ${pct.toFixed(0)}% funded (${g.saved} of ${g.target_amount}).`);
  }
  if (!out.length) out.push("No activity yet — make a transfer or set a budget to generate insights.");
  return out;
}

export async function rewardPoints(userId: string) {
  const r = await pool.query(`SELECT COALESCE(SUM(points),0) AS total FROM rewards_points WHERE user_id = $1`, [userId]);
  return { total: Number(r.rows[0].total) };
}

// Grounded Q&A: snapshot is built ONLY from live ledger aggregates, then
// answered by Gemini (or a clear fallback when no key is configured).
export async function askFinanceQuestion(ownerUserId: string, question: string) {
  if (!question.trim()) throw new Error("question is required");
  const [s, spend, budgets, goals] = await Promise.all([
    financeSummary(ownerUserId),
    budgetSpend(ownerUserId),
    listBudgets(ownerUserId),
    listSavingsGoals(ownerUserId),
  ]);
  const snapshot = [
    `Total balance: ${s.totalBalance}`,
    `Money in: ${s.inflow}, money out: ${s.outflow}`,
    `Total outflow this period: ${spend.spent}`,
    `Budgets: ${budgets.map((b) => `${b.category ?? "?"} limit ${b.limit_amount}`).join("; ") || "none"}`,
    `Savings: ${goals.map((g) => `${g.name} saved ${g.saved} of ${g.target_amount}`).join("; ") || "none"}`,
  ].join("\n");
  try {
    const { groundedAnswer } = await import("./ai.js");
    const answer = await groundedAnswer(snapshot, question.trim().slice(0, 500));
    return { answer, grounded: true };
  } catch (e) {
    const lines = await insights(ownerUserId);
    const reason = e instanceof Error ? e.message : "unknown error";
    const offline = reason === "GEMINI_API_KEY not set";
    return {
      answer: offline
        ? `AI is offline (no Gemini key configured). What I can tell you from your data:\n- ${lines.join("\n- ")}`
        : `Gemini request failed (${reason}). What I can tell you from your data:\n- ${lines.join("\n- ")}`,
      grounded: false,
    };
  }
}

export async function awardPoints(userId: string, points: number, reason: string) {
  await pool.query(`INSERT INTO rewards_points (user_id, points, reason) VALUES ($1,$2,$3)`, [userId, points, reason]);
}

const LOW_BALANCE_THRESHOLD = 10000;

// Fires low-balance + budget-milestone alerts after an outflow.
// Deduped: same title unread in last 24h → skip. Respects user prefs.
export async function moneyAlerts(ownerUserId: string, walletId: string) {
  const recent = async (title: string) => {
    const r = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND title = $2 AND read_at IS NULL
       AND created_at > now() - INTERVAL '24 hours' LIMIT 1`,
      [ownerUserId, title]
    );
    return (r.rowCount ?? 0) > 0;
  };
  const bal = await pool.query(`SELECT balance FROM wallet_balances WHERE wallet_id = $1`, [walletId]);
  const balance = Number(bal.rows[0]?.balance ?? 0);
  if (balance < LOW_BALANCE_THRESHOLD) {
    const title = "Low balance alert";
    if (!(await recent(title))) {
      await createNotification(ownerUserId, "low_balance", title, `Wallet balance is ${balance} NGN (below 10000 NGN).`);
    }
  }
  const budgets = await listBudgets(ownerUserId);
  const { byCategory } = await budgetSpend(ownerUserId);
  for (const b of budgets) {
    const limit = Number(b.limit_amount);
    if (limit <= 0) continue;
    const pct = (Number(byCategory[b.category ?? ""] ?? 0) / limit) * 100;
    const milestone = pct >= 100 ? 100 : pct >= 75 ? 75 : 0;
    if (milestone) {
      const title = `${b.category} budget at ${milestone}%`;
      if (!(await recent(title))) {
        await createNotification(ownerUserId, "budget", title, `You have used ${pct.toFixed(0)}% of your ${b.category} budget.`);
      }
    }
  }
}

// Redemption: 1 pt = ₦1 cashback credited to the user's first wallet.
// Minimum 100 pts. Real ledger posting, fully local.
export async function redeemCashback(ownerUserId: string, points: number) {
  if (!Number.isInteger(points) || points < 100) throw new Error("minimum redemption is 100 points");
  const bal = await pool.query(`SELECT COALESCE(SUM(points),0) AS total FROM rewards_points WHERE user_id = $1`, [ownerUserId]);
  if (Number(bal.rows[0].total) < points) throw new Error("not enough points");
  const w = await pool.query(`SELECT id FROM wallets WHERE owner_user_id = $1 ORDER BY created_at LIMIT 1`, [ownerUserId]);
  if (!w.rowCount) throw new Error("no wallet found");
  const equity = "00000000-0000-0000-0000-000000000000";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO rewards_points (user_id, points, reason) VALUES ($1,$2,'redemption')`, [ownerUserId, -points]);
    const entry = (
      await client.query(
        `INSERT INTO journal_entries (memo, reference_type, reference_id, created_by)
         VALUES ('points cashback','adjustment',$1,$2) RETURNING id`,
        [`cashback:${points}`, ownerUserId]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO journal_lines (entry_id, wallet_id, debit, credit) VALUES ($1,$2,0,$3), ($1,$4,$3,0)`,
      [entry.id, w.rows[0].id, points, equity]
    );
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'goal',$2,$3)`,
      [ownerUserId, "Cashback redeemed", `${points} pts → ${points} NGN in your wallet`]
    );
    await client.query("COMMIT");
    return { redeemed: points, cashback: points };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Simple success metrics (PRD Sec.30): counts and sums straight from the tables.
export async function platformMetrics() {
  const q = (sql: string) => pool.query(sql).then((r) => r.rows[0]);
  const [users, wallets, tx, budgets, goals, points, biz] = await Promise.all([
    q(`SELECT count(*) AS n FROM "user"`),
    q(`SELECT count(*) AS n FROM wallets`),
    q(`SELECT count(*) AS n, COALESCE(SUM(CASE WHEN status='completed' THEN amount ELSE 0 END),0) AS volume,
       COALESCE(100.0*SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)/NULLIF(count(*),0),0) AS success_rate FROM transfers`),
    q(`SELECT count(*) AS n FROM budgets`),
    q(`SELECT count(*) AS n FROM savings_goals`),
    q(`SELECT COALESCE(SUM(points),0) AS total FROM rewards_points`),
    q(`SELECT count(*) AS n FROM businesses`),
  ]);
  return {
    users: Number(users.n),
    wallets: Number(wallets.n),
    transfers: Number(tx.n),
    transferVolume: tx.volume,
    transferSuccessRate: Number(tx.success_rate).toFixed(1) + "%",
    budgets: Number(budgets.n),
    savingsGoals: Number(goals.n),
    pointsAwarded: Number(points.total),
    businesses: Number(biz.n),
  };
}

export async function goalMembers(goalId: string) {
  const r = await pool.query(
    `SELECT COALESCE(u.name, s.contributor_user_id) AS who, SUM(s.amount) AS total
     FROM savings_contributions s LEFT JOIN "user" u ON u.id = s.contributor_user_id
     WHERE s.goal_id = $1 GROUP BY COALESCE(u.name, s.contributor_user_id) ORDER BY total DESC`,
    [goalId]
  );
  return r.rows;
}

export async function getProfile(userId: string) {
  const u = await pool.query(`SELECT id, name, email, "emailVerified" FROM "user" WHERE id = $1`, [userId]);
  if (!u.rowCount) throw new Error("user not found");
  const w = await pool.query(`SELECT id, currency FROM wallets WHERE owner_user_id = $1`, [userId]);
  return { ...u.rows[0], wallets: w.rows };
}

// Funding (Add Money): external cash/card inflow posts credit to wallet,
// debit to the system equity wallet. Card = recorded only (no processor
// attached locally; live cards need a licensed payments partner).
export async function fundWallet(walletId: string, amount: string, method: string, createdBy: string | null) {
  if (!["cash", "card"].includes(method)) throw new Error("method must be cash or card");
  if (Number(amount) <= 0) throw new Error("amount must be > 0");
  const w = await pool.query(`SELECT id FROM wallets WHERE id = $1`, [walletId]);
  if (!w.rowCount) throw new Error("wallet not found");
  const equity = "00000000-0000-0000-0000-000000000000";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entry = (
      await client.query(
        `INSERT INTO journal_entries (memo, reference_type, reference_id, created_by)
         VALUES ($1, 'bank', $2, $3) RETURNING id`,
        [`${method} funding`, `${method}:${Date.now()}`, createdBy]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO journal_lines (entry_id, wallet_id, debit, credit)
       VALUES ($1,$2,0,$3), ($1,$4,$3,0)`,
      [entry.id, walletId, amount, equity]
    );
    await client.query("COMMIT");
    return { entryId: entry.id, walletId, amount, method, demo: method === "card" };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Bill payment (recorded locally): debit wallet, credit equity, tagged with
// biller + category. Live biller rails need a payments partner.
export async function payBill(ownerUserId: string, walletId: string, biller: string, category: string, amount: string) {
  if (!biller) throw new Error("biller is required");
  if (Number(amount) <= 0) throw new Error("amount must be > 0");
  const w = await pool.query(`SELECT id FROM wallets WHERE id = $1 AND owner_user_id = $2`, [walletId, ownerUserId]);
  if (!w.rowCount) throw new Error("wallet not found");
  const equity = "00000000-0000-0000-0000-000000000000";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entry = (
      await client.query(
        `INSERT INTO journal_entries (memo, reference_type, reference_id, created_by)
         VALUES ($1, 'bill', $2, $3) RETURNING id`,
        [`bill:${biller}`, `${biller}:${Date.now()}`, ownerUserId]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO journal_lines (entry_id, wallet_id, debit, credit)
       VALUES ($1,$2,$3,0), ($1,$4,0,$3)`,
      [entry.id, walletId, amount, equity]
    );
    const bill = (
      await client.query(
        `INSERT INTO bills (owner_user_id, biller, category, amount, entry_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ownerUserId, biller, category || "Bills", amount, entry.id]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'bill',$2,$3)`,
      [ownerUserId, `Paid ${biller}`, `${amount} recorded under ${category || "Bills"}`]
    );
    await client.query("COMMIT");
    await moneyAlerts(ownerUserId, walletId).catch(() => {});
    return { id: bill.id, biller, amount };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listBills(ownerUserId: string) {
  const r = await pool.query(
    `SELECT id, biller, category, amount, status, created_at FROM bills
     WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [ownerUserId]
  );
  return r.rows;
}

// Unified activity: transfers + bills + airtime/data + funding, newest first.
export async function listActivity(ownerUserId: string) {
  const [t, b, a, f] = await Promise.all([
    pool.query(
      `SELECT t.id, 'transfer' AS kind, ('Transfer ' || LEFT(t.id::text,8)) AS label,
         t.amount, t.status, t.created_at FROM transfers t
       JOIN wallets w ON w.id = t.from_wallet_id WHERE w.owner_user_id = $1`,
      [ownerUserId]
    ),
    pool.query(
      `SELECT id, 'bill' AS kind, ('Bill: ' || biller) AS label, amount, status, created_at
       FROM bills WHERE owner_user_id = $1`,
      [ownerUserId]
    ),
    pool.query(
      `SELECT id, kind, (kind || ': ' || network || ' ' || phone) AS label, amount, status, created_at
       FROM airtime_purchases WHERE owner_user_id = $1`,
      [ownerUserId]
    ),
    pool.query(
      `SELECT e.id, 'funding' AS kind, e.memo AS label,
         (SELECT SUM(credit) FROM journal_lines l WHERE l.entry_id = e.id
          AND l.wallet_id IN (SELECT id FROM wallets WHERE owner_user_id = $1)) AS amount,
         'completed' AS status, e.created_at
       FROM journal_entries e WHERE e.reference_type IN ('bank','adjustment')
       AND EXISTS (SELECT 1 FROM journal_lines l JOIN wallets w ON w.id = l.wallet_id
                   WHERE l.entry_id = e.id AND w.owner_user_id = $1)`,
      [ownerUserId]
    ),
  ]);
  const rows = [...t.rows, ...b.rows, ...a.rows, ...f.rows.filter((r) => r.amount !== null)];
  rows.sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
  return rows.slice(0, 100);
}

// Airtime & data (recorded locally): debit wallet, credit equity.
// Live fulfillment needs a telco aggregator partner.
export async function buyAirtime(
  ownerUserId: string, walletId: string, kind: string, network: string, phone: string, amount: string
) {
  if (!["airtime", "data"].includes(kind)) throw new Error("kind must be airtime or data");
  if (!network || !phone) throw new Error("network and phone are required");
  if (Number(amount) <= 0) throw new Error("amount must be > 0");
  if (!/^[\d+]{7,15}$/.test(phone)) throw new Error("invalid phone number");
  const w = await pool.query(`SELECT id FROM wallets WHERE id = $1 AND owner_user_id = $2`, [walletId, ownerUserId]);
  if (!w.rowCount) throw new Error("wallet not found");
  const equity = "00000000-0000-0000-0000-000000000000";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entry = (
      await client.query(
        `INSERT INTO journal_entries (memo, reference_type, reference_id, created_by)
         VALUES ($1, 'bill', $2, $3) RETURNING id`,
        [`${kind}:${network}:${phone}`, `${kind}:${Date.now()}`, ownerUserId]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO journal_lines (entry_id, wallet_id, debit, credit)
       VALUES ($1,$2,$3,0), ($1,$4,0,$3)`,
      [entry.id, walletId, amount, equity]
    );
    const p = (
      await client.query(
        `INSERT INTO airtime_purchases (owner_user_id, kind, network, phone, amount, entry_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ownerUserId, kind, network, phone, amount, entry.id]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'bill',$2,$3)`,
      [ownerUserId, `${kind} purchase`, `${network} ${phone} — ${amount}`]
    );
    await client.query("COMMIT");
    await moneyAlerts(ownerUserId, walletId).catch(() => {});
    return { id: p.id, kind, network, phone, amount, demo: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listAirtime(ownerUserId: string) {
  const r = await pool.query(
    `SELECT id, kind, network, phone, amount, status, created_at FROM airtime_purchases
     WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [ownerUserId]
  );
  return r.rows;
}

// ---- Extraordinary features: esusu, family wallets, autopilot, merchant ----

// Esusu: members contribute a fixed amount per round into a pot wallet;
// when everyone has paid the round, advance() pays the whole pot to the
// next member in rotation and opens the next round. Ledger-enforced.
// Smart categorize: receipt photo (Gemini vision) or typed/voice text.
export async function smartCategorize(input: { text?: string; imageBase64?: string }) {
  const { geminiConfigured } = await import("./ai.js");
  const text = (input.text ?? "").toLowerCase();
  const ruleHit = ((): string | null => {
    const pairs: [string, string][] = [
      ["fuel", "Transport"], ["transport", "Transport"], ["uber", "Transport"],
      ["food", "Food"], ["shoprite", "Food"], ["restaurant", "Food"],
      ["netflix", "Bills"], ["dstv", "Bills"], ["electricity", "Bills"],
      ["mtn", "Airtime"], ["airtel", "Airtime"], ["glo", "Airtime"], ["data", "Data"],
      ["school", "Education"], ["rent", "Housing"], ["hospital", "Health"],
    ];
    for (const [kw, cat] of pairs) if (text.includes(kw)) return cat;
    return null;
  })();
  if (!geminiConfigured()) {
    return { category: ruleHit ?? "General", amount: null as string | null, merchant: null as string | null, engine: "rules" };
  }
  try {
    const key = process.env.GEMINI_API_KEY!;
    const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
    const parts: ({ text: string } | { inline_data: { mime_type: string; data: string } })[] = [];
    if (input.text) parts.push({ text: `Categorize this expense into one of: Transport, Food, Bills, Airtime, Data, Education, Housing, Health, Entertainment, Shopping, General. Reply ONLY JSON {"category","amount","merchant"} with amount as a plain number: ${input.text.slice(0, 500)}` });
    if (input.imageBase64) {
      parts.push({ text: `Read this receipt. Reply ONLY JSON {"category","amount","merchant"} with amount as a plain number.` });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: input.imageBase64.slice(0, 4_000_000) } });
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "You are an expense parser. Reply with ONLY a JSON object, no other text." }] },
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}";
    const m = out.match(/\{[\s\S]*\}/);
    try {
      const parsed = JSON.parse(m ? m[0] : "{}") as { category?: string; amount?: string; merchant?: string };
      return { category: parsed.category ?? ruleHit ?? "General", amount: parsed.amount ?? null, merchant: parsed.merchant ?? null, engine: "gemini" };
    } catch {
      return { category: ruleHit ?? "General", amount: null as string | null, merchant: null as string | null, engine: "rules-fallback" };
    }
  } catch {
    return { category: ruleHit ?? "General", amount: null as string | null, merchant: null as string | null, engine: "rules-fallback" };
  }
}

// 30-day cash forecast from recurring bills + average daily outflow vs balance.
export async function cashForecast(ownerUserId: string) {
  const w = await pool.query(`SELECT id FROM wallets WHERE owner_user_id = $1 AND business_id IS NULL ORDER BY created_at LIMIT 1`, [ownerUserId]);
  if (!w.rowCount) return { runwayDays: 0, shortfallDate: null, note: "no wallet" };
  const bal = await pool.query(`SELECT COALESCE(SUM(credit - debit),0) AS b FROM journal_lines WHERE wallet_id = $1`, [w.rows[0].id]);
  const out30 = await pool.query(
    `SELECT COALESCE(SUM(t.amount),0) AS s FROM transfers t WHERE t.from_wallet_id = $1 AND t.status = 'completed'
     AND t.created_at > now() - INTERVAL '30 days'`, [w.rows[0].id]
  );
  const billsAvg = await pool.query(`SELECT COALESCE(AVG(amount),0) AS a, count(*) AS n FROM bills WHERE owner_user_id = $1`, [ownerUserId]);
  const daily = Number(out30.rows[0].s) / 30 + Number(billsAvg.rows[0].a) / 30;
  const balance = Number(bal.rows[0].b);
  const runway = daily > 0 ? Math.floor(balance / daily) : 999;
  const shortfall = runway < 30 ? new Date(Date.now() + runway * 864e5).toISOString().slice(0, 10) : null;
  return {
    balance, dailyBurn: Math.round(daily), recurringBills: Number(billsAvg.rows[0].n),
    runwayDays: runway, shortfallDate: shortfall,
    message: shortfall
      ? `At current spending you run dry around ${shortfall}. Cut ~${Math.round((30 - runway) * daily / 30)} NGN/day to stretch to month-end.`
      : "Spending pace is sustainable for the next 30 days.",
  };
}

// Esusu: members contribute a fixed amount per round into a pot wallet;
// when everyone has paid the round, advance() pays the whole pot to the
// next member in rotation and opens the next round. Ledger-enforced.
export async function createCircle(ownerUserId: string, name: string, amount: string) {
  if (!name) throw new Error("name is required");
  if (Number(amount) <= 0) throw new Error("amount must be > 0");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const w = (await client.query(`INSERT INTO wallets (owner_user_id) VALUES ($1) RETURNING id`, [ownerUserId])).rows[0];
    const c = (
      await client.query(`INSERT INTO esusu_circles (owner_user_id, name, amount, pot_wallet_id) VALUES ($1,$2,$3,$4) RETURNING id`,
        [ownerUserId, name, amount, w.id])
    ).rows[0];
    await client.query(`INSERT INTO esusu_members (circle_id, user_id, display_name, payout_order) VALUES ($1,$2,$3,1)`,
      [c.id, ownerUserId, "Organizer"]);
    await client.query("COMMIT");
    return { id: c.id, name, potWalletId: w.id };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function joinCircle(circleId: string, userId: string, displayName: string) {
  const n = await pool.query(`SELECT COALESCE(MAX(payout_order),0)+1 AS o FROM esusu_members WHERE circle_id = $1`, [circleId]);
  await pool.query(`INSERT INTO esusu_members (circle_id, user_id, display_name, payout_order) VALUES ($1,$2,$3,$4)
    ON CONFLICT DO NOTHING`, [circleId, userId, displayName || "Member", n.rows[0].o]);
  return { circleId, userId };
}

export async function circleContribute(circleId: string, userId: string, fromWalletId: string) {
  const c = await pool.query(`SELECT * FROM esusu_circles WHERE id = $1 AND status = 'open'`, [circleId]);
  if (!c.rowCount) throw new Error("circle not found or complete");
  const m = await pool.query(`SELECT * FROM esusu_members WHERE circle_id = $1 AND user_id = $2`, [circleId, userId]);
  if (!m.rowCount) throw new Error("not a member");
  if (m.rows[0].paid_rounds >= c.rows[0].current_round) throw new Error("already paid this round");
  const { postTransfer } = await import("./ledger.js");
  await postTransfer({
    idempotencyKey: `esusu-${circleId}-${c.rows[0].current_round}-${userId}`,
    fromWalletId, toWalletId: c.rows[0].pot_wallet_id, amount: String(c.rows[0].amount), createdBy: userId,
  });
  await pool.query(`UPDATE esusu_members SET paid_rounds = paid_rounds + 1 WHERE circle_id = $1 AND user_id = $2`, [circleId, userId]);
  return { round: c.rows[0].current_round };
}

export async function circleAdvance(circleId: string) {
  const c = await pool.query(`SELECT * FROM esusu_circles WHERE id = $1 AND status = 'open'`, [circleId]);
  if (!c.rowCount) throw new Error("circle not found or complete");
  const circle = c.rows[0];
  const members = (await pool.query(`SELECT * FROM esusu_members WHERE circle_id = $1 ORDER BY payout_order`, [circleId])).rows;
  if (members.some((m) => m.paid_rounds < circle.current_round)) throw new Error("waiting on contributions");
  const winner = members[(circle.current_round - 1) % members.length];
  const pot = Number(circle.amount) * members.length;
  const { postTransfer } = await import("./ledger.js");
  const w = await pool.query(`SELECT id FROM wallets WHERE owner_user_id = $1 ORDER BY created_at LIMIT 1`, [winner.user_id]);
  if (!w.rowCount) throw new Error("winner has no wallet");
  await postTransfer({
    idempotencyKey: `esusu-payout-${circleId}-${circle.current_round}`,
    fromWalletId: circle.pot_wallet_id, toWalletId: w.rows[0].id, amount: String(pot), createdBy: winner.user_id,
  });
  await pool.query(`UPDATE esusu_circles SET current_round = current_round + 1 WHERE id = $1`, [circleId]);
  return { round: circle.current_round, winner: winner.display_name, payout: pot };
}

export async function listCircles(ownerUserId: string) {
  const r = await pool.query(
    `SELECT c.*, (SELECT count(*) FROM esusu_members m WHERE m.circle_id = c.id) AS members FROM esusu_circles c
     WHERE c.owner_user_id = $1 OR EXISTS (SELECT 1 FROM esusu_members m WHERE m.circle_id = c.id AND m.user_id = $1)
     ORDER BY c.created_at DESC`,
    [ownerUserId]
  );
  return r.rows;
}

// Family wallets: child wallet + daily spend cap, enforced on every send.
export async function createFamilyWallet(ownerUserId: string, label: string, allowance: string, spendCap: string | null) {
  if (!label) throw new Error("label is required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const w = (await client.query(`INSERT INTO wallets (owner_user_id) VALUES ($1) RETURNING id`, [ownerUserId])).rows[0];
    const f = (
      await client.query(`INSERT INTO family_wallets (owner_user_id, wallet_id, label, allowance, spend_cap) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ownerUserId, w.id, label, allowance || "0", spendCap || null])
    ).rows[0];
    await client.query("COMMIT");
    return { id: f.id, walletId: w.id, label };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listFamilyWallets(ownerUserId: string) {
  const r = await pool.query(
    `SELECT f.*, COALESCE((SELECT SUM(credit - debit) FROM journal_lines l WHERE l.wallet_id = f.wallet_id),0) AS balance
     FROM family_wallets f WHERE f.owner_user_id = $1`, [ownerUserId]
  );
  return r.rows;
}

export async function checkSpendCap(fromWalletId: string, amount: string) {
  const f = await pool.query(`SELECT spend_cap FROM family_wallets WHERE wallet_id = $1`, [fromWalletId]);
  if (!f.rowCount || f.rows[0].spend_cap === null) return;
  const day = await pool.query(
    `SELECT COALESCE(SUM(t.amount),0) AS s FROM transfers t
     WHERE t.from_wallet_id = $1 AND t.status = 'completed' AND t.created_at > now() - INTERVAL '24 hours'`,
    [fromWalletId]
  );
  if (Number(day.rows[0].s) + Number(amount) > Number(f.rows[0].spend_cap)) {
    throw new Error(`daily cap ${f.rows[0].spend_cap} exceeded`);
  }
}

// Autopilot: sweep everything above min_balance into a goal. Run on demand
// (and the dashboard runs it when opened on Sundays).
export async function createAutopilot(ownerUserId: string, goalId: string, minBalance: string) {
  const r = await pool.query(
    `INSERT INTO autopilot_rules (owner_user_id, goal_id, min_balance) VALUES ($1,$2,$3) RETURNING id`,
    [ownerUserId, goalId, minBalance || "0"]
  );
  return { id: r.rows[0].id };
}

export async function listAutopilot(ownerUserId: string) {
  const r = await pool.query(`SELECT * FROM autopilot_rules WHERE owner_user_id = $1`, [ownerUserId]);
  return r.rows;
}

export async function runAutopilot(ownerUserId: string) {
  const rules = await pool.query(`SELECT * FROM autopilot_rules WHERE owner_user_id = $1`, [ownerUserId]);
  const out = [];
  for (const rule of rules.rows) {
    const w = await pool.query(`SELECT id FROM wallets WHERE owner_user_id = $1 AND business_id IS NULL ORDER BY created_at LIMIT 1`, [ownerUserId]);
    if (!w.rowCount) continue;
    const bal = await pool.query(`SELECT COALESCE(SUM(credit - debit),0) AS b FROM journal_lines WHERE wallet_id = $1`, [w.rows[0].id]);
    const excess = Number(bal.rows[0].b) - Number(rule.min_balance);
    if (excess > 0) {
      const { contributeToGoal } = await import("./queries.js");
      await contributeToGoal(rule.goal_id, String(Math.floor(excess)));
      await pool.query(`UPDATE autopilot_rules SET last_run = now() WHERE id = $1`, [rule.id]);
      out.push({ rule: rule.id, swept: Math.floor(excess) });
    }
  }
  return out;
}

// Merchant payment links: anyone signed in can pay them from their wallet.
export async function createPaymentLink(ownerUserId: string, label: string, amount: string | null) {
  if (!label) throw new Error("label is required");
  const code = "pay_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const r = await pool.query(`INSERT INTO payment_links (owner_user_id, code, label, amount) VALUES ($1,$2,$3,$4) RETURNING code`,
    [ownerUserId, code, label, amount || null]);
  return { code: r.rows[0].code };
}

export async function getPaymentLink(code: string) {
  const r = await pool.query(`SELECT code, label, amount, status FROM payment_links WHERE code = $1`, [code]);
  if (!r.rowCount) throw new Error("link not found");
  return r.rows[0];
}

export async function payPaymentLink(code: string, payerUserId: string, fromWalletId: string) {
  const link = await getPaymentLink(code);
  if (link.status !== "open") throw new Error("link closed");
  if (!link.amount) throw new Error("open-amount links need checkout (coming next)");
  const w = await pool.query(`SELECT id FROM wallets WHERE owner_user_id = $1 AND business_id IS NULL ORDER BY created_at LIMIT 1`,
    [(await pool.query(`SELECT owner_user_id FROM payment_links WHERE code = $1`, [code])).rows[0].owner_user_id]);
  const { postTransfer } = await import("./ledger.js");
  return postTransfer({
    idempotencyKey: `link-${code}-${payerUserId}-${Date.now()}`,
    fromWalletId, toWalletId: w.rows[0].id, amount: String(link.amount), createdBy: payerUserId,
  });
}

export async function listPaymentLinks(ownerUserId: string) {
  const r = await pool.query(`SELECT code, label, amount, status FROM payment_links WHERE owner_user_id = $1 ORDER BY created_at DESC`, [ownerUserId]);
  return r.rows;
}

// FINBIQ Score 300–850 from behavior: savings rate, budget adherence,
// bill reliability, tenure. Grows only from real activity.
export async function finbiqScore(ownerUserId: string) {
  const s = await financeSummary(ownerUserId);
  const goals = await listSavingsGoals(ownerUserId);
  const budgets = await listBudgets(ownerUserId);
  const { byCategory } = await budgetSpend(ownerUserId);
  const bills = await pool.query(`SELECT count(*) AS n FROM bills WHERE owner_user_id = $1 AND status = 'completed'`, [ownerUserId]);
  const tenure = await pool.query(`SELECT EXTRACT(DAY FROM now() - MIN("createdAt")) AS d FROM "user" WHERE id = $1`, [ownerUserId]);
  let score = 300;
  const saved = Number(s.saved), target = Number(s.savingsTarget);
  if (target > 0) score += Math.min(150, (saved / target) * 150);
  let adhered = 0;
  for (const b of budgets) {
    if (Number(byCategory[b.category ?? ""] ?? 0) <= Number(b.limit_amount)) adhered++;
  }
  if (budgets.length) score += (adhered / budgets.length) * 120;
  score += Math.min(130, Number(bills.rows[0].n) * 15);
  score += Math.min(100, Number(tenure.rows[0].d ?? 0));
  score += Math.min(50, Number(s.inflow) > 0 ? 50 : 0);
  return { score: Math.round(Math.min(850, score)), factors: { budgets: budgets.length, adhered, billsPaid: Number(bills.rows[0].n), goals: goals.length } };
}

export async function createBusiness(ownerUserId: string, name: string) {
  if (!name) throw new Error("name is required");
  const b = await pool.query(`INSERT INTO businesses (owner_user_id, name) VALUES ($1,$2) RETURNING id`, [ownerUserId, name]);
  await pool.query(`INSERT INTO business_members (business_id, user_id, role) VALUES ($1,$2,'owner')`, [b.rows[0].id, ownerUserId]);
  return { id: b.rows[0].id, name };
}

export async function listBusinesses(ownerUserId: string) {
  const r = await pool.query(
    `SELECT b.id, b.name FROM businesses b JOIN business_members m ON m.business_id = b.id WHERE m.user_id = $1`,
    [ownerUserId]
  );
  return r.rows;
}

export async function createBusinessWallet(ownerUserId: string, businessId: string, currency = "NGN") {
  const m = await pool.query(`SELECT 1 FROM business_members WHERE business_id = $1 AND user_id = $2`, [businessId, ownerUserId]);
  if (!m.rowCount) throw new Error("not a member of this business");
  const w = await pool.query(`INSERT INTO wallets (owner_user_id, business_id, currency) VALUES ($1,$2,$3) RETURNING id`, [
    ownerUserId,
    businessId,
    currency,
  ]);
  return { id: w.rows[0].id, businessId };
}

export async function businessSummary(businessId: string) {
  const bal = await pool.query(
    `SELECT COALESCE(SUM(l.credit - l.debit),0) AS balance FROM wallets w
     LEFT JOIN journal_lines l ON l.wallet_id = w.id WHERE w.business_id = $1`,
    [businessId]
  );
  const budgets = await pool.query(`SELECT count(*) AS n FROM budgets WHERE business_id = $1`, [businessId]);
  const pending = await pool.query(
    `SELECT t.id, t.amount, t.status, t.created_at FROM transfers t
     JOIN wallets w ON w.id = t.from_wallet_id
     WHERE w.business_id = $1 AND t.status IN ('pending','processing') ORDER BY t.created_at DESC LIMIT 20`,
    [businessId]
  );
  return { balance: bal.rows[0].balance, budgets: Number(budgets.rows[0].n), upcoming: pending.rows };
}

// ---- Deferred-list fix: read-only previews (estimates/education, no live products) ----

export async function financingEstimate(ownerUserId: string) {
  const s = await financeSummary(ownerUserId);
  const monthlyInflow = Number(s.inflow);
  // Conservative local rule: up to 3x avg monthly inflow, capped; ESTIMATE ONLY.
  const maxEligible = Math.min(monthlyInflow * 3, 3000000);
  return {
    estimate: true,
    maxEligible,
    currency: "NGN",
    basis: { monthlyInflow, monthlyOutflow: Number(s.outflow) },
    disclaimer:
      "Estimate only — not an offer. Live financing requires a lending license/partner, KYC/AML and explicit user authorization (PRD Sec.16-17).",
  };
}

const INVESTMENT_CATALOG = [
  { id: "tbills", name: "Treasury Bills (education)", risk: "low", minAmount: 100000, note: "Short-term government securities." },
  { id: "mmf", name: "Money Market Fund (education)", risk: "low-medium", minAmount: 5000, note: "Pooled low-risk instruments." },
  { id: "bonds", name: "FGN Bonds (education)", risk: "medium", minAmount: 50000, note: "Longer-term government debt." },
  { id: "equities", name: "Equities (education)", risk: "high", minAmount: 10000, note: "Stock market exposure; capital at risk." },
];

export async function investmentCatalog() {
  return {
    educationOnly: true,
    items: INVESTMENT_CATALOG,
    disclaimer:
      "Education only — execution and holdings require a licensed investment provider (PRD Sec.18).",
  };
}

// ---- Paystack card funding ----
// A payment row is created BEFORE Paystack is called (status 'initialized'),
// so retries with the same idempotency key reuse the same reference and
// never double-charge. The ledger is only posted after Paystack confirms
// the exact amount (completePayment).

export async function createPayment(
  ownerUserId: string,
  walletId: string,
  amount: string,
  idempotencyKey: string
) {
  const reference =
    "finbiq_" + Date.now().toString(36) + "_" + crypto.randomUUID().slice(0, 8);
  try {
    const r = await pool.query(
      `INSERT INTO payments (owner_user_id, wallet_id, reference, idempotency_key, amount, currency, status)
       VALUES ($1,$2,$3,$4,$5,'NGN','initialized') RETURNING *`,
      [ownerUserId, walletId, reference, idempotencyKey, amount]
    );
    return r.rows[0];
  } catch (e) {
    // Unique violation on idempotency_key -> client retry: reuse the row.
    if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
      return await getPaymentByIdempotency(idempotencyKey);
    }
    throw e;
  }
}

export async function getPaymentByReference(reference: string) {
  const r = await pool.query(`SELECT * FROM payments WHERE reference = $1`, [reference]);
  return r.rows[0] ?? null;
}

export async function getPaymentByIdempotency(key: string) {
  const r = await pool.query(`SELECT * FROM payments WHERE idempotency_key = $1`, [key]);
  return r.rows[0];
}

// Complete a funded payment exactly once: marks success and posts the
// double-entry credit (user wallet) / debit (equity) in one transaction.
// Called from BOTH /v1/fund/verify and the Paystack webhook — the row lock
// + status check makes the second call a no-op (deduped).
export async function completePayment(reference: string, providerRef: string | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT * FROM payments WHERE reference = $1 FOR UPDATE`,
      [reference]
    );
    if (!locked.rowCount) {
      await client.query("ROLLBACK");
      throw new Error("payment not found");
    }
    const p = locked.rows[0];
    if (p.status === "success") {
      await client.query("COMMIT");
      return { deduped: true, payment: p, entryId: null };
    }
    const entry = (
      await client.query(
        `INSERT INTO journal_entries (memo, reference_type, reference_id, created_by)
         VALUES ($1,'paystack',$2,$3) RETURNING id`,
        [`paystack funding ${reference}`, reference, p.owner_user_id]
      )
    ).rows[0];
    // credit user wallet, debit equity: SUM(debit)=SUM(credit)=amount
    await client.query(
      `INSERT INTO journal_lines (entry_id, wallet_id, debit, credit)
       VALUES ($1,$2,0,$3), ($1,$4,$3,0)`,
      [entry.id, p.wallet_id, p.amount, EQUITY_WALLET_ID]
    );
    const upd = (
      await client.query(
        `UPDATE payments SET status='success', paid_at=now(), provider_ref=$2,
           metadata = metadata || $3::jsonb WHERE id=$1 RETURNING *`,
        [p.id, providerRef, JSON.stringify({ completedVia: "api" })]
      )
    ).rows[0];
    await client.query("COMMIT");
    return { deduped: false, payment: upd, entryId: entry.id };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function markPaymentFailed(reference: string, reason: string) {
  await pool.query(
    `UPDATE payments SET status='failed', metadata = metadata || $2::jsonb
     WHERE reference=$1 AND status='initialized'`,
    [reference, JSON.stringify({ failure: reason })]
  );
}

export async function listPayments(ownerUserId: string) {
  const r = await pool.query(
    `SELECT id, reference, amount, currency, status, provider_ref, paid_at, created_at
     FROM payments WHERE owner_user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [ownerUserId]
  );
  return r.rows;
}
