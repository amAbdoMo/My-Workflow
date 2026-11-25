import { useState } from "react";
import { apiFetch, isElectron, storeToken } from "./api";
import "./LoginGate.css";

export default function LoginGate({ needsSetup, onAuthenticated }) {
  const [mode] = useState(needsSetup ? "setup" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="gate-frame">
        <div className="gate-intro">
          <div className="gate-brand"><img className="gate-logo" src="./wizard-schedules-transparent.ico" alt="" /><span>Workflow<span className="name-accent">Y</span></span></div>
          <div className="gate-intro-copy"><strong>Your projects and code, in one place.</strong><p>Open your schedules, snippets, and tasks from your workspace.</p></div>
          <div className="gate-decoration" aria-hidden="true"><span /><span /><span /></div>
        </div>
        <form className="gate-card" onSubmit={handleSubmit}>
          <div>
            <h1 className="gate-title">{mode === "setup" ? "Create your login" : "Sign in"}</h1>
            <p className="gate-sub">{mode === "setup" ? "You will stay signed in for 30 days per device." : "Use your WorkflowY account."}</p>
          </div>

          <label className="gate-label">
            Username
            <input
              className="gate-input"
              type="text"
              placeholder="Your username"
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
              type={showPassword ? "text" : "password"}
              placeholder="Your password"
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
                type={showPassword ? "text" : "password"}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </label>
          )}

          <button className="gate-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide password" : "Show password"}</button>

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
    </div>
  );
}
