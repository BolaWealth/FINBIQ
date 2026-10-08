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
  } catch {
    const lines = await insights(ownerUserId);
    return {
      answer: `AI is offline (no Gemini key configured). What I can tell you from your data:\n- ${lines.join("\n- ")}`,
      grounded: false,
    };
  }
}

export async function awardPoints(userId: string, points: number, reason: string) {
  await pool.query(`INSERT INTO rewards_points (user_id, points, reason) VALUES ($1,$2,$3)`, [userId, points, reason]);
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

// ---- Deferred-list fix: business backend (tables already in schema.sql) ----

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
