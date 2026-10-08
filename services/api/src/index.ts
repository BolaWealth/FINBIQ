// FINBIQ API skeleton v0.1.0 — stdlib http only (no framework yet).
// Routes: GET /health, ALL /api/auth/* (BetterAuth), POST /v1/transfers,
// GET /v1/wallets/:id/balance, GET /v1/budgets?owner=, GET /v1/savings/goals?owner=.
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env") });
console.log("[env] gemini:" + (process.env.GEMINI_API_KEY ? "set(len=" + process.env.GEMINI_API_KEY.length + ")" : "MISSING"));
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { auth } from "./auth.js";
import { postTransfer } from "./ledger.js";
import { getWalletBalance, listBudgets, listSavingsGoals, createBudget, budgetSpend, createSavingsGoal, contributeToGoal, listNotifications, createNotification, listTransfers, getTransfer, financeSummary, insights, rewardPoints, getProfile, createBusiness, listBusinesses, createBusinessWallet, businessSummary, financingEstimate, investmentCatalog, platformMetrics, fundWallet, payBill, listBills, listActivity, buyAirtime, listAirtime, askFinanceQuestion } from "./queries.js";

const port = Number(process.env.PORT ?? 4000);

const cors = {
  "access-control-allow-origin": process.env.WEB_URL ?? "http://localhost:5173",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", ...cors });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/health")
    return json(res, 200, { ok: true, service: "finbiq-api", version: "0.1.0" });

  if (req.method === "GET" && url.pathname === "/") {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>FINBIQ API</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#FFFFFF;color:#221C3A;padding:32px}h1{color:#5B21B6}code{background:#F5F2FF;border:1px solid #E3DDF5;padding:2px 6px;border-radius:6px}a{color:#5B21B6}li{margin:6px 0}</style>
</head><body><h1>FINBIQ API is running</h1><p>Machine-readable status: <a href="/health">/health</a></p>
<p>Visual product lives at <a href="http://localhost:5173">http://localhost:5173</a></p><ul>
<li><code>GET /health</code></li><li><code>POST /v1/transfers</code></li>
<li><code>GET /v1/transfers?owner=</code> + <code>/v1/transfers/:id</code></li>
<li><code>GET /v1/wallets/:id/balance</code></li><li><code>GET /v1/budgets?owner=</code> + <code>POST /v1/budgets</code></li>
<li><code>GET /v1/savings/goals?owner=</code> + <code>POST /v1/savings/goals</code> + <code>POST /v1/savings/contribute</code></li>
<li><code>GET /v1/reports/summary?owner=</code></li><li><code>GET /v1/insights?owner=</code></li>
<li><code>GET /v1/rewards?owner=</code></li><li><code>GET /v1/notifications?owner=</code></li>
<li><code>GET /v1/profile?owner=</code></li></ul></body></html>`;
    res.writeHead(200, { "content-type": "text/html", ...cors });
    return res.end(html);
  }

  if (url.pathname.startsWith("/api/auth/")) {
    try {
      const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await readBody(req) : undefined;
      const fwdHeaders = { ...(req.headers as Record<string, string>) };
      delete fwdHeaders["content-length"];
      const res2 = await auth.handler(
        new Request(url, {
          method: req.method,
          headers: fwdHeaders as never,
          body: rawBody,
          duplex: "half",
        } as never)
      );
      res.writeHead(res2.status, Object.fromEntries(res2.headers.entries()));
      return res.end(await res2.text());
    } catch (e) {
      console.error("[auth bridge]", e);
      return json(res, 500, { error: "auth_error" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/transfers") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await postTransfer({
        idempotencyKey: b.idempotencyKey,
        fromWalletId: b.fromWalletId,
        toWalletId: b.toWalletId,
        amount: String(b.amount ?? ""),
        createdBy: b.createdBy ?? null,
      });
      return json(res, out.deduped ? 200 : 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "transfer_failed" });
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/v1/wallets/") && url.pathname.endsWith("/balance")) {
    const id = url.pathname.split("/")[3];
    try {
      return json(res, 200, await getWalletBalance(id));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "balance_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/budgets") {
    try {
      return json(res, 200, await listBudgets(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "budgets_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/savings/goals") {
    try {
      return json(res, 200, await listSavingsGoals(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "goals_failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/budgets") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await createBudget(b.ownerUserId, b.category, String(b.limitAmount ?? ""), b.period ?? "monthly");
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "budget_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/budgets/spend") {
    try {
      return json(res, 200, await budgetSpend(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "spend_failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/savings/goals") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await createSavingsGoal(b.ownerUserId, b.name, String(b.targetAmount ?? ""), b.targetDate ?? null);
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "goal_failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/savings/contribute") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await contributeToGoal(b.goalId, String(b.amount ?? ""));
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "contribute_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/notifications") {
    try {
      return json(res, 200, await listNotifications(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "notifications_failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/notifications") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await createNotification(b.ownerUserId, b.type, b.title, b.body ?? "");
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "notify_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/transfers") {
    try {
      return json(res, 200, await listTransfers(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "history_failed" });
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/v1/transfers/")) {
    try {
      return json(res, 200, await getTransfer(url.pathname.split("/")[3]));
    } catch (e) {
      return json(res, 404, { error: e instanceof Error ? e.message : "not_found" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/reports/summary") {
    try {
      return json(res, 200, await financeSummary(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "report_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/insights") {
    try {
      return json(res, 200, await insights(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "insights_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/rewards") {
    try {
      return json(res, 200, await rewardPoints(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "rewards_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/profile") {
    try {
      return json(res, 200, await getProfile(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 404, { error: e instanceof Error ? e.message : "not_found" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/businesses") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await createBusiness(b.ownerUserId, b.name);
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "business_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/businesses") {
    try {
      return json(res, 200, await listBusinesses(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "business_failed" });
    }
  }

  if (req.method === "POST" && url.pathname.startsWith("/v1/businesses/") && url.pathname.endsWith("/wallet")) {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await createBusinessWallet(b.ownerUserId, url.pathname.split("/")[3], b.currency ?? "NGN");
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "wallet_failed" });
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/v1/businesses/") && url.pathname.endsWith("/summary")) {
    try {
      return json(res, 200, await businessSummary(url.pathname.split("/")[3]));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "summary_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/financing/estimate") {
    try {
      return json(res, 200, await financingEstimate(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "estimate_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/investments") {
    return json(res, 200, await investmentCatalog());
  }

  if (req.method === "POST" && url.pathname === "/v1/fund") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await fundWallet(b.walletId, String(b.amount ?? ""), b.method, b.createdBy ?? null);
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "fund_failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/bills/pay") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await payBill(b.ownerUserId, b.walletId, b.biller, b.category ?? "Bills", String(b.amount ?? ""));
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "bill_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/bills") {
    try {
      return json(res, 200, await listBills(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "bills_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/activity") {
    try {
      return json(res, 200, await listActivity(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "activity_failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/airtime/buy") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await buyAirtime(b.ownerUserId, b.walletId, b.kind, b.network, b.phone, String(b.amount ?? ""));
      return json(res, 201, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "airtime_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/airtime") {
    try {
      return json(res, 200, await listAirtime(url.searchParams.get("owner") ?? ""));
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "airtime_failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/ai/ask") {
    try {
      const b = JSON.parse((await readBody(req)) || "{}");
      const out = await askFinanceQuestion(b.ownerUserId, String(b.question ?? ""));
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "ask_failed" });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/metrics") {
    try {
      return json(res, 200, await platformMetrics());
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : "metrics_failed" });
    }
  }

  return json(res, 404, { error: "not_found" });
}).listen(port, () => console.log(`finbiq-api listening on :${port}`));
