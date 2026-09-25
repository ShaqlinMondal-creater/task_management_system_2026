import { useEffect, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { scopeFor } from "../access";
import { Avatar, Field, Icon, IdChip, Pill, SearchSelect } from "../components/Bits";
import { CheckpointView } from "../components/CheckpointView";
import { Confirm, Modal } from "../components/Modal";
import { DatePicker, Drawer, MultiSelect, Pagination, Table, Tabs } from "../components/System";
import { PRIORITIES, TASK_STATUSES, formatDate, formatWhen, isOverdue, label, matches, nextId, nowStamp, personName, taskLinks, todayISO } from "../lib";
import { useStore } from "../store";
import { useToast } from "../toast";
import type { Assignment, Checkpoint, Priority, Project, Task, TaskFile, TaskStatus, User } from "../types";

type Draft = {
  title: string;
  description: string;
  projectId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  startDate: string;
  assigneeIds: string[];
  checkpointIds: string[];
  tags: string;
  estimate: string;
  actual: string;
  parentId: string;
  blockedByIds: string[];
  blocksIds: string[];
  relatedIds: string[];
  customStatus: string;
  attachments: TaskFile[];
};

export function Tasks({ query, intent, onIntent }: { query: string; intent?: "create-task" | "create-project" | "invite" | "my-tasks" | null; onIntent?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { data, sessionUser } = store;
  const [projectFilter, setProjectFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState<"all" | "Frontend" | "Backend">("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dialog, setDialog] = useState<{ mode: "edit"; task: Task } | { mode: "create"; status: TaskStatus } | { mode: "delete"; task: Task } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Checkpoint | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [mode, setMode] = useState<"list" | "board" | "calendar" | "timeline" | "gantt" | "table" | "workload" | "tree">("board");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("");
  const [createdFilter, setCreatedFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"newest" | "oldest" | "due" | "priority" | "updated" | "alpha">("newest");
  const [saved, setSaved] = useState<{ name: string; value: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("northline.taskFilters") || "[]");
    } catch {
      return [];
    }
  });
  const [filterName, setFilterName] = useState("");

  useEffect(() => {
    if (!intent || !data || !sessionUser) return;
    if (intent === "create-task" && sessionUser.role !== "reviewer" && sessionUser.role !== "viewer") {
      setDraft({
        title: "",
        description: "",
        projectId: data.projects[0]?.id ?? "",
        status: "todo",
        priority: "medium",
        dueDate: "",
        startDate: "",
        assigneeIds: [],
        checkpointIds: [],
        tags: "",
        estimate: "",
        actual: "",
        parentId: "",
        blockedByIds: [],
        blocksIds: [],
        relatedIds: [],
        customStatus: "",
        attachments: [],
      });
      setError(null);
      setDialog({ mode: "create", status: "todo" });
    }
    if (intent === "my-tasks") setPersonFilter(sessionUser.id);
    onIntent?.();
  }, [intent]);

  if (!data || !sessionUser) return null;

  const admin = sessionUser.role === "admin";
  const reviewer = sessionUser.role === "reviewer";
  const viewer = sessionUser.role === "viewer";
  const scoped = scopeFor(data, sessionUser);
  const columns = reviewer ? (["review", "done"] as const) : TASK_STATUSES;

  const visible = scoped.tasks.filter((task) => {
    const project = scoped.projects.find((item) => item.id === task.projectId);
    const people = taskLinks(scoped.assignments, task.id)
      .map((link) => scoped.users.find((user) => user.id === link.userId))
      .filter((user) => user !== undefined);
    if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
    if (areaFilter !== "all") {
      const areas = task.checkpointIds.map((id) => data.checkpoints.find((item) => item.id === id)?.area);
      if (!areas.includes(areaFilter)) return false;
    }
    if (personFilter === "open" && people.length > 0) return false;
    if (personFilter !== "all" && personFilter !== "open" && !people.some((user) => user.id === personFilter)) return false;
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (priorityFilter === "high+" && task.priority !== "high" && task.priority !== "urgent") return false;
    if (priorityFilter !== "all" && priorityFilter !== "high+" && task.priority !== priorityFilter) return false;
    if (dueFilter === "overdue" && !isOverdue(task.dueDate, task.status)) return false;
    if (dueFilter === "week") {
      const end = shiftDate(todayISO(), 7);
      if (task.status === "done" || task.dueDate < todayISO() || task.dueDate > end) return false;
    }
    if (dueFilter && dueFilter !== "overdue" && dueFilter !== "week" && task.dueDate > dueFilter) return false;
    if (createdFilter && task.createdAt.slice(0, 10) < createdFilter) return false;
    if (tagFilter.trim() && !(task.tags ?? []).some((tag) => tag.toLowerCase().includes(tagFilter.trim().toLowerCase()))) return false;
    if (creatorFilter !== "all" && task.createdBy !== creatorFilter) return false;
    return matches(query, [task.title, task.id, task.description, task.customStatus, ...(task.tags ?? []), project?.name, project?.code, ...people.map((user) => user.name)]);
  }).sort((a, b) => {
    const rank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    if (sortKey === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (sortKey === "due") return a.dueDate.localeCompare(b.dueDate);
    if (sortKey === "priority") return rank[a.priority] - rank[b.priority];
    if (sortKey === "updated") return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
    if (sortKey === "alpha") return a.title.localeCompare(b.title);
    return b.createdAt.localeCompare(a.createdAt);
  });

  const currentFilters = JSON.stringify({ projectFilter, personFilter, areaFilter, statusFilter, priorityFilter, dueFilter, createdFilter, tagFilter, creatorFilter, sortKey });
  const applyFilters = (value: string) => {
    const next = JSON.parse(value) as Record<string, string>;
    setProjectFilter(next.projectFilter ?? "all");
    setPersonFilter(next.personFilter ?? "all");
    setAreaFilter((next.areaFilter as "all" | "Frontend" | "Backend") ?? "all");
    setStatusFilter(next.statusFilter ?? "all");
    setPriorityFilter(next.priorityFilter ?? "all");
    setDueFilter(next.dueFilter ?? "");
    setCreatedFilter(next.createdFilter ?? "");
    setTagFilter(next.tagFilter ?? "");
    setCreatorFilter(next.creatorFilter ?? "all");
    setSortKey((next.sortKey as typeof sortKey) ?? "newest");
  };
  const clearFilters = () => applyFilters(JSON.stringify({}));

  const openCreate = (status: TaskStatus) => {
    setDraft({
      title: "",
      description: "",
      projectId: projectFilter !== "all" ? projectFilter : (scoped.projects[0]?.id ?? ""),
      status,
      priority: "medium",
      dueDate: "",
      startDate: "",
      assigneeIds: [],
      checkpointIds: [],
      tags: "",
      estimate: "",
      actual: "",
      parentId: "",
      blockedByIds: [],
      blocksIds: [],
      relatedIds: [],
      customStatus: "",
      attachments: [],
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
      startDate: task.startDate ?? "",
      assigneeIds: taskLinks(scoped.assignments, task.id).map((link) => link.userId),
      checkpointIds: task.checkpointIds,
      tags: (task.tags ?? []).join(", "),
      estimate: task.estimate ?? "",
      actual: task.actual ?? "",
      parentId: task.parentId ?? "",
      blockedByIds: task.blockedByIds ?? [],
      blocksIds: task.blocksIds ?? [],
      relatedIds: task.relatedIds ?? [],
      customStatus: task.customStatus ?? "",
      attachments: task.attachments ?? [],
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
      startDate: draft.startDate,
      checkpointIds: draft.checkpointIds,
      tags: draft.tags.split(",").map((item) => item.trim()).filter(Boolean),
      estimate: draft.estimate.trim(),
      actual: draft.actual.trim(),
      parentId: draft.parentId || null,
      blockedByIds: draft.blockedByIds,
      blocksIds: draft.blocksIds,
      relatedIds: draft.relatedIds,
      customStatus: draft.customStatus.trim(),
      attachments: draft.attachments.filter((item) => item.name.trim() || item.url.trim()),
    };
    const assignees = admin ? draft.assigneeIds : [sessionUser.id];
    if (dialog?.mode === "edit") {
      store.updateTask(dialog.task.id, payload, assignees);
      toast("Task saved");
    } else {
      store.addTask(payload, assignees);
      toast("Task created");
    }
    setDialog(null);
  };

  const onDrop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/task-id");
    if (id) {
      store.updateTask(id, { status });
      toast("Task updated");
    }
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
        {!reviewer && !viewer && (
          <button type="button" className="btn primary" onClick={() => openCreate("todo")} disabled={scoped.projects.length === 0}>
            <Icon name="plus" /> New task
          </button>
        )}
      </div>
      <div className="filters">
        {!reviewer && (
        <label>
          Project
          <SearchSelect
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="All projects"
            options={[
              { value: "all", label: "All projects" },
              ...scoped.projects.map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` })),
            ]}
          />
        </label>
        )}
        {admin && (
          <label>
            Assignee
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
        <label>
          Area
          <select className="control" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as "all" | "Frontend" | "Backend")}>
            <option value="all">All</option>
            <option value="Frontend">Frontend</option>
            <option value="Backend">Backend</option>
          </select>
        </label>
        <label>
          Status
          <select className="control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All</option>
            {columns.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
        <label>
          Priority
          <select className="control" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
            <option value="all">All</option>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
          </select>
        </label>
        <label>
          Due by
          <input className="control" type="date" value={dueFilter === "overdue" || dueFilter === "week" ? "" : dueFilter} onChange={(event) => setDueFilter(event.target.value)} />
        </label>
        <label>
          Created from
          <input className="control" type="date" value={createdFilter} onChange={(event) => setCreatedFilter(event.target.value)} />
        </label>
        <label>
          Tags
          <input className="control" value={tagFilter} placeholder="Tag" onChange={(event) => setTagFilter(event.target.value)} />
        </label>
        {admin && (
          <label>
            Creator
            <select className="control" value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)}>
              <option value="all">Anyone</option>
              {data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
        )}
        <label>
          Sort
          <select className="control" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="updated">Updated</option>
            <option value="alpha">Alphabetical</option>
          </select>
        </label>
      </div>
      <div className="filter-presets">
        <button type="button" className="btn ghost small" onClick={() => { clearFilters(); setPersonFilter(sessionUser.id); setDueFilter("overdue"); }}>My overdue tasks</button>
        <button type="button" className="btn ghost small" onClick={() => { clearFilters(); setPriorityFilter("high+"); }}>High priority</button>
        <button type="button" className="btn ghost small" onClick={() => { clearFilters(); setDueFilter("week"); }}>Due this week</button>
        <button type="button" className="btn ghost small" onClick={() => { clearFilters(); setPersonFilter("open"); }}>Unassigned</button>
        <button type="button" className="btn ghost small" onClick={clearFilters}>Clear</button>
        <input className="control" value={filterName} placeholder="Filter name" onChange={(event) => setFilterName(event.target.value)} />
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            const name = filterName.trim();
            if (!name) return;
            const next = [...saved.filter((item) => item.name !== name), { name, value: currentFilters }];
            setSaved(next);
            localStorage.setItem("northline.taskFilters", JSON.stringify(next));
            setFilterName("");
          }}
        >
          Save filter
        </button>
        {saved.map((item) => (
          <button key={item.name} type="button" className="btn ghost small" onClick={() => applyFilters(item.value)}>{item.name}</button>
        ))}
      </div>
      <Tabs
        value={mode}
        onChange={(value) => setMode(value as typeof mode)}
        options={[
          { value: "list", label: "List" },
          { value: "tree", label: "Tree" },
          { value: "board", label: "Board" },
          { value: "calendar", label: "Calendar" },
          { value: "timeline", label: "Timeline" },
          { value: "gantt", label: "Gantt" },
          { value: "table", label: "Table" },
          { value: "workload", label: "Workload" },
        ]}
      />
      {scoped.projects.length === 0 && <p className="empty">Add a project before creating tasks.</p>}
      {mode !== "board" && (
        <TaskModes
          mode={mode}
          tasks={visible}
          month={month}
          onMonth={setMonth}
          projects={scoped.projects}
          users={data.users}
          assignments={scoped.assignments}
          onOpen={setDetailId}
        />
      )}
      {mode === "board" && (
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
                  {!reviewer && !viewer && (
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
                      onClick={() => setDetailId(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setDetailId(task.id);
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
                      <p className="muted">{task.checkpointIds.length} checkpoint{task.checkpointIds.length === 1 ? "" : "s"} on this task</p>
                      <ul className="point-brief">
                        {task.checkpointIds.map((id) => {
                          const point = data.checkpoints.find((item) => item.id === id);
                          const state = point?.state ?? "open";
                          return (
                            <li key={id} className={`state-${state}`}>
                              <button
                                type="button"
                                className="text-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (point) setViewing(point);
                                }}
                              >
                                <span className="check-mark" />
                                <span>{point?.label ?? id}</span>
                                <em>{state === "done" ? "Done" : state === "partial" ? "Partial" : "Not started"}</em>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <p className={late ? "muted overdue" : "muted"}>
                        {project?.code ?? task.projectId} · {formatDate(task.dueDate)}
                        {late ? " · overdue" : ""}
                      </p>
                      {(task.updatedAt || task.doneAt) && (
                        <p className="muted">
                          {task.updatedAt ? `Updated ${formatWhen(task.updatedAt)}` : ""}
                          {task.updatedAt && task.doneAt ? " · " : ""}
                          {task.doneAt ? `Done ${formatWhen(task.doneAt)}` : ""}
                        </p>
                      )}
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
      )}

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
            <Field label="Start">
              <DatePicker label="Start date" value={draft.startDate} disabled={reviewer} onChange={(value) => setDraft({ ...draft, startDate: value })} />
            </Field>
            <Field label="Due">
              <DatePicker label="Due date" value={draft.dueDate} required disabled={reviewer} onChange={(value) => setDraft({ ...draft, dueDate: value })} />
            </Field>
            <Field label="Creator">
              <input className="control" value={dialog.mode === "edit" ? personName(data.users, dialog.task.createdBy) : sessionUser.name} disabled />
            </Field>
            <Field label="Custom status">
              <input className="control" value={draft.customStatus} placeholder="Optional extra status" onChange={(event) => setDraft({ ...draft, customStatus: event.target.value })} disabled={reviewer} />
            </Field>
            <Field label="Tags" wide>
              <input className="control" value={draft.tags} placeholder="design, api" onChange={(event) => setDraft({ ...draft, tags: event.target.value })} disabled={reviewer} />
            </Field>
            <Field label="Estimated time">
              <input className="control" value={draft.estimate} placeholder="4h" onChange={(event) => setDraft({ ...draft, estimate: event.target.value })} disabled={reviewer} />
            </Field>
            <Field label="Actual time">
              <input className="control" value={draft.actual} placeholder="5h" onChange={(event) => setDraft({ ...draft, actual: event.target.value })} disabled={reviewer} />
            </Field>
            <Field label="Parent task" wide>
              <select className="control" value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })} disabled={reviewer}>
                <option value="">None</option>
                {data.tasks.filter((task) => task.projectId === draft.projectId && (dialog.mode !== "edit" || task.id !== dialog.task.id)).map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
            </Field>
            <Field label="Blocked by" wide>
              <MultiSelect
                label="Blocked by"
                values={draft.blockedByIds}
                onChange={(blockedByIds) => setDraft({ ...draft, blockedByIds })}
                options={data.tasks.filter((task) => task.projectId === draft.projectId && (dialog.mode !== "edit" || task.id !== dialog.task.id)).map((task) => ({ value: task.id, label: task.title }))}
              />
            </Field>
            <Field label="Blocks" wide>
              <MultiSelect
                label="Blocks"
                values={draft.blocksIds}
                onChange={(blocksIds) => setDraft({ ...draft, blocksIds })}
                options={data.tasks.filter((task) => task.projectId === draft.projectId && (dialog.mode !== "edit" || task.id !== dialog.task.id)).map((task) => ({ value: task.id, label: task.title }))}
              />
            </Field>
            <Field label="Related task" wide>
              <MultiSelect
                label="Related task"
                values={draft.relatedIds}
                onChange={(relatedIds) => setDraft({ ...draft, relatedIds })}
                options={data.tasks.filter((task) => task.projectId === draft.projectId && (dialog.mode !== "edit" || task.id !== dialog.task.id)).map((task) => ({ value: task.id, label: task.title }))}
              />
            </Field>
            <Field label="Attachments" wide>
              <div className="stack">
                {draft.attachments.map((item) => (
                  <div key={item.id} className="cred-row">
                    <input className="control" placeholder="Name" value={item.name} disabled={reviewer} onChange={(event) => setDraft({ ...draft, attachments: draft.attachments.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row) })} />
                    <input className="control" placeholder="https://" value={item.url} disabled={reviewer} onChange={(event) => setDraft({ ...draft, attachments: draft.attachments.map((row) => row.id === item.id ? { ...row, url: event.target.value } : row) })} />
                    {!reviewer && <button type="button" className="btn ghost small" onClick={() => setDraft({ ...draft, attachments: draft.attachments.filter((row) => row.id !== item.id) })}>Remove</button>}
                  </div>
                ))}
                {!reviewer && (
                  <button type="button" className="btn ghost small" onClick={() => setDraft({ ...draft, attachments: [...draft.attachments, { id: nextId("f", draft.attachments.map((item) => item.id)), name: "", url: "" }] })}>
                    Add attachment
                  </button>
                )}
              </div>
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
                                  disabled={Boolean(elsewhere)}
                                  onChange={() => {
                                    setDraft({
                                      ...draft,
                                      checkpointIds: checked
                                        ? draft.checkpointIds.filter((id) => id !== item.id)
                                        : [...draft.checkpointIds, item.id],
                                    });
                                  }}
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
                <div className="point-detail">
                  <p className="muted">These are the checkpoints on this task.</p>
                  {draft.checkpointIds.map((id) => data.checkpoints.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item)).reduce<string[]>((phases, item) => (phases.includes(item.phase) ? phases : [...phases, item.phase]), []).map((phase) => (
                    <div key={phase}>
                      <h3>{phase}</h3>
                      <ul>
                        {draft.checkpointIds.map((id) => data.checkpoints.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => item != null && item.phase === phase).map((item) => (
                          <li key={item.id} className={`state-${item.state}`}>
                            <button type="button" className="text-btn" onClick={() => setViewing(item)}>
                            <span className="check-mark" />
                            <span>
                              {item.label}
                              {item.details ? ` — ${item.details}` : ""}
                              {item.link && (
                                <>
                                  {" "}
                                  <a href={item.link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                    Link
                                  </a>
                                </>
                              )}
                            </span>
                            {item.photo && <img className="point-photo" src={item.photo} alt="" />}
                            <em>
                              {item.state === "done" ? "Done" : item.state === "partial" ? "Partial" : "Not started"}
                              {item.doneAt ? ` · ${formatWhen(item.doneAt)}` : ""}
                            </em>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Field>
            {admin && <Field label="Assignees" wide>
              <MultiSelect
                label="Assignees"
                values={draft.assigneeIds}
                options={data.users.map((user) => ({ value: user.id, label: `${user.name} (${user.id})` }))}
                onChange={(assigneeIds) => setDraft({ ...draft, assigneeIds })}
              />
            </Field>}
            {dialog.mode === "edit" && (
              <p className="muted wide">
                Opened by {personName(data.users, dialog.task.createdBy)} on {formatDate(dialog.task.createdAt)}.
                {dialog.task.updatedAt ? ` Last saved ${formatWhen(dialog.task.updatedAt)}.` : " Not saved since it was opened."}
                {dialog.task.doneAt ? ` Marked done ${formatWhen(dialog.task.doneAt)}.` : ""}
              </p>
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
      {detailId && data.tasks.some((task) => task.id === detailId) && (
        <TaskDetail
          task={data.tasks.find((task) => task.id === detailId)!}
          users={data.users}
          projects={data.projects}
          checkpoints={data.checkpoints}
          assignments={data.assignments}
          tasks={data.tasks}
          sessionUserId={sessionUser.id}
          comment={comment}
          onComment={setComment}
          onClose={() => { setDetailId(null); setComment(""); }}
          onEdit={() => {
            const task = data.tasks.find((item) => item.id === detailId);
            setDetailId(null);
            if (task && sessionUser.role !== "viewer") openEdit(task);
          }}
          onSaveComments={(comments) => {
            const task = data.tasks.find((item) => item.id === detailId);
            if (task) store.updateTask(task.id, { comments });
          }}
        />
      )}
      {viewing && <CheckpointView item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function TaskDetail({
  task,
  users,
  projects,
  checkpoints,
  assignments,
  tasks,
  sessionUserId,
  comment,
  onComment,
  onClose,
  onEdit,
  onSaveComments,
}: {
  task: Task;
  users: User[];
  projects: Project[];
  checkpoints: Checkpoint[];
  assignments: Assignment[];
  tasks: Task[];
  sessionUserId: string;
  comment: string;
  onComment: (value: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onSaveComments: (comments: Task["comments"]) => void;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const project = projects.find((item) => item.id === task.projectId);
  const people = taskLinks(assignments, task.id);
  const parentTaskTitle = tasks.find((item) => item.id === task.parentId)?.title;
  const mentionQuery = comment.match(/@([^\s@]*)$/)?.[1] ?? null;
  const mentionPeople = mentionQuery === null ? [] : users.filter((user) => user.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5);
  const activity = (task.activity && task.activity.length > 0
    ? task.activity.map((item) => ({ id: item.id, when: item.at, text: item.text }))
    : [
        { id: "created", when: task.createdAt, text: `Created by ${personName(users, task.createdBy)}` },
        ...people.map((link) => ({ id: link.id, when: link.assignedAt, text: `${personName(users, link.userId)} assigned · ${label(link.role)}` })),
      ]
  ).sort((a, b) => b.when.localeCompare(a.when));

  return (
    <Drawer title={task.title} onClose={onClose}>
      <div className="stack task-detail">
        <div className="card-top">
          <h2>{task.title}</h2>
          <button type="button" className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        <p>{task.description || "No description."}</p>
        <div className="fact-grid">
          <div><span>Status</span><strong>{label(task.status)}{task.customStatus ? ` · ${task.customStatus}` : ""}</strong></div>
          <div><span>Priority</span><strong>{label(task.priority)}</strong></div>
          <div><span>Assignee</span><strong>{people.length ? people.map((link) => personName(users, link.userId)).join(", ") : "Unassigned"}</strong></div>
          <div><span>Project</span><strong>{project ? `${project.code} · ${project.name}` : task.projectId}</strong></div>
          <div><span>Start</span><strong>{task.startDate ? formatDate(task.startDate) : "Not set"}</strong></div>
          <div><span>Due date</span><strong>{formatDate(task.dueDate)}</strong></div>
          <div><span>Creator</span><strong>{personName(users, task.createdBy)}</strong></div>
          <div><span>Estimate</span><strong>{task.estimate || "Not set"}</strong></div>
          <div><span>Actual</span><strong>{task.actual || "Not set"}</strong></div>
          <div><span>Parent</span><strong>{parentTaskTitle || "None"}</strong></div>
          <div><span>Progress</span><strong>{childProgress(tasks, task.id)}</strong></div>
        </div>
        {(task.tags ?? []).length > 0 && <p className="muted">{task.tags?.join(" · ")}</p>}
        <section>
          <h3>Subtasks</h3>
          <ul className="line-list">
            {tasks.filter((item) => item.parentId === task.id).length === 0 && <li>No subtasks.</li>}
            {tasks.filter((item) => item.parentId === task.id).map((item) => (
              <li key={item.id}><strong>{item.title}</strong><span>{label(item.status)} · {childProgress(tasks, item.id)}</span></li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Dependencies</h3>
          <ul className="line-list">
            <li><strong>Blocked by</strong><span>{namesFor(tasks, task.blockedByIds)}</span></li>
            <li><strong>Blocks</strong><span>{namesFor(tasks, task.blocksIds)}</span></li>
            <li><strong>Related task</strong><span>{namesFor(tasks, task.relatedIds)}</span></li>
          </ul>
        </section>
        <section>
          <h3>Checklist</h3>
          <ul className="line-list">
            {task.checkpointIds.length === 0 && <li>No checkpoints on this task.</li>}
            {task.checkpointIds.map((id) => checkpoints.find((item) => item.id === id)).filter((item) => item !== undefined).map((item) => (
              <li key={item.id}><strong>{item.label}</strong><span>{item.state === "done" ? "Done" : item.state === "partial" ? "Partial" : "Not started"}</span></li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Attachments</h3>
          <ul className="line-list">
            {(task.attachments ?? []).length === 0 && <li>No attachments.</li>}
            {(task.attachments ?? []).map((file) => (
              <li key={file.id}><strong>{file.name || "File"}</strong>{file.url ? <a href={file.url} target="_blank" rel="noreferrer">{file.url}</a> : <span>No link</span>}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Comments</h3>
          <ul className="line-list">
            {(task.comments ?? []).map((item) => {
              const parent = (task.comments ?? []).find((entry) => entry.id === item.replyTo);
              return (
                <li key={item.id}>
                  <strong>{personName(users, item.userId)}</strong>
                  <span>{formatWhen(item.at)}</span>
                  {parent && <span>Reply to {personName(users, parent.userId)}</span>}
                  <p>{item.body}</p>
                  <span className="check-actions">
                    <button type="button" className="btn ghost small" onClick={() => { setReplyTo(item.id); setEditing(null); onComment(`@${personName(users, item.userId)} `); }}>Reply</button>
                    {item.userId === sessionUserId && (
                      <>
                        <button type="button" className="btn ghost small" onClick={() => { setEditing(item.id); setReplyTo(null); onComment(item.body); }}>Edit</button>
                        <button type="button" className="btn ghost small" onClick={() => onSaveComments((task.comments ?? []).filter((entry) => entry.id !== item.id && entry.replyTo !== item.id))}>Delete</button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            const body = comment.trim();
            if (!body) return;
            const authorId = sessionUserId;
            if (editing) {
              onSaveComments((task.comments ?? []).map((item) => item.id === editing ? { ...item, body } : item));
            } else {
              onSaveComments([...(task.comments ?? []), { id: nextId("m", (task.comments ?? []).map((item) => item.id)), userId: authorId, body, at: nowStamp(), replyTo }]);
            }
            setEditing(null);
            setReplyTo(null);
            onComment("");
          }}>
            {mentionPeople.length > 0 && (
              <div className="mention-list">
                {mentionPeople.map((user) => (
                  <button key={user.id} type="button" onClick={() => onComment(comment.replace(/@([^\s@]*)$/, `@${user.name} `))}>@{user.name}</button>
                ))}
              </div>
            )}
            <textarea className="control" rows={2} value={comment} placeholder="Write a comment, or type @ to mention someone" onChange={(event) => onComment(event.target.value)} />
            <button type="submit" className="btn primary small">{editing ? "Save comment" : replyTo ? "Reply" : "Add comment"}</button>
          </form>
        </section>
        <section>
          <h3>Activity history</h3>
          <ul className="line-list">
            {activity.map((item) => (
              <li key={item.id}><strong>{item.text}</strong><span>{formatWhen(item.when)}</span></li>
            ))}
          </ul>
        </section>
        <button type="button" className="btn ghost" onClick={onEdit}>Edit task</button>
      </div>
    </Drawer>
  );
}

function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function childProgress(tasks: Task[], parentId: string) {
  const children = tasks.filter((item) => item.parentId === parentId);
  if (children.length === 0) return "No subtasks";
  const done = children.filter((item) => item.status === "done").length;
  return `${done} of ${children.length} subtasks done`;
}

function namesFor(tasks: Task[], ids?: string[]) {
  const names = (ids ?? []).map((id) => tasks.find((item) => item.id === id)?.title).filter(Boolean);
  return names.length ? names.join(", ") : "None";
}

function TaskBranch({ task, tasks, onOpen }: { task: Task; tasks: Task[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const children = tasks.filter((item) => item.parentId === task.id);
  return (
    <li>
      <div className="tree-row">
        {children.length > 0 && (
          <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Hide" : "Open"}</button>
        )}
        <button type="button" className="text-btn" onClick={() => onOpen(task.id)}>{task.title}</button>
        <span>{label(task.status)}{children.length > 0 ? ` · ${childProgress(tasks, task.id)}` : ""}</span>
      </div>
      {open && children.length > 0 && (
        <ul className="tree-children">
          {children.map((child) => <TaskBranch key={child.id} task={child} tasks={tasks} onOpen={onOpen} />)}
        </ul>
      )}
    </li>
  );
}

function TaskModes({
  mode,
  tasks,
  month,
  onMonth,
  projects,
  users,
  assignments,
  onOpen,
}: {
  mode: "list" | "tree" | "calendar" | "timeline" | "gantt" | "table" | "workload";
  tasks: Task[];
  month: string;
  onMonth: (value: string) => void;
  projects: Project[];
  users: User[];
  assignments: Assignment[];
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const names = (task: Task) => taskLinks(assignments, task.id).map((link) => personName(users, link.userId)).join(", ") || "Unassigned";
  const projectName = (id: string) => {
    const project = projects.find((item) => item.id === id);
    return project ? `${project.code} · ${project.name}` : id;
  };
  if (tasks.length === 0) return <p className="empty">No tasks match that filter.</p>;

  const paged = mode === "list" || mode === "table";
  const pages = paged ? Math.max(1, Math.ceil(tasks.length / 8)) : 1;
  const current = Math.min(page, pages);
  const slice = paged ? tasks.slice((current - 1) * 8, current * 8) : tasks;

  if (mode === "tree") {
    const roots = tasks.filter((task) => !task.parentId || !tasks.some((item) => item.id === task.parentId));
    return (
      <ul className="task-tree">
        {roots.map((task) => <TaskBranch key={task.id} task={task} tasks={tasks} onOpen={onOpen} />)}
      </ul>
    );
  }

  if (mode === "list") {
    return (
      <div className="stack">
      <ul className="line-list task-list">
        {slice.map((task) => (
          <li key={task.id}>
            <button type="button" className="text-btn" onClick={() => onOpen(task.id)}>{task.title}</button>
            <span>{label(task.status)} · {label(task.priority)} · {names(task)} · {formatDate(task.dueDate)}</span>
          </li>
        ))}
      </ul>
      <Pagination page={current} pages={pages} onPage={setPage} />
      </div>
    );
  }

  if (mode === "table") {
    return (
      <div className="stack">
      <Table head={["Task", "Status", "Priority", "Project", "Assignee", "Start", "Due"]}>
        {slice.map((task) => (
          <tr key={task.id}>
            <td><button type="button" className="text-btn" onClick={() => onOpen(task.id)}>{task.title}</button></td>
            <td><Pill value={task.status} /></td>
            <td><Pill value={task.priority} /></td>
            <td>{projectName(task.projectId)}</td>
            <td>{names(task)}</td>
            <td>{task.startDate ? formatDate(task.startDate) : "—"}</td>
            <td>{formatDate(task.dueDate)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={current} pages={pages} onPage={setPage} />
      </div>
    );
  }

  if (mode === "workload") {
    const rows = users.map((user) => ({
      user,
      open: tasks.filter((task) => task.status !== "done" && taskLinks(assignments, task.id).some((link) => link.userId === user.id)).length,
      done: tasks.filter((task) => task.status === "done" && taskLinks(assignments, task.id).some((link) => link.userId === user.id)).length,
    })).filter((row) => row.open + row.done > 0);
    const peak = Math.max(1, ...rows.map((row) => row.open));
    return (
      <ul className="workload">
        {rows.map((row) => (
          <li key={row.user.id}>
            <Avatar name={row.user.name} id={row.user.id} />
            <div>
              <strong>{row.user.name}</strong>
              <div className="bar"><span style={{ width: `${(row.open / peak) * 100}%` }} /></div>
            </div>
            <em>{row.open} open · {row.done} done</em>
          </li>
        ))}
      </ul>
    );
  }

  if (mode === "calendar") {
    const [year, mon] = month.split("-").map(Number);
    const first = new Date(year, mon - 1, 1);
    const pad = (first.getDay() + 6) % 7;
    const count = new Date(year, mon, 0).getDate();
    const cells: Array<string | null> = [...Array(pad).fill(null)];
    for (let day = 1; day <= count; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
    const shift = (step: number) => {
      const next = new Date(year, mon - 1 + step, 1);
      onMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    };
    return (
      <div className="stack">
        <div className="card-top">
          <button type="button" className="btn ghost small" onClick={() => shift(-1)}>Previous</button>
          <strong>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</strong>
          <button type="button" className="btn ghost small" onClick={() => shift(1)}>Next</button>
        </div>
        <div className="cal-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day} className="cal-head">{day}</span>)}
          {cells.map((iso, index) => (
            <div key={iso ?? `pad-${index}`} className="cal-cell">
              {iso && <strong>{Number(iso.slice(8))}</strong>}
              {iso && tasks.filter((task) => task.dueDate === iso).map((task) => (
                <button key={task.id} type="button" className="cal-task" onClick={() => onOpen(task.id)}>{task.title}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dates = tasks.flatMap((task) => [task.startDate || task.createdAt.slice(0, 10), task.dueDate]).sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  const span = Math.max(1, (Date.parse(end) - Date.parse(start)) / 86400000);
  const place = (iso: string) => Math.max(0, Math.min(100, ((Date.parse(iso) - Date.parse(start)) / 86400000 / span) * 100));
  const rows = mode === "gantt" ? [...tasks].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || a.dueDate.localeCompare(b.dueDate)) : [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <div className="stack">
      <p className="muted">{formatDate(start)} – {formatDate(end)}</p>
      <ul className="gantt">
        {rows.map((task) => {
          const from = place(task.startDate || task.createdAt.slice(0, 10));
          const to = place(task.dueDate);
          const project = projects.find((item) => item.id === task.projectId);
          return (
            <li key={task.id} className={task.parentId ? "gantt-child" : ""}>
              <button type="button" className="text-btn" onClick={() => onOpen(task.id)}>{task.title}</button>
              <div className="gantt-track">
                <span style={{ left: `${from}%`, width: `${Math.max(2, to - from)}%`, background: project?.color ?? "#2563eb" }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
