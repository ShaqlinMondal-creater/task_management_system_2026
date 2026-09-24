import { scopeFor } from "../access";
import type { ViewId } from "../access";
import { Avatar, Icon, IdChip, Pill } from "../components/Bits";
import { PRIORITIES, TASK_STATUSES, formatDate, isOverdue, label, matches, personName } from "../lib";
import { useStore } from "../store";
import type { Checkpoint, Task, TaskStatus } from "../types";

const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: "#94a3b8",
  todo: "#64748b",
  doing: "#2563eb",
  review: "#4f46e5",
  done: "#16a34a",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#94a3b8",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7f1d1d",
};

function Donut({ parts, center }: { parts: { value: number; color: string }[]; center: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  let cursor = 0;
  const arcs = parts
    .filter((part) => part.value > 0)
    .map((part) => {
      const length = total ? (part.value / total) * circ : 0;
      const arc = { ...part, dash: `${length} ${circ - length}`, offset: -cursor };
      cursor += length;
      return arc;
    });

  return (
    <svg className="donut" viewBox="0 0 120 120" role="img" aria-label={`${center} tasks`}>
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#e8eef6" strokeWidth="14" />
      {arcs.map((arc) => (
        <circle
          key={arc.color}
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth="14"
          strokeDasharray={arc.dash}
          strokeDashoffset={arc.offset}
          transform="rotate(-90 60 60)"
        />
      ))}
      <text x="60" y="58" textAnchor="middle">
        {center}
      </text>
      <text x="60" y="74" textAnchor="middle" className="donut-sub">
        tasks
      </text>
    </svg>
  );
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function Desk({ query, onOpen }: { query: string; onOpen: (view: ViewId, intent?: "create-task" | "create-project" | "invite" | "my-tasks") => void }) {
  const { data, sessionUser } = useStore();
  if (!data || !sessionUser) return null;

  const scoped = scopeFor(data, sessionUser);
  const admin = sessionUser.role === "admin";
  const reviewer = sessionUser.role === "reviewer";
  const tasks = scoped.tasks;
  const mine = data.tasks.filter((task) =>
    data.assignments.some((item) => item.kind === "task" && item.taskId === task.id && item.userId === sessionUser.id),
  );
  const points: Checkpoint[] = admin
    ? data.checkpoints.filter((item) => scoped.projects.some((project) => project.id === item.projectId))
    : data.checkpoints.filter((item) => tasks.some((task) => task.checkpointIds.includes(item.id)));

  const countStatus = (status: TaskStatus) => tasks.filter((task) => task.status === status).length;
  const pending = countStatus("backlog") + countStatus("todo");
  const doing = countStatus("doing");
  const review = countStatus("review");
  const completed = countStatus("done");
  const overdue = tasks.filter((task) => isOverdue(task.dueDate, task.status));
  const taskPct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const pointDone = points.filter((item) => item.state === "done").length;
  const pointPartial = points.filter((item) => item.state === "partial").length;
  const pointOpen = points.filter((item) => item.state === "open").length;
  const pointPct = points.length ? Math.round((pointDone / points.length) * 100) : 0;

  const completedByMonth = new Map<string, number>();
  for (const task of tasks.filter((item) => item.status === "done")) {
    const when = task.doneAt || task.updatedAt || task.createdAt;
    const key = monthKey(when);
    completedByMonth.set(key, (completedByMonth.get(key) ?? 0) + 1);
  }
  const completedMonths = [...completedByMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const completedPeak = Math.max(1, ...completedMonths.map(([, count]) => count));

  const dueMonths = new Map<string, { late: number; done: number; open: number }>();
  for (const task of tasks) {
    const key = monthKey(task.dueDate);
    const bucket = dueMonths.get(key) ?? { late: 0, done: 0, open: 0 };
    if (isOverdue(task.dueDate, task.status)) bucket.late += 1;
    else if (task.status === "done") bucket.done += 1;
    else bucket.open += 1;
    dueMonths.set(key, bucket);
  }
  const trendMonths = [...dueMonths.entries()].sort(([a], [b]) => a.localeCompare(b));

  const loads = (admin ? data.users : scoped.users)
    .map((user) => ({
      user,
      count: data.assignments.filter((item) => {
        if (item.kind !== "task" || item.userId !== user.id || !item.taskId) return false;
        const task = data.tasks.find((entry) => entry.id === item.taskId);
        return Boolean(task && task.status !== "done" && (admin || tasks.some((entry) => entry.id === task.id)));
      }).length,
    }))
    .sort((a, b) => b.count - a.count);
  const peak = Math.max(1, ...loads.map((item) => item.count));

  const visible = (task: Task) => {
    const project = scoped.projects.find((item) => item.id === task.projectId);
    return matches(query, [task.title, task.id, task.status, task.priority, project?.name, project?.code]);
  };
  const upcoming = tasks.filter((task) => task.status !== "done" && visible(task)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  const finishedTasks = tasks
    .filter((task) => task.status === "done" && visible(task))
    .sort((a, b) => (b.doneAt || b.updatedAt || b.createdAt).localeCompare(a.doneAt || a.updatedAt || a.createdAt))
    .slice(0, 6);
  const finishedPoints = points
    .filter((item) => item.state === "done" && item.doneAt && matches(query, [item.label, item.phase, item.group]))
    .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""))
    .slice(0, 6);
  const activity = [
    ...data.assignments
      .filter((item) => item.kind === "task" && item.taskId && (admin || item.userId === sessionUser.id))
      .map((item) => {
        const task = data.tasks.find((entry) => entry.id === item.taskId);
        const who = admin ? personName(data.users, item.userId) : "You";
        return task ? { id: item.id, when: item.assignedAt, title: `${who} ${item.role === "reviewer" ? "is reviewing" : "was assigned"}`, detail: task.title } : null;
      }),
    ...tasks
      .filter((task) => task.updatedAt)
      .map((task) => ({ id: `upd-${task.id}`, when: task.updatedAt || task.createdAt, title: task.title, detail: `Updated · ${label(task.status)}` })),
  ]
    .filter((item): item is { id: string; when: string; title: string; detail: string } => Boolean(item) && matches(query, [item!.title, item!.detail]))
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, 6);

  const memberRows = (admin ? data.users.filter((user) => user.role !== "admin") : [sessionUser]).map((user) => {
    const held = data.tasks.filter((task) =>
      data.assignments.some((item) => item.kind === "task" && item.taskId === task.id && item.userId === user.id),
    );
    const heldPoints = data.checkpoints.filter((item) => held.some((task) => task.checkpointIds.includes(item.id)));
    return {
      user,
      tasks: held,
      done: held.filter((task) => task.status === "done").length,
      open: held.filter((task) => task.status !== "done").length,
      late: held.filter((task) => isOverdue(task.dueDate, task.status)).length,
      pointDone: heldPoints.filter((item) => item.state === "done").length,
      pointPartial: heldPoints.filter((item) => item.state === "partial").length,
      pointOpen: heldPoints.filter((item) => item.state === "open").length,
      points: heldPoints.length,
    };
  });

  return (
    <div className="stack">
      <div className="quick-actions">
        {!reviewer && (
          <button type="button" className="btn primary" onClick={() => onOpen("tasks", "create-task")}>
            <Icon name="plus" /> Create task
          </button>
        )}
        {admin && (
          <button type="button" className="btn ghost" onClick={() => onOpen("projects", "create-project")}>
            <Icon name="projects" /> Create project
          </button>
        )}
        {admin && (
          <button type="button" className="btn ghost" onClick={() => onOpen("people", "invite")}>
            <Icon name="people" /> Invite member
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => onOpen("tasks", "my-tasks")}>
          <Icon name="tasks" /> {reviewer ? "View my reviews" : "View my tasks"}
        </button>
        {admin && (
          <button type="button" className="btn ghost" onClick={() => onOpen("checks")}>
            <Icon name="check" /> Checkpoints
          </button>
        )}
      </div>

      <section className="metrics">
        <article className="metric">
          <span><Icon name="projects" /> Total projects</span>
          <strong>{scoped.projects.length}</strong>
        </article>
        <article className="metric">
          <span><Icon name="tasks" /> Total tasks</span>
          <strong>{tasks.length}</strong>
        </article>
        <article className="metric">
          <span>Pending tasks</span>
          <strong>{pending}</strong>
        </article>
        <article className="metric">
          <span>In-progress tasks</span>
          <strong>{doing}</strong>
        </article>
        <article className="metric">
          <span>In review</span>
          <strong>{review}</strong>
        </article>
        <article className="metric">
          <span>Completed tasks</span>
          <strong>{completed}</strong>
        </article>
        <article className="metric tone-late">
          <span><Icon name="alert" /> Overdue tasks</span>
          <strong>{overdue.length}</strong>
        </article>
        <article className="metric">
          <span>Tasks assigned to me</span>
          <strong>{mine.length}</strong>
        </article>
      </section>

      <section className="metrics">
        <article className="metric">
          <span><Icon name="check" /> Checkpoints</span>
          <strong>{points.length}</strong>
        </article>
        <article className="metric tone-done">
          <span>Done</span>
          <strong>{pointDone}</strong>
        </article>
        <article className="metric tone-partial">
          <span>Partial</span>
          <strong>{pointPartial}</strong>
        </article>
        <article className="metric tone-open">
          <span>Not started</span>
          <strong>{pointOpen}</strong>
        </article>
      </section>

      <div className="chart-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>{admin ? "Tasks by status" : "Your tasks by status"}</h2>
            <span>{taskPct}% complete</span>
          </header>
          <div className="donut-row">
            <Donut parts={TASK_STATUSES.map((status) => ({ value: countStatus(status), color: STATUS_COLOR[status] }))} center={String(tasks.length)} />
            <ul className="legend">
              {TASK_STATUSES.map((status) => (
                <li key={status}>
                  <i style={{ background: STATUS_COLOR[status] }} />
                  {label(status)}
                  <em>{countStatus(status)}</em>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>{admin ? "Tasks by priority" : "Your tasks by priority"}</h2>
          </header>
          <ul className="bars">
            {PRIORITIES.map((priority) => {
              const value = tasks.filter((task) => task.priority === priority).length;
              const max = Math.max(1, ...PRIORITIES.map((item) => tasks.filter((task) => task.priority === item).length));
              return (
                <li key={priority}>
                  <span>{label(priority)}</span>
                  <div className="bar">
                    <span style={{ width: `${(value / max) * 100}%`, background: PRIORITY_COLOR[priority] }} />
                  </div>
                  <em>{value}</em>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>{admin ? "Tasks completed over time" : "Your tasks completed over time"}</h2>
            <span>Marked done</span>
          </header>
          {completedMonths.length === 0 && <p className="empty">No tasks have been completed yet.</p>}
          <ul className="bars">
            {completedMonths.map(([key, count]) => (
              <li key={key}>
                <span>{monthLabel(key)}</span>
                <div className="bar">
                  <span style={{ width: `${(count / completedPeak) * 100}%`, background: "#16a34a" }} />
                </div>
                <em>{count}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>{admin ? "Project progress" : "Your progress"}</h2>
            <span>{pointPct}% of checkpoints</span>
          </header>
          {scoped.projects.map((project) => {
            const projectTasks = tasks.filter((task) => task.projectId === project.id);
            const done = projectTasks.filter((task) => task.status === "done").length;
            const pct = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0;
            return (
              <div key={project.id} className="progress-block">
                <div className="card-top">
                  <span className="dot" style={{ background: project.color }} />
                  <strong>{project.name}</strong>
                  <Pill value={project.status} />
                </div>
                <div className="progress" aria-hidden="true">
                  <span style={{ width: `${pct}%`, background: project.color }} />
                </div>
                <p className="muted">{done} of {projectTasks.length} tasks done · due {formatDate(project.dueDate)}</p>
              </div>
            );
          })}
          <ul className="bars point-bars">
            <li>
              <span>Checkpoints done</span>
              <div className="bar"><span style={{ width: `${points.length ? (pointDone / points.length) * 100 : 0}%`, background: "#16a34a" }} /></div>
              <em>{pointDone}</em>
            </li>
            <li>
              <span>Partial</span>
              <div className="bar"><span style={{ width: `${points.length ? (pointPartial / points.length) * 100 : 0}%`, background: "#d97706" }} /></div>
              <em>{pointPartial}</em>
            </li>
            <li>
              <span>Not started</span>
              <div className="bar"><span style={{ width: `${points.length ? (pointOpen / points.length) * 100 : 0}%`, background: "#94a3b8" }} /></div>
              <em>{pointOpen}</em>
            </li>
          </ul>
        </section>
      </div>

      {admin && (
        <section className="panel">
          <header className="panel-head">
            <h2>By member</h2>
            <span>Each person's tasks and checkpoints</span>
          </header>
          <ul className="member-analytics">
            {memberRows.map((row) => {
              const taskTotal = Math.max(1, row.tasks.length);
              const pointTotal = Math.max(1, row.points);
              return (
                <li key={row.user.id}>
                  <div className="card-top">
                    <Avatar name={row.user.name} id={row.user.id} />
                    <strong>
                      {row.user.name} <IdChip id={row.user.id} />
                    </strong>
                    <Pill value={row.user.role} />
                  </div>
                  <p className="muted">{row.tasks.length} tasks · {row.points} checkpoints · {row.late} overdue</p>
                  <ul className="bars">
                    <li>
                      <span>Tasks done</span>
                      <div className="bar"><span style={{ width: `${(row.done / taskTotal) * 100}%`, background: "#16a34a" }} /></div>
                      <em>{row.done}</em>
                    </li>
                    <li>
                      <span>Still open</span>
                      <div className="bar"><span style={{ width: `${(row.open / taskTotal) * 100}%`, background: "#2563eb" }} /></div>
                      <em>{row.open}</em>
                    </li>
                    <li>
                      <span>Checkpoints done</span>
                      <div className="bar"><span style={{ width: `${(row.pointDone / pointTotal) * 100}%`, background: "#16a34a" }} /></div>
                      <em>{row.pointDone}</em>
                    </li>
                    <li>
                      <span>Partial</span>
                      <div className="bar"><span style={{ width: `${(row.pointPartial / pointTotal) * 100}%`, background: "#d97706" }} /></div>
                      <em>{row.pointPartial}</em>
                    </li>
                    <li>
                      <span>Not started</span>
                      <div className="bar"><span style={{ width: `${(row.pointOpen / pointTotal) * 100}%`, background: "#94a3b8" }} /></div>
                      <em>{row.pointOpen}</em>
                    </li>
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="chart-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>{admin ? "Team workload" : "Your workload"}</h2>
            <span>Open task assignments</span>
          </header>
          <ul className="workload">
            {loads.map(({ user, count }) => (
              <li key={user.id}>
                <Avatar name={user.name} id={user.id} />
                <div>
                  <strong>
                    {user.name} <IdChip id={user.id} />
                  </strong>
                  <div className="bar">
                    <span style={{ width: `${(count / peak) * 100}%` }} />
                  </div>
                </div>
                <em>{count}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>{admin ? "Overdue trends" : "Your overdue trends"}</h2>
            <span>{overdue.length} overdue now</span>
          </header>
          {trendMonths.length === 0 && <p className="empty">No dated tasks yet.</p>}
          <ul className="bars">
            {trendMonths.map(([key, bucket]) => {
              const total = bucket.late + bucket.done + bucket.open || 1;
              return (
                <li key={key}>
                  <span>{monthLabel(key)}</span>
                  <div className="bar stack-bar">
                    <span style={{ width: `${(bucket.late / total) * 100}%`, background: "#dc2626" }} />
                    <span style={{ width: `${(bucket.done / total) * 100}%`, background: "#16a34a" }} />
                    <span style={{ width: `${(bucket.open / total) * 100}%`, background: "#2563eb" }} />
                  </div>
                  <em>{bucket.late}</em>
                </li>
              );
            })}
          </ul>
          <p className="muted chart-key"><i className="swatch-late" /> Overdue <i className="swatch-done" /> Done <i className="swatch-open" /> Still open</p>
        </section>
      </div>

      <div className="chart-grid three">
        <section className="panel">
          <header className="panel-head">
            <h2>Upcoming deadlines</h2>
          </header>
          {upcoming.length === 0 && <p className="empty">Nothing open matches that search.</p>}
          <ul className="due-list">
            {upcoming.map((task) => {
              const late = isOverdue(task.dueDate, task.status);
              return (
                <li key={task.id} className="due-row">
                  <div>
                    <strong>{task.title}</strong>
                    <p className={late ? "muted overdue" : "muted"}>
                      {formatDate(task.dueDate)}
                      {late ? " · overdue" : ""} · {label(task.status)}
                    </p>
                    <p className="point-mix">
                      <span>{task.checkpointIds.length} {task.checkpointIds.length === 1 ? "checkpoint" : "checkpoints"}</span>
                      <span className="mix-done">{pointCount(data.checkpoints, task, "done")} done</span>
                      <span className="mix-partial">{pointCount(data.checkpoints, task, "partial")} partial</span>
                      <span className="mix-open">{pointCount(data.checkpoints, task, "open")} not started</span>
                    </p>
                  </div>
                  <Pill value={task.priority} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Recently completed</h2>
            <span>{finishedTasks.length ? "Tasks marked done" : "Checkpoints marked done"}</span>
          </header>
          {finishedTasks.length === 0 && finishedPoints.length === 0 && <p className="empty">Nothing has been completed in this view.</p>}
          <ul className="due-list">
            {(finishedTasks.length ? finishedTasks.map((task) => ({ id: task.id, title: task.title, when: task.doneAt || task.updatedAt || task.createdAt })) : finishedPoints.map((item) => ({ id: item.id, title: item.label, when: item.doneAt || "" }))).map((item) => (
              <li key={item.id} className="due-row">
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.when ? formatDate(item.when.slice(0, 10)) : "Done"}</p>
                </div>
                <Pill value="done" />
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Recent activity</h2>
          </header>
          {activity.length === 0 && <p className="empty">No assignments match that search.</p>}
          <ul className="due-list">
            {activity.map((item) => (
              <li key={item.id} className="due-row">
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">
                    {item.detail} · {formatDate(item.when.slice(0, 10))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function pointCount(points: Checkpoint[], task: Task, state: Checkpoint["state"]) {
  return points.filter((item) => task.checkpointIds.includes(item.id) && item.state === state).length;
}

