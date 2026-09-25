import { useState } from "react";
import type { FormEvent } from "react";
import { Field, Icon, IdChip, Pill } from "../components/Bits";
import { Confirm, Modal } from "../components/Modal";
import { Table, Tabs } from "../components/System";
import { USER_ROLES, formatDate, isOverdue, label, matches, personName } from "../lib";
import { useStore } from "../store";
import type { Role, User, UserStatus } from "../types";

const SECTIONS = ["Dashboard", "Users", "Roles", "Projects", "Tasks", "Activity", "Settings", "System"] as const;
const ROLE_NOTES = [
  { role: "Admin", note: "Full desk, users, roles, settings, and system." },
  { role: "Manager", note: "Sees every project, task, and person. Cannot open Admin or delete the desk." },
  { role: "Member", note: "Works on tasks assigned to them." },
  { role: "Viewer", note: "Can open projects and tasks, and cannot change them." },
  { role: "Reviewer", note: "Already on the desk. Reviews tasks and marks them done." },
];

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

export function Admin({ query }: { query: string }) {
  const store = useStore();
  const { data, sessionUser } = store;
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Dashboard");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [find, setFind] = useState("");
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; user: User } | { mode: "delete"; user: User } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedAsk, setSeedAsk] = useState(false);

  if (!data || !sessionUser || sessionUser.role !== "admin") return null;

  const users = data.users.filter((user) => {
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    return matches(find || query, [user.name, user.email, user.id, user.role, user.title, user.department]);
  });
  const logs = [
    ...data.assignments.map((item) => ({
      id: item.id,
      when: item.assignedAt,
      text: `${personName(data.users, item.userId)} ${item.kind === "project" ? "joined" : "was assigned"} ${item.kind === "project" ? data.projects.find((project) => project.id === item.projectId)?.name : data.tasks.find((task) => task.id === item.taskId)?.title ?? "a task"}`,
    })),
    ...data.tasks.flatMap((task) => (task.activity ?? []).map((item) => ({ id: `${task.id}-${item.id}`, when: item.at, text: `${task.title}: ${item.text}` }))),
  ].sort((a, b) => b.when.localeCompare(a.when)).slice(0, 20);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (dialog?.mode === "create" && draft.password.trim().length < 4) {
      setError("Password needs at least 4 characters.");
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
    const message = dialog?.mode === "edit"
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
      <Tabs value={section} onChange={(value) => setSection(value as (typeof SECTIONS)[number])} options={SECTIONS.map((item) => ({ value: item, label: item === "Activity" ? "Activity logs" : item }))} />
      {section === "Dashboard" && (
        <section className="metrics">
          <article className="metric"><span>Users</span><strong>{data.users.length}</strong></article>
          <article className="metric"><span>Projects</span><strong>{data.projects.length}</strong></article>
          <article className="metric"><span>Tasks</span><strong>{data.tasks.length}</strong></article>
          <article className="metric tone-late"><span>Overdue</span><strong>{data.tasks.filter((task) => isOverdue(task.dueDate, task.status)).length}</strong></article>
        </section>
      )}
      {section === "Users" && (
        <div className="stack">
          <div className="filters">
            <label>
              Search
              <input className="control" value={find} placeholder="Name or email" onChange={(event) => setFind(event.target.value)} />
            </label>
            <label>
              Role
              <select className="control" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">All</option>
                {USER_ROLES.map((role) => <option key={role} value={role}>{label(role)}</option>)}
              </select>
            </label>
            <label>
              Status
              <select className="control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="away">Away</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button type="button" className="btn primary" onClick={() => { setDraft(blank()); setError(null); setDialog({ mode: "create" }); }}>
              <Icon name="plus" /> Create
            </button>
          </div>
          <Table head={["User", "Role", "Status", ""]}>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong> <IdChip id={user.id} />
                  <p className="muted">{user.email}</p>
                </td>
                <td>
                  <select className="control" value={user.role} aria-label={`Role for ${user.name}`} onChange={(event) => store.updateUser(user.id, { role: event.target.value as Role })}>
                    {USER_ROLES.map((role) => <option key={role} value={role}>{label(role)}</option>)}
                  </select>
                </td>
                <td><Pill value={user.status} /></td>
                <td className="check-actions">
                  <button type="button" className="btn ghost small" onClick={() => { setDraft({ ...user, password: "" }); setError(null); setDialog({ mode: "edit", user }); }}>Edit</button>
                  <button type="button" className="btn ghost small" onClick={() => store.updateUser(user.id, { status: (user.status === "inactive" ? "active" : "inactive") as UserStatus })}>
                    {user.status === "inactive" ? "Activate" : "Deactivate"}
                  </button>
                  <button type="button" className="btn danger small" disabled={user.id === sessionUser.id} onClick={() => setDialog({ mode: "delete", user })}>Delete</button>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      {section === "Roles" && (
        <ul className="line-list">
          {ROLE_NOTES.map((item) => (
            <li key={item.role}><strong>{item.role}</strong><span>{item.note}</span></li>
          ))}
        </ul>
      )}
      {section === "Projects" && (
        <Table head={["Project", "Status", "Owner", "Due"]}>
          {data.projects.filter((project) => matches(query, [project.name, project.code])).map((project) => (
            <tr key={project.id}>
              <td><strong>{project.name}</strong><p className="muted">{project.code}</p></td>
              <td><Pill value={project.status} /></td>
              <td>{personName(data.users, project.ownerId)}</td>
              <td>{formatDate(project.dueDate)}</td>
            </tr>
          ))}
        </Table>
      )}
      {section === "Tasks" && (
        <Table head={["Task", "Status", "Priority", "Due"]}>
          {data.tasks.filter((task) => matches(query, [task.title, task.id])).map((task) => (
            <tr key={task.id}>
              <td>{task.title}</td>
              <td><Pill value={task.status} /></td>
              <td><Pill value={task.priority} /></td>
              <td>{formatDate(task.dueDate)}</td>
            </tr>
          ))}
        </Table>
      )}
      {section === "Activity" && (
        <ul className="line-list">
          {logs.length === 0 && <li>No activity yet.</li>}
          {logs.map((item) => (
            <li key={item.id}><strong>{item.text}</strong><span>{formatDate(item.when.slice(0, 10))}</span></li>
          ))}
        </ul>
      )}
      {section === "Settings" && (
        <div className="project-detail">
          <div className="fact-grid">
            <div><span>Signed in</span><strong>{sessionUser.name}</strong></div>
            <div><span>Role</span><strong>{label(sessionUser.role)}</strong></div>
            <div><span>Idle sign-out</span><strong>30 minutes</strong></div>
            <div><span>Remember me</span><strong>14 days</strong></div>
          </div>
        </div>
      )}
      {section === "System" && (
        <div className="stack">
          <p className="muted">{store.usingLocal ? "This browser is using the working copy." : "This browser is using the seed files."}</p>
          <p className="muted">Seed files: users.json, projects.json, tasks.json, assignments.json, checkpoints.json.</p>
          <button type="button" className="btn ghost" onClick={() => setSeedAsk(true)}>Reload seed</button>
        </div>
      )}
      {dialog && dialog.mode !== "delete" && draft && (
        <Modal title={dialog.mode === "edit" ? `Edit ${dialog.user.name}` : "Create user"} onClose={() => setDialog(null)}>
          <form className="form-grid" onSubmit={save}>
            <Field label="Name"><input className="control" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
            <Field label="Email"><input className="control" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required /></Field>
            <Field label="Role">
              <select className="control" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}>
                {USER_ROLES.map((role) => <option key={role} value={role}>{label(role)}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="control" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as UserStatus })}>
                <option value="active">Active</option>
                <option value="away">Away</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Title"><input className="control" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="Department"><input className="control" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} /></Field>
            <Field label={dialog.mode === "edit" ? "New password" : "Password"} wide>
              <input className="control" value={draft.password} placeholder={dialog.mode === "edit" ? "Leave blank to keep it" : "At least 4 characters"} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
            </Field>
            {error && <p className="form-error wide">{error}</p>}
            <div className="form-actions wide">
              <button type="button" className="btn ghost" onClick={() => setDialog(null)}>Cancel</button>
              <button className="btn primary" type="submit">Save</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.mode === "delete" && (
        <Confirm
          title={`Delete ${dialog.user.name}`}
          body="Their assignments will be cleared. Projects they own will pass to you."
          confirmLabel="Delete user"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            store.deleteUser(dialog.user.id);
            setDialog(null);
          }}
        />
      )}
      {seedAsk && (
        <Confirm
          title="Reload seed"
          body="This replaces the working copy in this browser with the files in public/assets."
          confirmLabel="Reload seed"
          onCancel={() => setSeedAsk(false)}
          onConfirm={() => {
            setSeedAsk(false);
            void store.resetSeed();
          }}
        />
      )}
    </div>
  );
}
