import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import LoginGate from "./LoginGate";
import { installWebShim } from "./webShim";
import { apiFetch, isElectron, onUnauthorized } from "./api";
import { initSync } from "./sync";
import reportWebVitals from "./reportWebVitals";

installWebShim();

const IS_ELECTRON = isElectron();

function Splash({ label, children }) {
  return (
    <div className="gate gate-dark">
      <div className="gate-card" style={{ alignItems: "center" }}>
        <img className="gate-logo" src="./wizard-schedules-transparent.ico" alt="" />
        <p className="gate-sub" style={{ margin: 0 }}>
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

function Root() {
  const [status, setStatus] = useState("checking");
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await apiFetch("/api/session");
        if (cancelled) return;
        if (!session.authenticated) {
          setNeedsSetup(Boolean(session.needsSetup));
          setStatus("login");
          return;
        }
        await initSync();
        if (!cancelled) setStatus("ready");
      } catch {
        // Server unreachable: the desktop app keeps working standalone with its
        // local data; the web app has nothing to run on, so offer a retry.
        if (!cancelled) setStatus(IS_ELECTRON ? "standalone" : "offline");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onUnauthorized(() => setStatus("login"));
    return () => onUnauthorized(null);
  }, []);

  if (status === "checking") return <Splash label="Checking your session…" />;
  if (status === "syncing") return <Splash label="Syncing your data…" />;

  if (status === "login") {
    return (
      <LoginGate
        needsSetup={needsSetup}
        onAuthenticated={async () => {
          setStatus("syncing");
          try {
            await initSync();
          } catch {}
          setStatus("ready");
        }}
      />
    );
  }

  if (status === "offline") {
    return (
      <Splash label="Cannot reach the server.">
        <button
          className="gate-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </Splash>
    );
  }

  // "ready" (synced), "standalone" (desktop, server unreachable): run the app.
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

// PWA: register the service worker on the web only.
if (!IS_ELECTRON && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/service-worker.js`).catch(() => {});
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
