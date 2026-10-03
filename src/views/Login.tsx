import { useState } from "react";
import type { FormEvent } from "react";
import { apiEnabled, apiForgot, apiPasswordUpdate } from "../api";
import { Icon, Mark } from "../components/Bits";
import { useStore } from "../store";

type Mode = "signin" | "forgot" | "code" | "reset";

export function Login() {
  const store = useStore();
  const { data, login } = store;
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return null;

  const fail = (message: string | null) => {
    setBusy(false);
    setError(message);
  };

  const run = (work: () => Promise<string | null>) => {
    setError(null);
    setBusy(true);
    void work()
      .then((message) => fail(message))
      .catch((err: unknown) => fail(err instanceof Error ? err.message : "Something went wrong."));
  };

  const submitSignIn = (event: FormEvent) => {
    event.preventDefault();
    if (!apiEnabled()) return setError("Set VITE_API_URL to sign in.");
    if (!email.trim().includes("@")) return setError("Enter a valid email.");
    if (password.length < 4) return setError("Password must be at least 4 characters.");
    run(() => login(email, password, remember));
  };

  const submitForgot = (event: FormEvent) => {
    event.preventDefault();
    if (!apiEnabled()) return setError("Set VITE_API_URL to reset a password.");
    if (!email.trim().includes("@")) return setError("Enter a valid email.");
    run(async () => {
      const result = await apiForgot(email.trim());
      setSentCode(result.code);
      setCode("");
      setMode("code");
      return null;
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim() !== sentCode) return setError("That code does not match.");
    setPassword("");
    setConfirm("");
    setMode("reset");
    setError(null);
  };

  const submitReset = (event: FormEvent) => {
    event.preventDefault();
    if (!apiEnabled()) return setError("Set VITE_API_URL to reset a password.");
    if (password.length < 4) return setError("Password must be at least 4 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    run(async () => {
      await apiPasswordUpdate(email.trim(), sentCode, password);
      setMode("signin");
      setPassword("");
      setConfirm("");
      return null;
    });
  };

  const title =
    mode === "forgot" || mode === "code" ? "Reset password" : mode === "reset" ? "Choose a new password" : "Sign in";

  const onSubmit =
    mode === "signin" ? submitSignIn : mode === "forgot" ? submitForgot : mode === "code" ? submitCode : submitReset;

  return (
    <div className="login">
      <section className="login-story">
        <div className="story-brand">
          <Mark />
          <span>Northline</span>
        </div>
        <div className="story-copy">
          <p className="eyebrow light">Task desk</p>
          <h1>People, projects, and the tasks between them.</h1>
          <p>Sign in with your desk account. Forgot password shows a verification code here — this desk has no mail server.</p>
        </div>
        <div className="story-stats">
          <div><strong>{data.users.length || "—"}</strong><span>People</span></div>
          <div><strong>{data.projects.length || "—"}</strong><span>Projects</span></div>
          <div><strong>{data.tasks.length || "—"}</strong><span>Tasks</span></div>
          <div><strong>{data.assignments.length || "—"}</strong><span>Links</span></div>
        </div>
      </section>
      <section className="login-panel">
        <form className="panel-card" onSubmit={onSubmit}>
          <h2>{title}</h2>
          {store.sessionNote && mode === "signin" && <p className="form-error">{store.sessionNote}</p>}
          {mode !== "reset" && (
            <label className="field">
              <span>Email</span>
              <input className="control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
            </label>
          )}
          {(mode === "signin" || mode === "reset") && (
            <label className="field">
              <span>Password</span>
              <span className="secret-row">
                <input
                  className="control"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
                <button type="button" className="btn ghost small" onClick={() => setShowPassword((open) => !open)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          )}
          {mode === "reset" && (
            <label className="field">
              <span>Confirm password</span>
              <input className="control" type={showPassword ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </label>
          )}
          {mode === "code" && (
            <>
              <p className="muted">This desk cannot send email. Your code is <strong>{sentCode}</strong>.</p>
              <label className="field">
                <span>Verification code</span>
                <input className="control" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
              </label>
            </>
          )}
          {mode === "signin" && (
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Remember me
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            <Icon name="enter" />{" "}
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Enter the desk"
                : mode === "code"
                  ? "Verify code"
                  : mode === "reset"
                    ? "Save password"
                    : "Send code"}
          </button>
          <p className="auth-links">
            {mode !== "signin" && (
              <button type="button" className="text-btn" onClick={() => { setMode("signin"); setError(null); }}>
                Back to sign in
              </button>
            )}
            {mode === "signin" && (
              <button type="button" className="text-btn" onClick={() => { setMode("forgot"); setError(null); }}>
                Forgot password
              </button>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}

export function ChangePassword({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const store = useStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    void store.changePassword(current, next).then((message) => {
      setBusy(false);
      if (message) {
        setError(message);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      onDone();
    });
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field"><span>Current password</span><input className="control" type={show ? "text" : "password"} value={current} onChange={(event) => setCurrent(event.target.value)} /></label>
      <label className="field"><span>New password</span><input className="control" type={show ? "text" : "password"} value={next} onChange={(event) => setNext(event.target.value)} /></label>
      <label className="field"><span>Confirm password</span><input className="control" type={show ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} /> Show passwords</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Please wait…" : "Change password"}</button>
      </div>
    </form>
  );
}
