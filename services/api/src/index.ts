// FINBIQ API skeleton v0.1.0 — stdlib http only (no framework yet).
// Routes: GET /health, ALL /api/auth/* (BetterAuth), POST /v1/transfers (ledger stub).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { auth } from "./auth.js";
import { postTransfer } from "./ledger.js";

const port = Number(process.env.PORT ?? 4000);

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
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

  if (req.method === "GET" && url.pathname === "/health")
    return json(res, 200, { ok: true, service: "finbiq-api", version: "0.1.0" });

  if (url.pathname.startsWith("/api/auth/")) {
    try {
      const res2 = await auth.handler(new Request(url, { method: req.method, headers: req.headers as never }));
      res.writeHead(res2.status, Object.fromEntries(res2.headers.entries()));
      return res.end(await res2.text());
    } catch (e) {
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

  return json(res, 404, { error: "not_found" });
}).listen(port, () => console.log(`finbiq-api listening on :${port}`));
