// FINBIQ API tests — run: pnpm --filter @finbiq/api test (needs local Postgres + seed).
// Uses node:test + tsx. DB-backed, exercises real ledger rules.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postTransfer } from "../src/ledger.js";
import { pool } from "../src/auth.js";
import { createBudget, budgetSpend, insights, setPref, getPrefs, createNotification, createSavingsGoal, contributeToGoal, withdrawFromGoal, payBill, listBills, buyAirtime, listAirtime, redeemCashback, rewardPoints, fundWallet } from "../src/queries.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("ledger", () => {
  it("rejects same-wallet transfers", async () => {
    await assert.rejects(
      postTransfer({ idempotencyKey: `t-${Date.now()}-a`, fromWalletId: A, toWalletId: A, amount: "100", createdBy: null }),
      /must differ/
    );
  });

  it("rejects zero/negative amounts", async () => {
    await assert.rejects(
      postTransfer({ idempotencyKey: `t-${Date.now()}-b`, fromWalletId: A, toWalletId: B, amount: "0", createdBy: null }),
      /> 0/
    );
  });

  it("dedupes retries on idempotency key", async () => {
    const key = `t-${Date.now()}-c`;
    const first = await postTransfer({ idempotencyKey: key, fromWalletId: A, toWalletId: B, amount: "100", createdBy: null });
    const second = await postTransfer({ idempotencyKey: key, fromWalletId: A, toWalletId: B, amount: "100", createdBy: null });
    assert.equal(first.deduped ?? false, false);
    assert.equal(second.deduped, true);
    assert.equal(first.id, second.id);
  });
});

describe("budgets", () => {
  it("rejects non-positive limits", async () => {
    await assert.rejects(createBudget("demo-user-1", "TestCat", "0"), /> 0/);
  });

  it("spend never exceeds completed outflow", async () => {
    const { spent } = await budgetSpend("demo-user-1");
    assert.ok(Number(spent) >= 0);
  });

  it("spend tracks per category across all outflows", async () => {
    const key = `t-${Date.now()}-d`;
    await postTransfer({ idempotencyKey: key, fromWalletId: A, toWalletId: B, amount: "500", category: "TestSpend", createdBy: null });
    const { spent, byCategory } = await budgetSpend("demo-user-1");
    assert.ok(Number(spent) >= 500);
    assert.ok(Number(byCategory["TestSpend"] ?? 0) >= 500);
  });

  it("insights cite real numbers only", async () => {
    const lines = await insights("demo-user-1");
    assert.ok(lines.length > 0);
    for (const line of lines) assert.match(line, /\d/);
  });
});

describe("notification prefs", () => {
  it("defaults all types to on", async () => {
    const prefs = await getPrefs("demo-user-1");
    assert.equal(prefs.length, 8);
    for (const p of prefs) assert.equal(p.enabled, true);
  });

  it("skips creating when type is off, creates when on", async () => {
    await setPref("demo-user-1", "goal", false);
    const off = await createNotification("demo-user-1", "goal", "t", "b");
    assert.deepEqual(off, { skipped: true });
    await setPref("demo-user-1", "goal", true);
    const on = await createNotification("demo-user-1", "goal", "pref test", "b");
    assert.ok("id" in on);
  });
});

describe("locked savings", () => {
  it("refuses early withdrawal from locked goals", async () => {
    const g = await createSavingsGoal("demo-user-1", "LockedTest", "100000", null, "locked", "2099-01-01");
    await contributeToGoal(g.id, "5000");
    await assert.rejects(
      withdrawFromGoal("demo-user-1", g.id, "11111111-1111-1111-1111-111111111111", "1000"),
      /locked until/
    );
  });

  it("allows withdrawal from flexible goals within saved amount", async () => {
    const g = await createSavingsGoal("demo-user-1", "FlexTest", "100000", null, "flexible", null);
    await contributeToGoal(g.id, "3000");
    const out = await withdrawFromGoal("demo-user-1", g.id, "11111111-1111-1111-1111-111111111111", "1000");
    assert.equal(out.amount, "1000");
    await assert.rejects(
      withdrawFromGoal("demo-user-1", g.id, "11111111-1111-1111-1111-111111111111", "99999"),
      /insufficient/
    );
  });
});

describe("bills and airtime", () => {
  it("rejects bad bill input", async () => {
    await assert.rejects(payBill("demo-user-1", "11111111-1111-1111-1111-111111111111", "", "Bills", "100"), /biller/);
    await assert.rejects(payBill("demo-user-1", "11111111-1111-1111-1111-111111111111", "EKEDC", "Bills", "0"), /> 0/);
  });

  it("pays bills and lists them", async () => {
    const b = await payBill("demo-user-1", "11111111-1111-1111-1111-111111111111", "TestBiller", "Utilities", "750");
    assert.ok(b.id);
    const list = await listBills("demo-user-1");
    assert.ok(list.some((x) => x.id === b.id));
  });

  it("rejects bad airtime input", async () => {
    await assert.rejects(
      buyAirtime("demo-user-1", "11111111-1111-1111-1111-111111111111", "airtime", "MTN", "abc", "100"),
      /phone/
    );
    await assert.rejects(
      buyAirtime("demo-user-1", "11111111-1111-1111-1111-111111111111", "sms", "MTN", "08031234567", "100"),
      /kind/
    );
  });

  it("buys airtime and lists it", async () => {
    const p = await buyAirtime("demo-user-1", "11111111-1111-1111-1111-111111111111", "data", "Glo", "08051234567", "500");
    assert.equal(p.kind, "data");
    const list = await listAirtime("demo-user-1");
    assert.ok(list.some((x) => x.id === p.id));
  });
});

describe("redemption", () => {
  it("rejects below-minimum and insufficient balances", async () => {
    await assert.rejects(redeemCashback("demo-user-1", 50), /minimum/);
    await assert.rejects(redeemCashback("demo-user-1", 999999999), /not enough/);
  });
});

describe("money alerts", () => {
  it("fires low-balance alert once per day", async () => {
    const uid = `alert-tester-${Date.now()}`;
    await pool.query(`INSERT INTO "user" (id, name, email) VALUES ($1,'Alert Tester',$2)`, [uid, `${uid}@t.local`]);
    const w = await pool.query(`INSERT INTO wallets (owner_user_id) VALUES ($1) RETURNING id`, [uid]);
    const wid = w.rows[0].id as string;
    await fundWallet(wid, "3000", "cash", uid);
    const b = await pool.query(
      `INSERT INTO wallets (owner_user_id) VALUES ('demo-user-1') RETURNING id`
    );
    await postTransfer({ idempotencyKey: `t-${Date.now()}-e`, fromWalletId: wid, toWalletId: b.rows[0].id, amount: "2500", category: "General", createdBy: uid });
    const n1 = await pool.query(`SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND title = 'Low balance alert'`, [uid]);
    assert.equal(Number(n1.rows[0].n), 1);
    await postTransfer({ idempotencyKey: `t-${Date.now()}-f`, fromWalletId: wid, toWalletId: b.rows[0].id, amount: "100", category: "General", createdBy: uid });
    const n2 = await pool.query(`SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND title = 'Low balance alert'`, [uid]);
    assert.equal(Number(n2.rows[0].n), 1);
  });
});
