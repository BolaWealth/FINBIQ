import { useCallback, useEffect, useState } from "react";
import "./styles.css";
import AuthPanel from "./AuthPanel";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const OWNER = "demo-user-1";
const WALLET_A = "11111111-1111-1111-1111-111111111111";
const WALLET_B = "22222222-2222-2222-2222-222222222222";

type Budget = { id: string; limit_amount: string; period: string; category: string | null };
type Goal = { id: string; name: string; target_amount: string; saved: string };
type Notice = { id: string; type: string; title: string; body: string; created_at: string };
type Transfer = { id: string; amount: string; currency: string; status: string; created_at: string };
type Summary = { totalBalance: number; inflow: string; outflow: string; saved: string; savingsTarget: string };
type Biz = { id: string; name: string };
type BizSummary = { balance: string; budgets: number; upcoming: { id: string; amount: string; status: string }[] };
type InvestItem = { id: string; name: string; risk: string; minAmount: number; note: string };

const fmt = (n: string | number) =>
  "\u20A6" + Number(n).toLocaleString("en-NG", { maximumFractionDigits: 0 });

async function post(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "request failed");
  return j;
}

export default function App() {
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [health, setHealth] = useState("checking\u2026");
  const [balance, setBalance] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [spent, setSpent] = useState("0");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [points, setPoints] = useState(0);
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [bizList, setBizList] = useState<Biz[]>([]);
  const [biz, setBiz] = useState<BizSummary | null>(null);
  const [bizId, setBizId] = useState("");
  const [estimate, setEstimate] = useState<{ maxEligible: number; disclaimer: string } | null>(null);
  const [invest, setInvest] = useState<InvestItem[]>([]);
  const [msg, setMsg] = useState("");

  const owner = uid ?? OWNER;

  const refresh = useCallback(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "api: ok" : "api: bad response"))
      .catch(() => setHealth("api: unreachable (start services/api)"));
    fetch(`${API}/v1/wallets/${WALLET_A}/balance`)
      .then((r) => r.json())
      .then((j) => setBalance(j.balance))
      .catch(() => setBalance(null));
    fetch(`${API}/v1/budgets?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setBudgets(j))
      .catch(() => {});
    fetch(`${API}/v1/savings/goals?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setGoals(j))
      .catch(() => {});
    fetch(`${API}/v1/budgets/spend?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => setSpent(j.spent ?? "0"))
      .catch(() => {});
    fetch(`${API}/v1/notifications?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setNotices(j))
      .catch(() => {});
    fetch(`${API}/v1/transfers?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setHistory(j))
      .catch(() => {});
    fetch(`${API}/v1/reports/summary?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => j.totalBalance !== undefined && setSummary(j))
      .catch(() => {});
    fetch(`${API}/v1/insights?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setAiInsights(j))
      .catch(() => {});
    fetch(`${API}/v1/rewards?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => setPoints(Number(j.total ?? 0)))
      .catch(() => {});
    fetch(`${API}/v1/profile?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => j.id && setProfile(j))
      .catch(() => setProfile(null));
    fetch(`${API}/v1/businesses?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) {
          setBizList(j);
          if (j[0] && !bizId) {
            setBizId(j[0].id);
            fetch(`${API}/v1/businesses/${j[0].id}/summary`)
              .then((r) => r.json())
              .then((s) => s.balance !== undefined && setBiz(s))
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
    fetch(`${API}/v1/financing/estimate?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => j.estimate && setEstimate(j))
      .catch(() => {});
    fetch(`${API}/v1/investments`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j.items) && setInvest(j.items))
      .catch(() => {});
  }, [owner, bizId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      setMsg("");
      await fn();
      setMsg(ok);
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "failed");
    }
  };

  const food = budgets.find((b) => b.category === "Food");
  const foodPct = food ? Math.min(100, (Number(spent) / Number(food.limit_amount)) * 100) : 0;

  return (
    <main className="page">
      <h1>FINBIQ Local</h1>
      <p className="muted">
        {health} · {profile ? `${profile.name} (${profile.email})` : ""} · 🎁 {points} pts
      </p>
      <div className="toggle">
        <button className={mode === "personal" ? "active" : ""} onClick={() => setMode("personal")}>
          Personal Mode
        </button>
        <button className={mode === "business" ? "active" : ""} onClick={() => setMode("business")}>
          Business Mode
        </button>
      </div>
      {msg && <p className="flash">{msg}</p>}

      {mode === "personal" ? (
        <>
          <div className="grid">
            <div className="card">
              <small>Available Balance</small>
              <div className="v">{balance === null ? "\u2026" : fmt(balance)}</div>
              <div className="d up">live from ledger</div>
            </div>
            <div className="card">
              <small>Budget — Food · {food?.period ?? "monthly"}</small>
              <div className="v sm">
                {food ? `${fmt(spent)} / ${fmt(food.limit_amount)}` : "no budget"}
              </div>
              <div className="bar warn">
                <i style={{ width: `${foodPct}%` }} />
              </div>
              <div className="d warn-t">{foodPct.toFixed(0)}% used · live spend</div>
            </div>
            {goals.map((g) => {
              const pct = Math.min(100, (Number(g.saved) / Number(g.target_amount)) * 100);
              return (
                <div className="card" key={g.id}>
                  <small>Goal — {g.name}</small>
                  <div className="v sm">
                    {fmt(g.saved)} / {fmt(g.target_amount)}
                  </div>
                  <div className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="d">{pct.toFixed(0)}% saved</div>
                  <form
                    className="row-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const amt = new FormData(e.currentTarget).get("amount") as string;
                      run(() => post("/v1/savings/contribute", { goalId: g.id, amount: amt }), `Saved ${fmt(amt)} to ${g.name}`);
                      e.currentTarget.reset();
                    }}
                  >
                    <input name="amount" placeholder="Amount" inputMode="decimal" required />
                    <button type="submit">Save</button>
                  </form>
                </div>
              );
            })}
          </div>

          <div className="grid2">
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const amt = f.get("amount") as string;
                run(
                  () =>
                    post("/v1/transfers", {
                      idempotencyKey: crypto.randomUUID(),
                      fromWalletId: WALLET_A,
                      toWalletId: WALLET_B,
                      amount: amt,
                      createdBy: owner,
                    }),
                  `Transferred ${fmt(amt)}`
                );
                e.currentTarget.reset();
              }}
            >
              <small>Send money (A → B)</small>
              <div className="row-form">
                <input name="amount" placeholder="Amount" inputMode="decimal" required />
                <button type="submit">Send</button>
              </div>
            </form>
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(
                  () =>
                    post("/v1/budgets", {
                      ownerUserId: owner,
                      category: (f.get("category") as string) || "Food",
                      limitAmount: f.get("limit") as string,
                    }),
                  "Budget created"
                );
                e.currentTarget.reset();
              }}
            >
              <small>New budget</small>
              <div className="row-form">
                <input name="category" placeholder="Category" defaultValue="Food" />
                <input name="limit" placeholder="Limit" inputMode="decimal" required />
                <button type="submit">Add</button>
              </div>
            </form>
          </div>

          <div className="card">
            <small>Notifications ({notices.length})</small>
            {notices.slice(0, 5).map((n) => (
              <div className="txn" key={n.id}>
                <span>{n.title}</span>
                <span className="pill">{n.type}</span>
              </div>
            ))}
          </div>

          <div className="grid2">
            <div className="card">
              <small>Report — income vs expenses</small>
              <div className="v sm">
                {summary ? `${fmt(summary.inflow)} in / ${fmt(summary.outflow)} out` : "…"}
              </div>
              <div className="d">
                {summary ? `Saved ${fmt(summary.saved)} of ${fmt(summary.savingsTarget)} target` : ""}
              </div>
            </div>
            <div className="card">
              <small>Transaction history ({history.length})</small>
              {history.slice(0, 5).map((t) => (
                <div className="txn" key={t.id}>
                  <span>{fmt(t.amount)}</span>
                  <span className="pill">{t.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai">
            <h3>✦ Ask FINBIQ AI</h3>
            {aiInsights.map((line, i) => (
              <p key={i}>• {line}</p>
            ))}
          </div>

          <div className="grid2">
            <div className="card">
              <small>Financing — estimate only</small>
              <div className="v sm">{estimate ? fmt(estimate.maxEligible) + " max" : "…"}</div>
              <div className="d">{estimate?.disclaimer ?? ""}</div>
            </div>
            <div className="card">
              <small>Investments — education only</small>
              {invest.map((it) => (
                <div className="txn" key={it.id}>
                  <span>{it.name} <span className="pill">{it.risk}</span></span>
                  <span className="d">{fmt(it.minAmount)} min</span>
                </div>
              ))}
              <div className="d">Execution needs a licensed provider (PRD Sec.18).</div>
            </div>
          </div>

          <AuthPanel onUser={setUid} />
        </>
      ) : (
        <>
          <div className="grid">
            <div className="card">
              <small>Business Balance</small>
              <div className="v">{biz ? fmt(biz.balance) : balance === null ? "…" : fmt(balance)}</div>
              <div className="d up">{biz ? "live business ledger" : "demo wallet (create a business below)"}</div>
            </div>
            <div className="card">
              <small>Business budgets</small>
              <div className="v sm">{biz ? biz.budgets : budgets.length} active</div>
              <div className="d">upcoming payments below</div>
            </div>
            <div className="card">
              <small>Upcoming payments</small>
              {(biz?.upcoming ?? []).slice(0, 5).map((t) => (
                <div className="txn" key={t.id}>
                  <span>{fmt(t.amount)}</span>
                  <span className="pill">{t.status}</span>
                </div>
              ))}
              {!biz?.upcoming?.length && <div className="d">none queued</div>}
            </div>
          </div>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name") as string;
              run(async () => {
                const b = await post("/v1/businesses", { ownerUserId: owner, name });
                await post(`/v1/businesses/${(b as { id: string }).id}/wallet`, { ownerUserId: owner });
                const s = await fetch(`${API}/v1/businesses/${(b as { id: string }).id}/summary`).then((r) => r.json());
                setBizId((b as { id: string }).id);
                setBiz(s);
              }, `Business "${name}" created with wallet`);
              e.currentTarget.reset();
            }}
          >
            <small>New business (real backend, local only)</small>
            <div className="row-form">
              <input name="name" placeholder="Business name" required />
              <button type="submit">Create</button>
            </div>
            {bizList.length > 0 && <div className="d">member of: {bizList.map((b) => b.name).join(", ")}</div>}
          </form>
          <div className="ai">
            <h3>✦ AI Business Insights</h3>
            {aiInsights.map((line, i) => (
              <p key={i}>• {line}</p>
            ))}
          </div>
          <AuthPanel onUser={setUid} />
        </>
      )}
    </main>
  );
}
