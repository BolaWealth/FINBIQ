import { useCallback, useEffect, useState } from "react";
import "./styles.css";
import AuthPanel from "./AuthPanel";
import { authClient } from "./auth";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const OWNER = "demo-user-1";
const WALLET_A = "11111111-1111-1111-1111-111111111111";
const WALLET_B = "22222222-2222-2222-2222-222222222222";

type Budget = { id: string; limit_amount: string; period: string; category: string | null };
type Goal = { id: string; name: string; target_amount: string; saved: string };
type Notice = { id: string; type: string; title: string; body: string; created_at: string };
type Transfer = { id: string; amount: string; currency: string; status: string; created_at: string };
type Activity = { id: string; kind: string; label: string; amount: string; status: string; created_at: string };
type Summary = { totalBalance: number; inflow: string; outflow: string; saved: string; savingsTarget: string };
type Biz = { id: string; name: string };
type BizSummary = { balance: string; budgets: number; upcoming: { id: string; amount: string; status: string }[] };
type InvestItem = { id: string; name: string; risk: string; minAmount: number; note: string };

type Page =
  | "wallet" | "history" | "budgets" | "savings" | "bills" | "airtime"
  | "loans" | "invest" | "business" | "reports" | "account";

const PAGES: { id: Page; label: string; emoji: string; blurb: string }[] = [
  { id: "wallet", label: "Wallet", emoji: "👛", blurb: "Balance, send money, live from your ledger." },
  { id: "history", label: "Transactions", emoji: "🧾", blurb: "Every transfer with live status." },
  { id: "budgets", label: "Budgets", emoji: "📊", blurb: "Set limits, watch live spend bars." },
  { id: "savings", label: "Savings", emoji: "💰", blurb: "Goals, progress, earn FINBIQ Points." },
  { id: "bills", label: "Bills", emoji: "📃", blurb: "Pay billers, categorized, notified." },
  { id: "airtime", label: "Airtime", emoji: "📱", blurb: "Top up airtime and data instantly." },
  { id: "loans", label: "Loans", emoji: "🏦", blurb: "Affordability estimate from your activity." },
  { id: "invest", label: "Investments", emoji: "📈", blurb: "Learn the options, risks clearly labeled." },
  { id: "business", label: "Business", emoji: "🏢", blurb: "Business wallets, budgets, upcoming payments." },
  { id: "reports", label: "Reports", emoji: "📑", blurb: "Income vs expenses, insights, platform metrics." },
  { id: "account", label: "Account", emoji: "👤", blurb: "Sign in, app 2FA, password reset, profile." },
];

const fmt = (n: string | number) =>
  "\u20A6" + Number(n).toLocaleString("en-NG", { maximumFractionDigits: 0 });

async function post(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include", // send the BetterAuth session cookie
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "request failed");
  return j;
}

