import { useCallback, useEffect, useState } from "react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const OWNER = "demo-user-1";
const WALLET_A = "11111111-1111-1111-1111-111111111111";
const WALLET_B = "22222222-2222-2222-2222-222222222222";

type Budget = { id: string; limit_amount: string; period: string; category: string | null };
type Goal = { id: string; name: string; target_amount: string; saved: string };
type Notice = { id: string; type: string; title: string; body: string; created_at: string };

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
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "api: ok" : "api: bad response"))
      .catch(() => setHealth("api: unreachable (start services/api)"));
    fetch(`${API}/v1/wallets/${WALLET_A}/balance`)
      .then((r) => r.json())
      .then((j) => setBalance(j.balance))
      .catch(() => setBalance(null));
    fetch(`${API}/v1/budgets?owner=${OWNER}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setBudgets(j))
      .catch(() => {});
    fetch(`${API}/v1/savings/goals?owner=${OWNER}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setGoals(j))
      .catch(() => {});
    fetch(`${API}/v1/budgets/spend?owner=${OWNER}`)
      .then((r) => r.json())
      .then((j) => setSpent(j.spent ?? "0"))
      .catch(() => {});
    fetch(`${API}/v1/notifications?owner=${OWNER}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setNotices(j))
      .catch(() => {});
  }, []);

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
      <p className="muted">{health}</p>
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
                      createdBy: OWNER,
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
                      ownerUserId: OWNER,
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

          <div className="ai">
            <h3>✦ Ask FINBIQ AI</h3>
            <p>
              Dining spend is up 22%. Move ₦20,000 from Entertainment to Food to stay on track, and
              auto-save ₦15,000 weekly to hit your rent goal.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="grid">
            <div className="card">
              <small>Business Balance</small>
              <div className="v">{balance === null ? "\u2026" : fmt(balance)}</div>
              <div className="d up">demo wallet</div>
            </div>
            <div className="card">
              <small>Budgets</small>
              <div className="v sm">{budgets.length} active</div>
              <div className="d">supplier + payroll queues land in the business milestone</div>
            </div>
          </div>
          <div className="ai">
            <h3>✦ AI Business Insights</h3>
            <p>
              No business onboarded yet — business wallets, revenue tracking and cash-flow monitoring
              arrive in the business-mode milestone.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
