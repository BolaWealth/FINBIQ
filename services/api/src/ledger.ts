// FINBIQ ledger helper v0.1.0 — double-entry post with idempotency.
// Uses services/api/db/schema.sql tables: transfers, journal_entries, journal_lines.
import { pool } from "./auth.js";

type PostTransferInput = {
  idempotencyKey: string;
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  createdBy: string | null;
};

export async function postTransfer(t: PostTransferInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id, status FROM transfers WHERE idempotency_key = $1", [
      t.idempotencyKey,
    ]);
    if (existing.rowCount) return { deduped: true, ...existing.rows[0] };

    if (t.fromWalletId === t.toWalletId) throw new Error("fromWalletId must differ from toWalletId");
    if (Number(t.amount) <= 0) throw new Error("amount must be > 0");

    const transfer = (
      await client.query(
        `INSERT INTO transfers (idempotency_key, from_wallet_id, to_wallet_id, amount, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [t.idempotencyKey, t.fromWalletId, t.toWalletId, t.amount, t.createdBy]
      )
    ).rows[0];

    const entry = (
      await client.query(
        `INSERT INTO journal_entries (memo, reference_type, reference_id, created_by)
         VALUES ('transfer', 'transfer', $1, $2) RETURNING id`,
        [transfer.id, t.createdBy]
      )
    ).rows[0];

    // debit sender, credit receiver: SUM(debit)=SUM(credit)=amount
    await client.query(
      `INSERT INTO journal_lines (entry_id, wallet_id, debit, credit)
       VALUES ($1,$2,$3,0), ($1,$4,0,$3)`,
      [entry.id, t.fromWalletId, t.amount, t.toWalletId]
    );

    await client.query("UPDATE transfers SET status='completed', entry_id=$1 WHERE id=$2", [entry.id, transfer.id]);
    await client.query("COMMIT");
    return { deduped: false, id: transfer.id, status: "completed", entryId: entry.id };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