function pageFromHash(): Page {
  const h = window.location.hash.replace("#/", "") as Page;
  return PAGES.some((p) => p.id === h) ? h : "wallet";
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [health, setHealth] = useState("checking\u2026");
  const [balance, setBalance] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [spent, setSpent] = useState("0");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [detail, setDetail] = useState<(Transfer & { lines?: { wallet_id: string; debit: string; credit: string }[] }) | null>(null);
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
  const [metrics, setMetrics] = useState<Record<string, string | number> | null>(null);
  const [bills, setBills] = useState<{ id: string; biller: string; category: string; amount: string; status: string }[]>([]);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");

  const owner = uid ?? OWNER;

  const go = (p: Page) => {
    window.location.hash = `#/${p}`;
    setPage(p);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
    fetch(`${API}/v1/activity?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setActivity(j))
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
    fetch(`${API}/v1/metrics`)
      .then((r) => r.json())
      .then((j) => j.users !== undefined && setMetrics(j))
      .catch(() => {});
    fetch(`${API}/v1/bills?owner=${owner}`)
      .then((r) => r.json())
      .then((j) => Array.isArray(j) && setBills(j))
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

  // Paystack card funding: create the payment server-side, open the Paystack
  // page, then poll verify until Paystack confirms (or the webhook fires first).
  const cardFund = async (amt: string) => {
    try {
      setMsg("");
      const { data } = await authClient.getSession();
      if (!data?.user)
        throw new Error("Sign in first — open the Account page, then choose Card (Paystack)");
      const started = (await post("/v1/fund/card", {
        walletId: WALLET_A,
        amount: amt,
        idempotencyKey: crypto.randomUUID(),
      })) as { authorizationUrl: string; reference: string };
      window.open(started.authorizationUrl, "_blank", "noopener");
      setMsg("Complete the payment in the Paystack tab…");
      const deadline = Date.now() + 120000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const v = (await fetch(
          `${API}/v1/fund/verify?reference=${encodeURIComponent(started.reference)}`,
          { credentials: "include" }
        ).then((r) => r.json())) as { status?: string; error?: string };
        if (v.error)
          throw new Error(
            v.error === "sign_in_required" ? "Session expired — sign in and try again" : v.error
          );
        if (v.status === "success") {
          setMsg(`Added ${fmt(amt)} by card (Paystack)`);
          refresh();
          return;
        }
        if (v.status === "failed" || v.status === "abandoned")
          throw new Error("Payment failed or was abandoned");
        if (Date.now() > deadline)
          throw new Error("Still pending — finish the Paystack tab, then check History");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "card payment failed");
    }
  };

  const food = budgets.find((b) => b.category === "Food");
  const foodPct = food ? Math.min(100, (Number(spent) / Number(food.limit_amount)) * 100) : 0;

  return (
    <main className="page">
      <nav className="topnav">
        <a href="#/home" className="brand" onClick={(e) => { e.preventDefault(); go("home"); }}>
          FIN<span>BIQ</span>
        </a>
        <div className="links">
          {PAGES.map((p) => (
            <a key={p.id} href={`#/${p.id}`} className={page === p.id ? "on" : ""}
              onClick={(e) => { e.preventDefault(); go(p.id); }}>
              {p.label}
            </a>
          ))}
        </div>
      </nav>

      <p className="muted">
        {health} · {profile ? `${profile.name} (${profile.email})` : ""} · 🎁 {points} pts
      </p>
      {msg && <p className="flash">{msg}</p>}

      {page === "wallet" && (
        <>
          <div className="greet">
            <div className="avatar">{(profile?.name ?? "F").slice(0, 1).toUpperCase()}</div>
            <div>
              <div><b>Hi, {profile?.name ?? "there"} 👋</b></div>
              <div className="d muted">Your money. Your business. Your financial intelligence.</div>
            </div>
          </div>

          <div className="card balance-card">
            <small>Total Balance</small>
            <div className="v">{balance === null ? "…" : fmt(balance)}</div>
            <div className="d">🎁 {points} FINBIQ Points · {health}</div>
            <div className="balance-actions">
              <button onClick={() => go("wallet")}>＋ Add Money</button>
              <button onClick={() => go("history")}>🧾 History</button>
              <button onClick={() => go("savings")}>💰 Save</button>
            </div>
          </div>

          <div className="quick">
            <button onClick={() => go("wallet")}><span className="qi">💸</span>Send</button>
            <button onClick={() => go("budgets")}><span className="qi">📊</span>Budget</button>
            <button onClick={() => go("savings")}><span className="qi">💰</span>Save</button>
            <button onClick={() => go("loans")}><span className="qi">🏦</span>Borrow</button>
          </div>

          <div className="grid">
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
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const amt = new FormData(e.currentTarget).get("amount") as string;
                run(
                  () => post("/v1/transfers", {
                    idempotencyKey: crypto.randomUUID(),
                    fromWalletId: WALLET_A, toWalletId: WALLET_B,
                    amount: amt, createdBy: owner,
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
                const amt = f.get("fundAmount") as string;
                const method = f.get("method") as string;
                e.currentTarget.reset();
                if (method === "paystack") {
                  cardFund(amt);
                  return;
                }
                run(
                  () => post("/v1/fund", { walletId: WALLET_A, amount: amt, method, createdBy: owner }),
                  `Cash deposit of ${fmt(amt)} recorded`
                );
              }}
            >
              <small>Add money — cash or card</small>
              <div className="row-form">
                <input name="fundAmount" placeholder="Amount" inputMode="decimal" required />
                <select name="method" defaultValue="cash">
                  <option value="cash">Cash (recorded locally)</option>
                  <option value="paystack">Card (Paystack)</option>
                </select>
                <button type="submit">Add</button>
              </div>
              <div className="d">Card runs through Paystack (test mode until keys are added).</div>
            </form>
            <div className="card">
              <small>Recent activity</small>
              {history.slice(0, 3).map((t) => (
                <div className="txn" key={t.id}>
                  <span>{fmt(t.amount)}</span>
                  <span className="pill">{t.status}</span>
                </div>
              ))}
              {!history.length && <div className="d">no transfers yet</div>}
              <div className="d"><a href="#/history" onClick={(e) => { e.preventDefault(); go("history"); }}>View all →</a></div>
            </div>
          </div>

          <div className="ai">
            <h3>✦ Ask FINBIQ AI</h3>
            {aiInsights.map((line, i) => (
              <p key={i}>• {line}</p>
            ))}
            <form
              className="row-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q") as string;
                setMsg("thinking…");
                try {
                  const j = await post("/v1/ai/ask", { ownerUserId: owner, question: q });
                  setMsg((j as { answer: string }).answer);
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : "failed");
                }
                e.currentTarget.reset();
              }}
            >
              <input name="q" placeholder="Ask about your money…" required />
              <button type="submit">Ask</button>
            </form>
          </div>
        </>
      )}

      {page === "history" && (
        <>
          <h1>Transaction history</h1>
          <div className="card">
            <small>All money movement — transfers, bills, airtime, funding</small>
            <div className="row-form" style={{ marginTop: 8, marginBottom: 8 }}>
              <input placeholder="Search amount, status or type…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {activity
              .filter((t) => !query || t.amount.includes(query) || t.status.includes(query.toLowerCase()) || t.kind.includes(query.toLowerCase()) || t.label.toLowerCase().includes(query.toLowerCase()))
              .map((t) => (
              <div key={t.id}>
                <div
                  className="txn clickable"
                  onClick={() => {
                    if (t.kind !== "transfer") return;
                    if (detail?.id === t.id) return setDetail(null);
                    fetch(`${API}/v1/transfers/${t.id}`)
                      .then((r) => r.json())
                      .then((j) => setDetail(j))
                      .catch(() => {});
                  }}
                >
                  <span>{t.kind === "transfer" ? fmt(t.amount) : `${t.label} · ${fmt(t.amount)}`} · {new Date(t.created_at).toLocaleString()}</span>
                  <span className="pill">{t.kind} · {t.status}</span>
                </div>
                {detail?.id === t.id && detail.lines && (
                  <div className="d" style={{ paddingLeft: 12 }}>
                    {detail.lines.map((l, i) => (
                      <div key={i}>wallet {l.wallet_id.slice(0, 8)}… debit {l.debit} / credit {l.credit}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!activity.length && <div className="d">no activity yet</div>}
          </div>
        </>
      )}

      {page === "budgets" && (
        <>
          <h1>Budgets</h1>
          <div className="grid">
            {budgets.map((b) => {
              const pct = b.category === "Food"
                ? (food ? foodPct : 0)
                : 0;
              return (
                <div className="card" key={b.id}>
                  <small>{b.category ?? "Budget"} · {b.period}</small>
                  <div className="v sm">{b.category === "Food" ? `${fmt(spent)} / ${fmt(b.limit_amount)}` : `${fmt(b.limit_amount)} limit`}</div>
                  <div className="bar warn"><i style={{ width: `${pct}%` }} /></div>
                  <div className="d warn-t">{b.category === "Food" ? `${pct.toFixed(0)}% used · live spend` : "spend tracking per category lands next"}</div>
                </div>
              );
            })}
          </div>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() => post("/v1/budgets", {
                ownerUserId: owner,
                category: (f.get("category") as string) || "Food",
                limitAmount: f.get("limit") as string,
              }), "Budget created");
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
        </>
      )}

      {page === "savings" && (
        <>
          <h1>Savings goals</h1>
          <div className="grid">
            {goals.map((g) => {
              const pct = Math.min(100, (Number(g.saved) / Number(g.target_amount)) * 100);
              return (
                <div className="card" key={g.id}>
                  <small>Goal — {g.name}</small>
                  <div className="v sm">{fmt(g.saved)} / {fmt(g.target_amount)}</div>
                  <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                  <div className="d">{pct.toFixed(0)}% saved · +10 pts per contribution</div>
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
        </>
      )}

      {page === "bills" && (
        <>
          <h1>Bills</h1>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() => post("/v1/bills/pay", {
                ownerUserId: owner,
                walletId: WALLET_A,
                biller: f.get("biller") as string,
                category: (f.get("category") as string) || "Bills",
                amount: f.get("amount") as string,
              }), "Bill paid and categorized");
              e.currentTarget.reset();
            }}
          >
            <small>Pay a bill (recorded locally)</small>
            <div className="row-form">
              <input name="biller" placeholder="Biller e.g. EKEDC" required />
              <input name="category" placeholder="Category" defaultValue="Bills" />
              <input name="amount" placeholder="Amount" inputMode="decimal" required />
              <button type="submit">Pay</button>
            </div>
            <div className="d">Live biller rails need a payments partner.</div>
          </form>
          <div className="card" style={{ marginTop: 12 }}>
            <small>Paid bills ({bills.length})</small>
            {bills.map((b) => (
              <div className="txn" key={b.id}>
                <span>{b.biller} <span className="pill">{b.category}</span></span>
                <span>{fmt(b.amount)} · <span className="pill">{b.status}</span></span>
              </div>
            ))}
            {!bills.length && <div className="d">no bills paid yet</div>}
          </div>
        </>
      )}

      {page === "airtime" && (
        <>
          <h1>Airtime & Data</h1>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() => post("/v1/airtime/buy", {
                ownerUserId: owner,
                walletId: WALLET_A,
                kind: f.get("kind") as string,
                network: f.get("network") as string,
                phone: f.get("phone") as string,
                amount: f.get("amount") as string,
              }), "Purchase recorded");
              e.currentTarget.reset();
            }}
          >
            <small>Buy airtime or data (recorded locally)</small>
            <div className="row-form">
              <select name="kind" defaultValue="airtime">
                <option value="airtime">Airtime</option>
                <option value="data">Data</option>
              </select>
              <select name="network" defaultValue="MTN">
                <option value="MTN">MTN</option>
                <option value="Airtel">Airtel</option>
                <option value="Glo">Glo</option>
                <option value="9mobile">9mobile</option>
              </select>
              <input name="phone" placeholder="Phone e.g. 0803..." required />
              <input name="amount" placeholder="Amount" inputMode="decimal" required />
              <button type="submit">Buy</button>
            </div>
            <div className="d">Live delivery needs a telco aggregator partner.</div>
          </form>
        </>
      )}

      {page === "loans" && (
        <>
          <h1>Loans</h1>
          <div className="card">
            <small>Affordability estimate — not an offer</small>
            <div className="v">{estimate ? fmt(estimate.maxEligible) + " max" : "…"}</div>
            <div className="d">{estimate?.disclaimer ?? ""}</div>
          </div>
        </>
      )}

      {page === "invest" && (
        <>
          <h1>Investments</h1>
          <div className="card">
            <small>Learn first — education only</small>
            {invest.map((it) => (
              <div className="txn" key={it.id}>
                <span><b>{it.name}</b><br /><span className="d">{it.note}</span></span>
                <span className="pill">{it.risk}</span>
              </div>
            ))}
            <div className="d">Execution needs a licensed provider (PRD Sec.18).</div>
          </div>
        </>
      )}

      {page === "business" && (
        <>
          <h1>Business</h1>
          <div className="grid">
            <div className="card">
              <small>Business Balance</small>
              <div className="v">{biz ? fmt(biz.balance) : balance === null ? "…" : fmt(balance)}</div>
              <div className="d up">{biz ? "live business ledger" : "demo wallet (create a business below)"}</div>
            </div>
            <div className="card">
              <small>Business budgets</small>
              <div className="v sm">{biz ? biz.budgets : budgets.length} active</div>
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
        </>
      )}

      {page === "reports" && (
        <>
          <h1>Reports</h1>
          <div className="grid">
            <div className="card">
              <small>Income vs expenses</small>
              <div className="v sm">{summary ? `${fmt(summary.inflow)} in / ${fmt(summary.outflow)} out` : "…"}</div>
              <div className="d">{summary ? `Saved ${fmt(summary.saved)} of ${fmt(summary.savingsTarget)} target` : ""}</div>
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
            <div className="card">
              <small>Platform metrics</small>
              {metrics ? (
                <div className="d">
                  Users {metrics.users} · Wallets {metrics.wallets} · Transfers {metrics.transfers} ·
                  Volume {fmt(metrics.transferVolume)} · Success {metrics.transferSuccessRate} ·
                  Budgets {metrics.budgets} · Goals {metrics.savingsGoals} · Points {metrics.pointsAwarded} ·
                  Businesses {metrics.businesses}
                </div>
              ) : (
                <div className="d">loading…</div>
              )}
            </div>
          </div>
        </>
      )}

      {page === "account" && (
        <>
          <h1>Account</h1>
          <AuthPanel onUser={setUid} />
          {profile && (
            <div className="card">
              <small>Profile</small>
              <div className="v sm">{profile.name}</div>
              <div className="d">{profile.email} · 🎁 {points} pts</div>
            </div>
          )}
        </>
      )}
      <TabBar page={page} go={go} />
    </main>
  );
}

function TabBar({ page, go }: { page: string; go: (p: Page) => void }) {
  const tabs: Page[] = ["wallet", "history", "savings", "business", "account"];
  const icons: Record<string, string> = { wallet: "👛", history: "🧾", savings: "💰", business: "🏢", account: "👤" };
  const labels: Record<string, string> = { wallet: "Wallet", history: "History", savings: "Save", business: "Biz", account: "Me" };
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button key={t} className={page === t ? "on" : ""} onClick={() => go(t)}>
          <span className="ti">{icons[t]}</span>
          {labels[t]}
        </button>
      ))}
    </nav>
  );
}
