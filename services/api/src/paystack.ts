// FINBIQ Paystack client v1.0 — server-side only.
// Env: PAYSTACK_SECRET_KEY, PAYSTACK_WEBHOOK_SECRET (never expose to the browser).
// Docs: https://paystack.com/docs/api/
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.paystack.co";

export function paystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

async function call(path: string, init?: RequestInit) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not set");
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status !== true) throw new Error(j.message ?? `paystack ${r.status}`);
  return j;
}

// POST /transaction/initialize — returns the Paystack payment page URL.
export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
}) {
  const j = await call("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
    }),
  });
  return j.data as { authorization_url: string; reference: string; access_code: string };
}

// GET /transaction/verify/:reference — confirm charge + amount server-side.
export async function verifyTransaction(reference: string) {
  const j = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
  return j.data as { id: number; reference: string; status: string; amount: number };
}

// Paystack signs the RAW webhook body with HMAC-SHA512 using the webhook
// secret, delivered in the x-paystack-signature header. Always verify before
// acting on a webhook; never trust the payload alone.
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | string[] | undefined
) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret || !signature || Array.isArray(signature)) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
