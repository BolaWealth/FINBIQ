import { useState } from "react";
import { authClient, useSession } from "./auth";

export default function AuthPanel({ onUser }: { onUser: (id: string | null) => void }) {
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [totpUri, setTotpUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [msg, setMsg] = useState("");

  if (isPending) return <div className="card"><small>Account</small><div className="d">checking session…</div></div>;

  if (session?.user) {
    onUser((session.user as { id: string }).id);
    return (
      <div className="card">
        <small>Signed in</small>
        <div className="v sm">{session.user.name ?? session.user.email}</div>
        {!totpUri ? (
          <button
            onClick={async () => {
              const { data, error } = await authClient.twoFactor.enable({ password });
              if (error) return setMsg(error.message ?? "2FA enable failed (enter password above first)");
              setTotpUri((data as { totpURI: string })?.totpURI ?? JSON.stringify(data));
              setMsg("Scan the URI in your authenticator app, then verify a code below.");
            }}
          >
            Enable app 2FA
          </button>
        ) : (
          <form
            className="row-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await authClient.twoFactor.verifyTotp({ code: totpCode });
              setMsg(error ? error.message ?? "invalid code" : "2FA verified for this device");
            }}
          >
            <input value={totpUri} readOnly title="otpauth URI — add manually in authenticator app" />
            <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="6-digit code" />
            <button type="submit">Verify</button>
          </form>
        )}
        {msg && <div className="d">{msg}</div>}
        <div style={{ marginTop: 8 }}>
          <button onClick={() => { authClient.signOut(); onUser(null); }}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <small>Account — {mode === "signin" ? "Sign in" : "Sign up"}</small>
      <form
        className="row-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg("");
          const fn = mode === "signin" ? authClient.signIn.email : authClient.signUp.email;
          const { error } = await fn({ email, password, name: name || email, callbackURL: "/" } as never);
          if (error) setMsg(error.message ?? "auth failed");
        }}
      >
        {mode === "signup" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
        <button type="submit">{mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      {msg && <div className="d">{msg}</div>}
      <div className="d">
        {mode === "signin" ? "No account? " : "Have an account? "}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "signin" ? "signup" : "signin"); }}>
          {mode === "signin" ? "Sign up" : "Sign in"}
        </a>{" "}
        · demo data uses demo-user-1 until you sign in
      </div>
    </div>
  );
}
