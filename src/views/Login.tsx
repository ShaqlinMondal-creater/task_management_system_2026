import { useState } from "react";
import type { FormEvent } from "react";
import { Icon, Mark } from "../components/Bits";
import { useStore } from "../store";

type Mode = "signin" | "register" | "forgot" | "code" | "reset";

function codeFor() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function Login() {
  const store = useStore();
  const { data, login } = store;
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("shaqlin@northline.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return null;

  const fail = (message: string | null) => {
    setBusy(false);
    setError(message);
    return message;
  };

  const run = (work: () => string | null) => {
    setError(null);
    setBusy(true);
    window.setTimeout(() => fail(work()), 400);
  };

  const submitSignIn = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim().includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    run(() => login(email, password, remember));
  };

  const submitRegister = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Enter your name.");
    if (!email.trim().includes("@")) return setError("Enter a valid email.");
    if (!/^[0-9]{8,15}$/.test(mobile.trim())) return setError("Enter a mobile number, digits only.");
    if (password.length < 4) return setError("Password must be at least 4 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    if (!terms) return setError("Accept the terms to create an account.");
    if (data.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) return setError("That email is already registered.");
    const next = codeFor();
    setSentCode(next);
    setCode("");
    setMode("code");
    setError(null);
  };

  const submitForgot = (event: FormEvent) => {
    event.preventDefault();
    const user = data.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return setError("No account uses that email.");
    setName("");
    const next = codeFor();
    setSentCode(next);
    setCode("");
    setMode("code");
    setError(null);
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim() !== sentCode) return setError("That code does not match.");
    if (mode === "code" && name.trim()) {
      const message = store.addUser({
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        password,
        role: "member",
        title: "Member",
        department: "Delivery",
        status: "active",
      });
      if (message) return setError(message);
      setPassword("");
      setMode("signin");
      setError(null);
      return;
    }
    setPassword("");
    setConfirm("");
    setMode("reset");
    setError(null);
  };

  const submitReset = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 4) return setError("Password must be at least 4 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    const user = data.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return setError("That account is missing.");
    const message = store.updateUser(user.id, { password });
    if (message) return setError(message);
    setMode("signin");
    setPassword("");
    setError(null);
  };

  const title = mode === "register" ? "Create account" : mode === "forgot" || mode === "code" ? "Reset password" : mode === "reset" ? "Choose a new password" : "Sign in";

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
          <p>Sign in with someone from the user list, or register a member. This desk has no mail server, so a verification code is shown on the form.</p>
        </div>
        <div className="story-stats">
          <div><strong>{data.users.length}</strong><span>People</span></div>
          <div><strong>{data.projects.length}</strong><span>Projects</span></div>
          <div><strong>{data.tasks.length}</strong><span>Tasks</span></div>
          <div><strong>{data.assignments.length}</strong><span>Links</span></div>
        </div>
      </section>
      <section className="login-panel">
        <form className="panel-card" onSubmit={mode === "signin" ? submitSignIn : mode === "register" ? submitRegister : mode === "forgot" ? submitForgot : mode === "code" ? submitCode : submitReset}>
          <h2>{title}</h2>
          {store.sessionNote && mode === "signin" && <p className="form-error">{store.sessionNote}</p>}
          {mode === "register" && (
            <label className="field"><span>Name</span><input className="control" value={name} onChange={(event) => setName(event.target.value)} /></label>
          )}
          {mode !== "reset" && (
            <label className="field"><span>Email</span><input className="control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
          )}
          {mode === "register" && (
            <label className="field"><span>Mobile</span><input className="control" inputMode="numeric" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="Digits only" /></label>
          )}
          {(mode === "signin" || mode === "register" || mode === "reset") && (
            <label className="field">
              <span>Password</span>
              <span className="secret-row">
                <input className="control" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
                <button type="button" className="btn ghost small" onClick={() => setShowPassword((open) => !open)}>{showPassword ? "Hide" : "Show"}</button>
              </span>
            </label>
          )}
          {(mode === "register" || mode === "reset") && (
            <label className="field"><span>Confirm password</span><input className="control" type={showPassword ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
          )}
          {mode === "code" && (
            <>
              <p className="muted">This desk cannot send email. Your code is <strong>{sentCode}</strong>.</p>
              <label className="field"><span>Verification code</span><input className="control" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" /></label>
            </>
          )}
          {mode === "signin" && (
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Remember me
            </label>
          )}
          {mode === "register" && (
            <label className="check">
              <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
              I accept the terms for this desk
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            <Icon name="enter" /> {busy ? "Please wait…" : mode === "signin" ? "Enter the desk" : mode === "code" ? "Verify code" : mode === "reset" ? "Save password" : mode === "forgot" ? "Send code" : "Create account"}
          </button>
          <p className="auth-links">
            {mode !== "signin" && <button type="button" className="text-btn" onClick={() => { setMode("signin"); setError(null); }}>Back to sign in</button>}
            {mode === "signin" && <button type="button" className="text-btn" onClick={() => { setMode("forgot"); setError(null); }}>Forgot password</button>}
            {mode === "signin" && <button type="button" className="text-btn" onClick={() => { setMode("register"); setError(null); }}>Create an account</button>}
          </p>
        </form>
        {mode === "signin" && (
          <div className="demo-block">
            <p className="eyebrow">Desk accounts</p>
            <div className="demo-grid">
              {data.users.map((user) => (
                <button key={user.id} type="button" className="demo-card" onClick={() => setError(login(user.email, user.password, remember))}>
                  <strong>{user.name}</strong>
                  <span>{user.title}</span>
                  <span className="demo-meta">{user.email}<br />{user.password}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function ChangePassword({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    const message = store.changePassword(current, next);
    if (message) setError(message);
    else onClose();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field"><span>Current password</span><input className="control" type={show ? "text" : "password"} value={current} onChange={(event) => setCurrent(event.target.value)} /></label>
      <label className="field"><span>New password</span><input className="control" type={show ? "text" : "password"} value={next} onChange={(event) => setNext(event.target.value)} /></label>
      <label className="field"><span>Confirm password</span><input className="control" type={show ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} /> Show passwords</label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary">Change password</button>
      </div>
    </form>
  );
}
