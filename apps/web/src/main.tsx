import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);

// PWA: register the service worker for production builds only. In dev the SW
// caches Vite modules and can serve stale broken pages after a server restart.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  } else {
    // Self-heal: drop any worker registered by an earlier dev build.
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    if (typeof caches !== "undefined") {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith("finbiq-")).map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }
}
