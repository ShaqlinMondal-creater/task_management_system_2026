import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { projectRole, scopeFor } from "../access";
import { Field, Icon, IdChip, Pill } from "../components/Bits";
import type { IconName } from "../components/Bits";
import { Confirm, Modal } from "../components/Modal";
import { MultiSelect, Pagination, Table, Tabs } from "../components/System";
import { COLORS, PROJECT_STATUSES, PRIORITIES, TASK_STATUSES, formatDate, label, matches, nextId, personName, projectLinks, suggestCode } from "../lib";
import { useStore } from "../store";
import type { Assignment, Checkpoint, Project, ProjectCredential, Priority, ProjectStatus, Task, User } from "../types";

const PROJECT_ICONS: IconName[] = ["projects", "tasks", "people", "desk", "check", "assign"];
const DETAIL_TABS = ["Overview", "Tasks", "Board", "Calendar", "Members", "Files", "Activity", "Settings"] as const;

type Draft = Omit<Project, "id">;

const blank = (ownerId: string): Draft => ({
  name: "",
  code: "",
  description: "",
  status: "planned",
  priority: "medium",
  startDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  ownerId,
  color: COLORS[0],
  icon: "projects",
  credentials: [],
  notes: "",
});

function taskProgress(tasks: Task[]) {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100);
}

function credentialsOf(project: { credentials?: ProjectCredential[] }) {
  return project.credentials ?? [];
}

