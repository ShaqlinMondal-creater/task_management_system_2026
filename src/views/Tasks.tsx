import { useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { scopeFor } from "../access";
import { Avatar, Field, Icon, IdChip, Pill } from "../components/Bits";
import { Confirm, Modal } from "../components/Modal";
import { PRIORITIES, TASK_STATUSES, formatDate, isOverdue, label, matches, personName, taskLinks } from "../lib";
import { useStore } from "../store";
import type { Priority, Task, TaskStatus } from "../types";

type Draft = {
  title: string;
  description: string;
  projectId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  assigneeIds: string[];
  checkpointIds: string[];
};

export function Tasks({ query }: { query: string }) {
  const store = useStore();
  const { data, sessionUser } = store;
  const [projectFilter, setProjectFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dialog, setDialog] = useState<{ mode: "edit"; task: Task } | { mode: "create"; status: TaskStatus } | { mode: "delete"; task: Task } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data || !sessionUser) return null;

  const admin = sessionUser.role === "admin";
  const reviewer = sessionUser.role === "reviewer";
  const scoped = scopeFor(data, sessionUser);
  const columns = reviewer ? (["review", "done"] as const) : TASK_STATUSES;

  const visible = scoped.tasks.filter((task) => {
    const project = scoped.projects.find((item) => item.id === task.projectId);
    const people = taskLinks(scoped.assignments, task.id)
      .map((link) => scoped.users.find((user) => user.id === link.userId))
      .filter((user) => user !== undefined);
    if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
    if (personFilter === "open" && people.length > 0) return false;
    if (personFilter !== "all" && personFilter !== "open" && !people.some((user) => user.id === personFilter)) return false;
    return matches(query, [task.title, task.id, task.description, project?.name, project?.code, ...people.map((user) => user.name)]);
  });

  const openCreate = (status: TaskStatus) => {
    setDraft({
      title: "",
      description: "",
      projectId: projectFilter !== "all" ? projectFilter : (scoped.projects[0]?.id ?? ""),
      status,
      priority: "medium",
      dueDate: "",
      assigneeIds: [],
      checkpointIds: [],
    });
    setError(null);
    setDialog({ mode: "create", status });
  };

  const openEdit = (task: Task) => {
    setDraft({
      title: task.title,
      description: task.description,
      projectId: task.projectId,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeIds: taskLinks(scoped.assignments, task.id).map((link) => link.userId),
      checkpointIds: task.checkpointIds,
    });
    setError(null);
    setDialog({ mode: "edit", task });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.title.trim() || !draft.projectId || !draft.dueDate) {
      setError("Title, project, and due date are required.");
      return;
    }
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      projectId: draft.projectId,
      status: draft.status,
      priority: draft.priority,
      dueDate: draft.dueDate,
      checkpointIds: draft.checkpointIds,
    };
    const assignees = admin ? draft.assigneeIds : [sessionUser.id];
    if (dialog?.mode === "edit") store.updateTask(dialog.task.id, payload, assignees);
    else store.addTask(payload, assignees);
    setDialog(null);
  };

  const onDrop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/task-id");
    if (id) store.updateTask(id, { status });
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="stack">
      <div className="view-head">
        <p>
          {admin
            ? "A task holds one checkpoint or several from the project list. Hand each task to a member or a reviewer."
            : reviewer
              ? "Your review tasks. Each one holds the checkpoints the admin gave you."
              : "Your tasks only. Each one holds the checkpoints the admin gave you."}
        </p>
        {!reviewer && (
          <button type="button" className="btn primary" onClick={() => openCreate("todo")} disabled={scoped.projects.length === 0}>
            <Icon name="plus" /> New task
          </button>
        )}
      </div>
      {!reviewer && <div className="filters">
        <label>
          Project
          <select className="control" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">All projects</option>
            {scoped.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <label>
            Person
            <select className="control" value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}>
              <option value="all">Anyone</option>
              <option value="open">Unassigned</option>
              {data.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>}
      {scoped.projects.length === 0 && <p className="empty">Add a project before creating tasks.</p>}
      <div className="board-wrap">
        <div className="board">
          {columns.map((status) => {
            const column = visible.filter((task) => task.status === status);
            return (
              <section
                key={status}
                className={over === status ? `column column-${status} over` : `column column-${status}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(status);
                }}
                onDragLeave={() => setOver((current) => (current === status ? null : current))}
                onDrop={(event) => onDrop(event, status)}
              >
                <header>
                  <h2>{label(status)}</h2>
                  <span>{column.length}</span>
                  {!reviewer && (
                    <button type="button" className="icon-btn" aria-label={`Add ${label(status)} task`} onClick={() => openCreate(status)}>
                      +
                    </button>
                  )}
                </header>
                {column.map((task) => {
                  const project = scoped.projects.find((item) => item.id === task.projectId);
                  const people = taskLinks(scoped.assignments, task.id);
                  const late = isOverdue(task.dueDate, task.status);
                  return (
                    <article
                      key={task.id}
                      className={dragging === task.id ? "task-card dragging" : "task-card"}
                      draggable
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(task)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") openEdit(task);
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/task-id", task.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(task.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    >
                      <div className="card-top">
                        <span className="dot" style={{ background: project?.color ?? "#8a8175" }} />
                        <IdChip id={task.id} />
                        <Pill value={task.priority} />
                      </div>
                      <h3>{task.title}</h3>
                      <ul className="task-points">
                        {task.checkpointIds.slice(0, 3).map((id) => {
                          const point = data.checkpoints.find((item) => item.id === id);
                          return <li key={id}>{point?.label ?? id}</li>;
                        })}
                        {task.checkpointIds.length > 3 && <li className="more">+{task.checkpointIds.length - 3}</li>}
                      </ul>
                      <p className={late ? "muted overdue" : "muted"}>
                        {project?.code ?? task.projectId} · {formatDate(task.dueDate)}
                        {late ? " · overdue" : ""}
                      </p>
                      <div className="avatar-row">
                        {people.length === 0 && <span className="muted">Unassigned</span>}
                        {people.map((link) => {
                          const user = scoped.users.find((item) => item.id === link.userId);
                          return user ? <Avatar key={link.id} id={user.id} name={user.name} /> : null;
                        })}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      {dialog && dialog.mode !== "delete" && draft && (
        <Modal
          title={dialog.mode === "edit" ? `Edit task · ${dialog.task.id}` : `New ${label(draft.status).toLowerCase()} task`}
          onClose={() => setDialog(null)}
        >
          <form className="form-grid" onSubmit={save}>
            <Field label="Title" wide>
              <input className="control" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required disabled={reviewer} />
            </Field>
            <Field label="Project">
              <select className="control" value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} disabled={reviewer}>
                {scoped.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name} ({project.id})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className="control" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>
                {(reviewer ? (["review", "done"] as const) : TASK_STATUSES).map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className="control" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })} disabled={reviewer}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {label(priority)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due">
              <input className="control" type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} required disabled={reviewer} />
            </Field>
            <Field label="Description" wide>
              <textarea className="control" rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={reviewer} />
            </Field>
            <Field label="Checkpoints" wide>
              {admin ? (
                <div className="point-pick">
                  {[...new Set(data.checkpoints.filter((item) => item.projectId === draft.projectId).map((item) => item.phase))].map((phase) => (
                    <details key={phase} open={data.checkpoints.some((item) => item.phase === phase && draft.checkpointIds.includes(item.id))}>
                      <summary>{phase}</summary>
                      <div className="checks">
                        {data.checkpoints
                          .filter((item) => item.projectId === draft.projectId && item.phase === phase)
                          .map((item) => {
                            const checked = draft.checkpointIds.includes(item.id);
                            const elsewhere = data.tasks.find((task) => (dialog.mode !== "edit" || task.id !== dialog.task.id) && task.checkpointIds.includes(item.id));
                            return (
                              <label key={item.id} className="check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setDraft({
                                      ...draft,
                                      checkpointIds: checked
                                        ? draft.checkpointIds.filter((id) => id !== item.id)
                                        : [...draft.checkpointIds, item.id],
                                    })
                                  }
                                />
                                {item.label}
                                {elsewhere ? ` · on ${elsewhere.title}` : ""}
                              </label>
                            );
                          })}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <ul className="task-points">
                  {draft.checkpointIds.map((id) => (
                    <li key={id}>{data.checkpoints.find((item) => item.id === id)?.label ?? id}</li>
                  ))}
                </ul>
              )}
            </Field>
            {admin && <Field label="Assignees" wide>
              <div className="checks">
                {data.users.map((user) => {
                  const checked = draft.assigneeIds.includes(user.id);
                  return (
                    <label key={user.id} className="check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            assigneeIds: checked
                              ? draft.assigneeIds.filter((id) => id !== user.id)
                              : [...draft.assigneeIds, user.id],
                          })
                        }
                      />
                      {user.name} ({user.id})
                    </label>
                  );
                })}
              </div>
            </Field>}
            {admin && dialog.mode === "edit" && (
              <p className="muted wide">Opened by {personName(data.users, dialog.task.createdBy)} on {formatDate(dialog.task.createdAt)}.</p>
            )}
            {error && <p className="form-error wide">{error}</p>}
            <div className="form-actions wide">
              {admin && dialog.mode === "edit" && (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setDialog({ mode: "delete", task: dialog.task })}
                >
                  Remove
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button className="btn primary" type="submit">
                Save task
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.mode === "delete" && (
        <Confirm
          title={`Remove ${dialog.task.title}`}
          body="This removes the task and the assignment rows that point at it."
          confirmLabel="Remove task"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            store.deleteTask(dialog.task.id);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
