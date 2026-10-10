import { useEffect, useState } from "react";

// Visible install button: appears when the browser fires beforeinstallprompt
// (Chrome/Edge desktop + Android). iOS has no prompt — show share instructions.
export default function InstallButton() {
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(
    window.matchMedia?.("(display-mode: standalone)").matches ?? false
  );
  const [isIOS, setIsIOS] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (deferred) {
    return (
      <button
        className="install-btn"
        onClick={async () => {
          const p = deferred as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
          await p.prompt();
          const { outcome } = await p.userChoice;
          if (outcome === "accepted") setDeferred(null);
        }}
      >
        ⬇ Install FINBIQ
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button className="install-btn" onClick={() => setShowIOS(!showIOS)}>
          ⬇ Install FINBIQ
        </button>
        {showIOS && (
          <div className="d">iPhone: tap Share → “Add to Home Screen”.</div>
        )}
      </>
    );
  }

  return null;
}