export function Projects({ query, intent, onIntent }: { query: string; intent?: "create-task" | "create-project" | "invite" | "my-tasks" | null; onIntent?: () => void }) {
  const store = useStore();
  const { data, sessionUser } = store;
  const [dialog, setDialog] = useState<{ mode: "edit"; project: Project } | { mode: "create" } | { mode: "delete"; project: Project } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Project | null>(null);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [ownerText, setOwnerText] = useState("");
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [panel, setPanel] = useState<{ project: Project; tab: (typeof DETAIL_TABS)[number] } | null>(null);
  const [flow, setFlow] = useState<Project | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"name" | "start" | "end" | "progress" | "status">("name");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (intent !== "create-project" || !sessionUser) return;
    setDraft(blank(sessionUser.id));
    setOwnerText(sessionUser.name);
    setOwnerOpen(false);
    setCodeTouched(false);
    setError(null);
    setMemberIds([]);
    setDialog({ mode: "create" });
    onIntent?.();
  }, [intent]);

  if (!data || !sessionUser) return null;

  const admin = sessionUser.role === "admin";
  const scoped = scopeFor(data, sessionUser);
  const projects = scoped.projects
    .filter((project) => statusFilter === "all" || project.status === statusFilter)
    .filter((project) => matches(query, [project.name, project.code, project.id, project.description, admin ? personName(data.users, project.ownerId) : ""]))
    .sort((a, b) => {
      const tasksFor = (project: Project) => data.tasks.filter((task) => task.projectId === project.id);
      if (sortKey === "start") return a.startDate.localeCompare(b.startDate);
      if (sortKey === "end") return a.dueDate.localeCompare(b.dueDate);
      if (sortKey === "progress") return taskProgress(tasksFor(b)) - taskProgress(tasksFor(a));
      if (sortKey === "status") return a.status.localeCompare(b.status);
      return a.name.localeCompare(b.name);
    });
  const pageProjects = projects.slice(page * 6, page * 6 + 6);

  const openCreate = () => {
    setDraft(blank(sessionUser.id));
    setOwnerText(sessionUser.name);
    setOwnerOpen(false);
    setCodeTouched(false);
    setError(null);
    setMemberIds([]);
    setDialog({ mode: "create" });
  };

  const openEdit = (project: Project, addCredential = false) => {
    const { id: _id, ...rest } = project;
    const credentials = credentialsOf(project);
    setDraft({
      ...rest,
      notes: project.notes ?? "",
      credentials: addCredential
        ? [...credentials, { id: nextId("cr", credentials.map((item) => item.id)), label: "", username: "", secret: "", url: "" }]
        : credentials,
    });
    setOwnerText(personName(data.users, project.ownerId));
    setOwnerOpen(false);
    setCodeTouched(true);
    setError(null);
    setMemberIds(projectLinks(data.assignments, project.id).map((link) => link.userId).filter((id) => id !== project.ownerId));
    setDialog({ mode: "edit", project });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.code.trim() || !draft.dueDate || !ownerText.trim()) {
      setError("Name, code, owner, and due date are required.");
      return;
    }
    const credentials = credentialsOf(draft)
      .map((item) => ({
        ...item,
        label: item.label.trim(),
        username: item.username.trim(),
        secret: item.secret,
        url: item.url.trim(),
      }))
      .filter((item) => item.label || item.username || item.secret || item.url);
    if (credentials.some((item) => !item.label)) {
      setError("Each credential needs a label, or clear the row.");
      return;
    }
    const next = { ...draft, name: draft.name.trim(), code: draft.code.trim().toUpperCase(), credentials };
    if (dialog?.mode === "edit") store.updateProject(dialog.project.id, next, ownerText, memberIds);
    else store.addProject(next, ownerText, memberIds);
    setDialog(null);
  };

  return (
    <div className="stack">
      <div className="view-head">
        <p>{admin ? "Each project can keep credentials, or none. People on the project can open them." : "Your project. Credentials on it are visible to you."}</p>
        {admin && (
          <button type="button" className="btn primary" onClick={openCreate}>
            <Icon name="plus" /> New project
          </button>
        )}
      </div>
      <div className="project-tools">
        <label>
          Status
          <select className="control" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
            <option value="all">All</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{label(status)}</option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select className="control" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}>
            <option value="name">Name</option>
            <option value="start">Start date</option>
            <option value="end">End date</option>
            <option value="progress">Progress</option>
            <option value="status">Status</option>
          </select>
        </label>
        <Tabs
          value={layout}
          onChange={(value) => setLayout(value as "cards" | "table")}
          options={[{ value: "cards", label: "Cards" }, { value: "table", label: "Table" }]}
        />
      </div>
      {projects.length === 0 && <p className="empty">No projects match that filter.</p>}
      {layout === "table" ? (
        <Table head={["Project", "Status", "Progress", "Owner", "Start", "End", ""]}>
          {pageProjects.map((project) => {
            const tasks = data.tasks.filter((task) => task.projectId === project.id);
            const pct = taskProgress(tasks);
            return (
              <tr key={project.id}>
                <td>
                  <strong>{project.name}</strong>
                  <p className="muted">{project.code} · {project.id}</p>
                </td>
                <td><Pill value={project.status} /></td>
                <td>{pct}%</td>
                <td>{personName(data.users, project.ownerId)}</td>
                <td>{formatDate(project.startDate)}</td>
                <td>{formatDate(project.dueDate)}</td>
                <td>
                  <button type="button" className="btn ghost small" onClick={() => setFlow(project)}>
                    Flow chart
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => { setNoteDraft(project.notes ?? ""); setPanel({ project, tab: "Overview" }); }}>
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      ) : (
      <div className="project-grid">
        {pageProjects.map((project) => {
          const tasks = data.tasks.filter((task) => task.projectId === project.id);
          const members = projectLinks(data.assignments, project.id);
          const mine = projectRole(data.assignments, project, sessionUser.id);
          return (
            <article key={project.id} className="project-card">
              <span className="stripe" style={{ background: project.color }} />
              <div className="card-top">
                <h3>
                  <Icon name={(PROJECT_ICONS.includes(project.icon as IconName) ? project.icon : "projects") as IconName} /> {project.name} <span className="code">{project.code} <IdChip id={project.id} /></span>
                </h3>
                <Pill value={project.status} />
              </div>
              <p className="muted project-meta">
                Owner {personName(data.users, project.ownerId)} <IdChip id={project.ownerId} />
                {" · "}Priority {label(project.priority)}
                {!admin && mine ? ` · You are the ${label(mine)}` : ""}
              </p>
              <p className="project-counts">
                <span><strong>{data.checkpoints.filter((item) => item.projectId === project.id).length}</strong> checkpoints</span>
                <span><strong>{tasks.length}</strong> {tasks.length === 1 ? "task" : "tasks"}</span>
                <span><strong>{members.length}</strong> {members.length === 1 ? "person" : "people"}</span>
              </p>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${taskProgress(tasks)}%`, background: project.color }} />
              </div>
              <p className="muted">{taskProgress(tasks)}% done · {formatDate(project.startDate)} – {formatDate(project.dueDate)}</p>
              <p className="clamp">{project.description}</p>
              <div className="card-top">
                <p className="muted">{credentialsOf(project).length === 0 ? "No credentials" : `${credentialsOf(project).length} credential${credentialsOf(project).length === 1 ? "" : "s"}`}</p>
                {admin && (
                  <button type="button" className="btn ghost small" onClick={() => openEdit(project, true)}>
                    + Add
                  </button>
                )}
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setRevealed([]);
                    setShown(project);
                  }}
                >
                  Credentials
                </button>
                {admin && (
                  <button type="button" className="btn ghost small" onClick={() => openEdit(project)}>
                    Edit
                  </button>
                )}
                {admin && (
                  <button type="button" className="btn danger small" onClick={() => setDialog({ mode: "delete", project })}>
                    Remove
                  </button>
                )}
                <button type="button" className="btn ghost small" onClick={() => setFlow(project)}>
                  Flow chart
                </button>
                <button type="button" className="btn ghost small" onClick={() => { setNoteDraft(project.notes ?? ""); setPanel({ project, tab: "Overview" }); }}>
                  Open
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setNoteDraft(project.notes ?? "");
                    setPanel({ project, tab: "Settings" });
                  }}
                >
                  Notes{project.notes?.trim() ? "" : " +"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      )}
      <Pagination page={page} pages={Math.ceil(projects.length / 6)} onPage={setPage} />

      {dialog && dialog.mode !== "delete" && draft && (
        <Modal title={dialog.mode === "edit" ? `Edit project · ${dialog.project.id}` : "New project"} onClose={() => setDialog(null)}>
          <form className="form-grid" onSubmit={save}>
            <Field label="Name" wide>
              <input
                className="control"
                value={draft.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft({ ...draft, name, code: codeTouched ? draft.code : suggestCode(name) });
                }}
                required
              />
            </Field>
            <Field label="Code">
              <input
                className="control"
                value={draft.code}
                onChange={(event) => {
                  setCodeTouched(true);
                  setDraft({ ...draft, code: event.target.value.toUpperCase() });
                }}
                required
              />
            </Field>
            <Field label="Status">
              <select
                className="control"
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectStatus })}
              >
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                className="control"
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {label(priority)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Starts">
              <input className="control" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
            </Field>
            <Field label="Due">
              <input className="control" type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} required />
            </Field>
            <Field label="Owner" wide>
              <div className="search-select">
                <input
                  className="control"
                  value={ownerText}
                  placeholder="Search a name, or type a new one"
                  onFocus={() => setOwnerOpen(true)}
                  onChange={(event) => {
                    setOwnerText(event.target.value);
                    setOwnerOpen(true);
                  }}
                  onBlur={() => window.setTimeout(() => setOwnerOpen(false), 120)}
                />
                {ownerOpen && (
                  <ul className="search-select-menu">
                    {data.users
                      .filter((user) => user.name.toLowerCase().includes(ownerText.trim().toLowerCase()))
                      .map((user) => (
                        <li key={user.id}>
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setOwnerText(user.name);
                              setDraft({ ...draft, ownerId: user.id });
                              setOwnerOpen(false);
                            }}
                          >
                            {user.name} ({user.id})
                          </button>
                        </li>
                      ))}
                    {ownerText.trim() && !data.users.some((user) => user.name.toLowerCase() === ownerText.trim().toLowerCase()) && (
                      <li>
                        <button type="button" onMouseDown={(event) => event.preventDefault()}>
                          Save “{ownerText.trim()}” as a new owner
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </Field>
            <Field label="Team members" wide>
              <MultiSelect
                label="Team members"
                values={memberIds}
                onChange={setMemberIds}
                options={data.users.filter((user) => user.id !== draft.ownerId).map((user) => ({ value: user.id, label: `${user.name} · ${label(user.role)}` }))}
              />
            </Field>
            <Field label="Icon" wide>
              <div className="icon-picks">
                {PROJECT_ICONS.map((name) => (
                  <button key={name} type="button" className={draft.icon === name ? "icon-pick on" : "icon-pick"} aria-label={name} onClick={() => setDraft({ ...draft, icon: name })}>
                    <Icon name={name} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Color" wide>
              <div className="swatches">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={draft.color === color ? "swatch on" : "swatch"}
                    style={{ background: color }}
                    aria-label={color}
                    onClick={() => setDraft({ ...draft, color })}
                  />
                ))}
              </div>
            </Field>
            <Field label="Credentials" wide>
              <div className="stack">
                <p className="muted">Leave this empty when the project has no logins. Add a row only for a real account.</p>
                {credentialsOf(draft).map((item) => (
                  <div key={item.id} className="cred-row">
                    <input className="control" placeholder="Label" value={item.label} onChange={(event) => setDraft({ ...draft, credentials: credentialsOf(draft).map((row) => row.id === item.id ? { ...row, label: event.target.value } : row) })} />
                    <input className="control" placeholder="Username" value={item.username} onChange={(event) => setDraft({ ...draft, credentials: credentialsOf(draft).map((row) => row.id === item.id ? { ...row, username: event.target.value } : row) })} />
                    <input className="control" placeholder="Password" value={item.secret} onChange={(event) => setDraft({ ...draft, credentials: credentialsOf(draft).map((row) => row.id === item.id ? { ...row, secret: event.target.value } : row) })} />
                    <input className="control" placeholder="https://" value={item.url} onChange={(event) => setDraft({ ...draft, credentials: credentialsOf(draft).map((row) => row.id === item.id ? { ...row, url: event.target.value } : row) })} />
                    <button type="button" className="btn ghost small" onClick={() => setDraft({ ...draft, credentials: credentialsOf(draft).filter((row) => row.id !== item.id) })}>
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      credentials: [...credentialsOf(draft), { id: nextId("cr", credentialsOf(draft).map((item) => item.id)), label: "", username: "", secret: "", url: "" }],
                    })
                  }
                >
                  Add credential
                </button>
              </div>
            </Field>
            <Field label="Description" wide>
              <textarea className="control" rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            {error && <p className="form-error wide">{error}</p>}
            <div className="form-actions wide">
              <button type="button" className="btn ghost" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="btn primary" type="submit">
                Save project
              </button>
            </div>
          </form>
        </Modal>
      )}

      {shown && (
        <Modal title={`${shown.name} credentials`} onClose={() => setShown(null)}>
          {credentialsOf(shown).length === 0 && <p className="confirm-copy">This project has no credentials.</p>}
          <ul className="cred-list">
            {credentialsOf(shown).map((item) => {
              const open = revealed.includes(item.id);
              return (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  <p>{item.username || "No username"}</p>
                  <p>{open ? item.secret || "No password" : "••••••••"}</p>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setRevealed(open ? revealed.filter((id) => id !== item.id) : [...revealed, item.id])}
                  >
                    {open ? "Hide" : "Show"}
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}

      {panel && (
        <Modal title={panel.project.name} onClose={() => setPanel(null)}>
          <ProjectDetail
            project={panel.project}
            tab={panel.tab}
            onTab={(tab) => setPanel({ project: panel.project, tab })}
            tasks={data.tasks.filter((task) => task.projectId === panel.project.id)}
            members={projectLinks(data.assignments, panel.project.id)}
            users={data.users}
            checkpoints={data.checkpoints.filter((item) => item.projectId === panel.project.id)}
            assignments={data.assignments.filter((item) => item.projectId === panel.project.id)}
            admin={admin}
            noteDraft={noteDraft}
            onNote={setNoteDraft}
            onSaveNotes={() => {
              if (admin) store.updateProject(panel.project.id, { notes: noteDraft.trim() });
              setPanel(null);
            }}
            onEdit={() => {
              const current = panel.project;
              setPanel(null);
              openEdit(current);
            }}
          />
        </Modal>
      )}

      {dialog?.mode === "delete" && (
        <Confirm
          title={`Remove ${dialog.project.name}`}
          body="This removes the project, its tasks, and every assignment that points at them."
          confirmLabel="Remove project"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            store.deleteProject(dialog.project.id);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function ProjectDetail({
  project,
  tab,
  onTab,
  tasks,
  members,
  users,
  checkpoints,
  assignments,
  admin,
  noteDraft,
  onNote,
  onSaveNotes,
  onEdit,
}: {
  project: Project;
  tab: (typeof DETAIL_TABS)[number];
  onTab: (tab: (typeof DETAIL_TABS)[number]) => void;
  tasks: Task[];
  members: Assignment[];
  users: User[];
  checkpoints: Checkpoint[];
  assignments: Assignment[];
  admin: boolean;
  noteDraft: string;
  onNote: (value: string) => void;
  onSaveNotes: () => void;
  onEdit: () => void;
}) {
  const pct = taskProgress(tasks);
  const files = [
    ...credentialsOf(project).map((item) => ({ id: item.id, title: item.label || "Credential", detail: item.username || item.url || "Login" })),
    ...checkpoints.filter((item) => item.link || item.photo).map((item) => ({ id: item.id, title: item.label, detail: item.link || "Photo" })),
  ];
  const activity = assignments
    .map((item) => ({ id: item.id, when: item.assignedAt, title: `${personName(users, item.userId)} · ${label(item.role)}`, detail: item.kind === "task" ? "Task assignment" : "Project member" }))
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, 8);
  const byDate = tasks.reduce<Record<string, Task[]>>((map, task) => {
    map[task.dueDate] = [...(map[task.dueDate] ?? []), task];
    return map;
  }, {});

  return (
    <div className="stack">
      <Tabs value={tab} onChange={(value) => onTab(value as (typeof DETAIL_TABS)[number])} options={DETAIL_TABS.map((item) => ({ value: item, label: item }))} />
      {tab === "Overview" && (
        <div className="project-detail">
          <div className="progress" aria-hidden="true"><span style={{ width: `${pct}%`, background: project.color }} /></div>
          <p className="muted">{pct}% of tasks done</p>
          <div className="fact-grid">
            <div><span>Status</span><strong>{label(project.status)}</strong></div>
            <div><span>Priority</span><strong>{label(project.priority)}</strong></div>
            <div><span>Owner</span><strong>{personName(users, project.ownerId)}</strong></div>
            <div><span>Start</span><strong>{formatDate(project.startDate)}</strong></div>
            <div><span>End</span><strong>{formatDate(project.dueDate)}</strong></div>
          </div>
          <p>{project.description || "No description."}</p>
        </div>
      )}
      {tab === "Tasks" && (
        <ul className="line-list">
          {tasks.length === 0 && <li>No tasks on this project.</li>}
          {tasks.map((task) => (
            <li key={task.id}><strong>{task.title}</strong><span>{label(task.status)} · {formatDate(task.dueDate)}</span></li>
          ))}
        </ul>
      )}
      {tab === "Board" && (
        <div className="mini-board">
          {TASK_STATUSES.map((status) => (
            <section key={status}>
              <h3>{label(status)}</h3>
              {tasks.filter((task) => task.status === status).map((task) => (
                <p key={task.id}>{task.title}</p>
              ))}
            </section>
          ))}
        </div>
      )}
      {tab === "Calendar" && (
        <ul className="line-list">
          {Object.keys(byDate).sort().map((date) => (
            <li key={date}><strong>{formatDate(date)}</strong><span>{byDate[date].map((task) => task.title).join(", ")}</span></li>
          ))}
          {tasks.length === 0 && <li>No dated tasks.</li>}
        </ul>
      )}
      {tab === "Members" && (
        <ul className="line-list">
          {members.map((link) => (
            <li key={link.id}><strong>{personName(users, link.userId)}</strong><span>{label(link.role)} · {link.userId}</span></li>
          ))}
        </ul>
      )}
      {tab === "Files" && (
        <ul className="line-list">
          {files.length === 0 && <li>No credentials or reference files.</li>}
          {files.map((file) => (
            <li key={file.id}><strong>{file.title}</strong><span>{file.detail}</span></li>
          ))}
        </ul>
      )}
      {tab === "Activity" && (
        <ul className="line-list">
          {activity.length === 0 && <li>No activity yet.</li>}
          {activity.map((item) => (
            <li key={item.id}><strong>{item.title}</strong><span>{item.detail} · {formatDate(item.when)}</span></li>
          ))}
        </ul>
      )}
      {tab === "Settings" && (
        <form className="stack" onSubmit={(event) => { event.preventDefault(); onSaveNotes(); }}>
          <p className="muted">{project.code} · {project.id}</p>
          <textarea className="control" rows={4} value={noteDraft} onChange={(event) => onNote(event.target.value)} disabled={!admin} placeholder="Notes for this project" />
          {admin && (
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={onEdit}>Edit project</button>
              <button type="submit" className="btn primary">Save notes</button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
