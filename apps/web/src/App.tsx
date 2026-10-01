import { useEffect, useState } from "react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const OWNER = "demo-user-1";
const WALLET = "11111111-1111-1111-1111-111111111111";

type Budget = { id: string; limit_amount: string; period: string; category: string | null };
type Goal = { id: string; name: string; target_amount: string; saved: string };

const fmt = (n: string | number) =>
  "\u20A6" + Number(n).toLocaleString("en-NG", { maximumFractionDigits: 0 });

export default function App() {
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [health, setHealth] = useState("checking\u2026");
  const [balance, setBalance] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "api: ok" : "api: bad response"))
      .catch(() => setHealth("api: unreachable (start services/api)"));
    fetch(`${API}/v1/wallets/${WALLET}/balance`)
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
  }, []);

  const food = budgets.find((b) => b.category === "Food");

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
              <div className="v sm">{food ? fmt(food.limit_amount) + " limit" : "no budget"}</div>
              <div className="bar warn">
                <i style={{ width: "75%" }} />
              </div>
              <div className="d warn-t">75% used (design-preview figure; live spend in Step 9)</div>
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
                </div>
              );
            })}
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
              <div className="d">supplier + payroll queues land in Step 9</div>
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
