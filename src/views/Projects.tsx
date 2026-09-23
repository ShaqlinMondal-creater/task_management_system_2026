import { useState } from "react";
import type { FormEvent } from "react";
import { projectRole, scopeFor } from "../access";
import { Field, Icon, IdChip, Pill } from "../components/Bits";
import { Confirm, Modal } from "../components/Modal";
import { COLORS, PROJECT_STATUSES, PRIORITIES, formatDate, label, matches, personName, projectLinks, suggestCode } from "../lib";
import { useStore } from "../store";
import type { Project, Priority, ProjectStatus } from "../types";

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
});

export function Projects({ query }: { query: string }) {
  const store = useStore();
  const { data, sessionUser } = store;
  const [dialog, setDialog] = useState<{ mode: "edit"; project: Project } | { mode: "create" } | { mode: "delete"; project: Project } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data || !sessionUser) return null;

  const admin = sessionUser.role === "admin";
  const scoped = scopeFor(data, sessionUser);
  const projects = scoped.projects.filter((project) =>
    matches(query, [project.name, project.code, project.id, project.description, admin ? personName(data.users, project.ownerId) : ""]),
  );

  const openCreate = () => {
    setDraft(blank(sessionUser.id));
    setCodeTouched(false);
    setError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (project: Project) => {
    const { id: _id, ...rest } = project;
    setDraft(rest);
    setCodeTouched(true);
    setError(null);
    setDialog({ mode: "edit", project });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.code.trim() || !draft.dueDate) {
      setError("Name, code, and due date are required.");
      return;
    }
    const next = { ...draft, name: draft.name.trim(), code: draft.code.trim().toUpperCase() };
    if (dialog?.mode === "edit") store.updateProject(dialog.project.id, next);
    else store.addProject(next);
    setDialog(null);
  };

  return (
    <div className="stack">
      <div className="view-head">
        <p>{admin ? "Each project has an id, an owner, and a list of tasks that point back at it." : "Your project. Other people stay hidden."}</p>
        {admin && (
          <button type="button" className="btn primary" onClick={openCreate}>
            <Icon name="plus" /> New project
          </button>
        )}
      </div>
      {projects.length === 0 && <p className="empty">No projects yet. Add one and it will land in the working copy.</p>}
      <div className="project-grid">
        {projects.map((project) => {
          const tasks = scoped.tasks.filter((task) => task.projectId === project.id);
          const members = projectLinks(admin ? data.assignments : scoped.assignments, project.id);
          const mine = projectRole(data.assignments, project, sessionUser.id);
          return (
            <article key={project.id} className="project-card">
              <span className="stripe" style={{ background: project.color }} />
              <div className="card-top">
                <div>
                  <p className="code">
                    {project.code} <IdChip id={project.id} />
                  </p>
                  <h3>{project.name}</h3>
                </div>
                <Pill value={project.status} />
              </div>
              <p className="clamp">{project.description}</p>
              {admin && (
                <p className="muted">
                  Owner {personName(data.users, project.ownerId)} <IdChip id={project.ownerId} />
                </p>
              )}
              <p className="muted">
                {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                {admin ? ` · ${members.length} ${members.length === 1 ? "person" : "people"}` : mine ? ` · You are the ${label(mine)}` : ""}
                {" · "}
                {formatDate(project.startDate)} – {formatDate(project.dueDate)}
              </p>
              <div className="card-actions">
                <Pill value={project.priority} />
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
              </div>
            </article>
          );
        })}
      </div>

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
              <select className="control" value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}>
                {data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.id})
                  </option>
                ))}
              </select>
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
