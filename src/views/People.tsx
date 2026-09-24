import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { scopeFor } from "../access";
import { Avatar, Field, Icon, IdChip, Pill } from "../components/Bits";
import { Confirm, Modal } from "../components/Modal";
import { USER_ROLES, label, matches, taskLinks } from "../lib";
import { useStore } from "../store";
import type { Role, User, UserStatus } from "../types";

type Draft = Omit<User, "id">;

const blank = (): Draft => ({
  name: "",
  email: "",
  password: "",
  role: "member",
  title: "",
  department: "",
  status: "active",
});

export function People({ query, intent, onIntent }: { query: string; intent?: "create-task" | "create-project" | "invite" | "my-tasks" | null; onIntent?: () => void }) {
  const store = useStore();
  const { data, sessionUser } = store;
  const [dialog, setDialog] = useState<{ mode: "edit"; user: User } | { mode: "create" } | { mode: "delete"; user: User } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (intent !== "invite" || sessionUser?.role !== "admin") return;
    setDraft(blank());
    setError(null);
    setDialog({ mode: "create" });
    onIntent?.();
  }, [intent]);

  if (!data || !sessionUser) return null;

  const admin = sessionUser.role === "admin";
  const people = scopeFor(data, sessionUser).users.filter((user) =>
    matches(query, [user.name, user.email, user.id, user.title, user.department, user.role]),
  );

  const openCreate = () => {
    setDraft(blank());
    setError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (user: User) => {
    setDraft({ ...user, password: "" });
    setError(null);
    setDialog({ mode: "edit", user });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (dialog?.mode === "create" && draft.password.trim().length < 4) {
      setError("Give the new person a password of at least 4 characters.");
      return;
    }
    const base = {
      name: draft.name.trim(),
      email: draft.email.trim(),
      role: draft.role,
      title: draft.title.trim(),
      department: draft.department.trim(),
      status: draft.status,
    };
    const message =
      dialog?.mode === "edit"
        ? store.updateUser(dialog.user.id, draft.password.trim() ? { ...base, password: draft.password.trim() } : base)
        : store.addUser({ ...base, password: draft.password.trim() });
    if (message) {
      setError(message);
      return;
    }
    setDialog(null);
  };

  return (
    <div className="stack">
      <div className="view-head">
        <p>
          {admin
            ? "Everyone on Northline. Only an admin sees the full list."
            : sessionUser.role === "reviewer"
              ? "Your review account. Other people stay hidden."
              : "Your account. Other people stay hidden."}
        </p>
        {admin && (
          <button type="button" className="btn primary" onClick={openCreate}>
            <Icon name="plus" /> New person
          </button>
        )}
      </div>
      {people.length === 0 && <p className="empty">No one matches that search.</p>}
      <div className="people-grid">
        {people.map((user) => {
          const holding = data.assignments.filter((item) => item.userId === user.id && item.kind === "task" && item.taskId && taskLinks(data.assignments, item.taskId).some((link) => link.userId === user.id));
          const openCount = holding.filter((item) => data.tasks.find((task) => task.id === item.taskId)?.status !== "done").length;
          return (
            <article key={user.id} className="person-card">
              <div className="card-top">
                <Avatar name={user.name} id={user.id} />
                <div>
                  <h3>
                    {user.name} <IdChip id={user.id} />
                  </h3>
                  <p className="muted">{user.title || "No title"} · {user.department || "No department"}</p>
                </div>
              </div>
              <p className="muted">{user.email}</p>
              <div className="card-actions">
                <Pill value={user.role} />
                <Pill value={user.status} />
                <span className="muted">{openCount} open</span>
              </div>
              <div className="card-actions">
                <button type="button" className="btn ghost small" onClick={() => openEdit(user)}>
                  Edit
                </button>
                {admin && (
                  <button
                    type="button"
                    className="btn danger small"
                    disabled={user.id === sessionUser.id}
                    onClick={() => setDialog({ mode: "delete", user })}
                  >
                    {user.id === sessionUser.id ? "Signed in" : "Remove"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {dialog && dialog.mode !== "delete" && draft && (
        <Modal title={dialog.mode === "edit" ? `Edit person · ${dialog.user.id}` : "New person"} onClose={() => setDialog(null)}>
          <form className="form-grid" onSubmit={save}>
            <Field label="Name">
              <input className="control" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
            </Field>
            <Field label="Email">
              <input className="control" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
            </Field>
            <Field label="Title">
              <input className="control" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </Field>
            <Field label="Department">
              <input className="control" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} />
            </Field>
            <Field label="Role">
              <select className="control" value={draft.role} disabled={!admin} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}>
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {label(role)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className="control" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as UserStatus })}>
                <option value="active">Active</option>
                <option value="away">Away</option>
              </select>
            </Field>
            <Field label={dialog.mode === "edit" ? "New password" : "Password"} wide>
              <input
                className="control"
                type="text"
                value={draft.password}
                placeholder={dialog.mode === "edit" ? "Leave blank to keep the current password" : "At least 4 characters"}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              />
            </Field>
            {error && <p className="form-error wide">{error}</p>}
            <div className="form-actions wide">
              <button type="button" className="btn ghost" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="btn primary" type="submit">
                Save person
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.mode === "delete" && (
        <Confirm
          title={`Remove ${dialog.user.name}`}
          body="Their assignments will be cleared. Projects they own will pass to you."
          confirmLabel="Remove person"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            store.deleteUser(dialog.user.id);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
