import { useState } from "react";
import type { FormEvent } from "react";
import { Icon, Mark } from "../components/Bits";
import { useStore } from "../store";

export function Login() {
  const { data, login } = useStore();
  const [email, setEmail] = useState("shaqlin@northline.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(login(email, password));
  };

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
          <p>
            Sign in with someone from the user list. Projects, tasks, and assignments stay linked by id, starting from
            the JSON files in <code>public/assets</code>.
          </p>
        </div>
        <div className="story-stats">
          <div>
            <strong>{data.users.length}</strong>
            <span>People</span>
          </div>
          <div>
            <strong>{data.projects.length}</strong>
            <span>Projects</span>
          </div>
          <div>
            <strong>{data.tasks.length}</strong>
            <span>Tasks</span>
          </div>
          <div>
            <strong>{data.assignments.length}</strong>
            <span>Links</span>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <form className="panel-card" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="muted">Use an email from users.json. This demo keeps passwords in that file on purpose.</p>
          <label className="field">
            <span>Email</span>
            <input className="control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="control"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary" type="submit">
            <Icon name="enter" /> Enter the desk
          </button>
        </form>
        <div className="demo-block">
          <p className="eyebrow">Desk accounts</p>
          <div className="demo-grid">
            {data.users.map((user) => (
              <button
                key={user.id}
                type="button"
                className="demo-card"
                onClick={() => setError(login(user.email, user.password))}
              >
                <strong>{user.name}</strong>
                <span>{user.title}</span>
                <span className="demo-meta">
                  {user.email}
                  <br />
                  {user.password}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
