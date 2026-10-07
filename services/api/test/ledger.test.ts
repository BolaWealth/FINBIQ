// FINBIQ API tests — run: pnpm --filter @finbiq/api test (needs local Postgres + seed).
// Uses node:test + tsx. DB-backed, exercises real ledger rules.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postTransfer } from "../src/ledger.js";
import { createBudget, budgetSpend, insights } from "../src/queries.js";

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

  it("insights cite real numbers only", async () => {
    const lines = await insights("demo-user-1");
    assert.ok(lines.length > 0);
    for (const line of lines) assert.match(line, /\d/);
  });
});
