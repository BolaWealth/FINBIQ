import { useEffect, useState } from "react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export default function App() {
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [health, setHealth] = useState("checking…");

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? "api: ok" : "api: bad response"))
      .catch(() => setHealth("api: unreachable (start services/api)"));
  }, []);

  return (
    <main style={{ padding: 28, maxWidth: 900 }}>
      <h1>FINBIQ Local</h1>
      <p style={{ color: "var(--muted)" }}>{health}</p>
      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <button onClick={() => setMode("personal")}>Personal Mode</button>
        <button onClick={() => setMode("business")}>Business Mode</button>
      </div>
      <div className="card">
        {mode === "personal" ? (
          <div>Balance card, budget bar, Ask AI — styled by tokens.css (see design-preview.html).</div>
        ) : (
          <div>Revenue, cash flow, P&amp;L, payments queue — styled by tokens.css.</div>
        )}
      </div>
    </main>
  );
}
