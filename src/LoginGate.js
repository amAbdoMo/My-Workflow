import { useState } from "react";
import { apiFetch, isElectron, storeToken } from "./api";
import "./LoginGate.css";

const APP_NAME = "WorkflowY";

export default function LoginGate({ needsSetup, onAuthenticated }) {
  const [mode] = useState(needsSetup ? "setup" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (mode === "setup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const path = mode === "setup" ? "/api/setup" : "/api/login";
      const result = await apiFetch(path, { method: "POST", body: { username, password } });
      if (isElectron()) storeToken(result?.token);
      onAuthenticated();
    } catch (submitError) {
      setError(submitError.message || "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="gate gate-dark">
      <div className="gate-bg" aria-hidden="true">
        <span className="gate-orb gate-orb-a" />
        <span className="gate-orb gate-orb-b" />
        <span className="gate-orb gate-orb-c" />
        <span className="gate-star gate-star-1">✦</span>
        <span className="gate-star gate-star-2">✧</span>
        <span className="gate-star gate-star-3">✦</span>
        <span className="gate-star gate-star-4">✧</span>
        <span className="gate-star gate-star-5">✦</span>
        <span className="gate-star gate-star-6">✧</span>
      </div>
      <form className="gate-card gate-card-enter" onSubmit={handleSubmit}>
        <img className="gate-logo" src="./wizard-schedules-transparent.ico" alt="" />
        <p className="gate-eyebrow">{mode === "setup" ? "First-time setup" : "Welcome back"}</p>
        <h1 className="gate-title">Workflow<span className="name-accent">Y</span></h1>
        <p className="gate-sub">
          {mode === "setup"
            ? "Create your login. You will stay signed in for 30 days per device."
            : "Sign in to sync your schedules and snippets."}
        </p>

        <label className="gate-label">
          Username
          <input
            className="gate-input"
            type="text"
            value={username}
            autoComplete={mode === "setup" ? "new-username" : "username"}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
        </label>

        <label className="gate-label">
          Password
          <input
            className="gate-input"
            type="password"
            value={password}
            autoComplete={mode === "setup" ? "new-password" : "current-password"}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>

        {mode === "setup" && (
          <label className="gate-label">
            Confirm password
            <input
              className="gate-input"
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
        )}

        {error && (
          <div className="gate-error" role="alert">
            {error}
          </div>
        )}

        <button className="gate-button" type="submit" disabled={busy || !username || password.length < 8}>
          {busy ? "Please wait…" : mode === "setup" ? "Create login" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
