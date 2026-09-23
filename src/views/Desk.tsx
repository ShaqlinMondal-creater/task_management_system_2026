import { scopeFor } from "../access";
import type { ViewId } from "../access";
import { Avatar, Icon, IdChip, Pill } from "../components/Bits";
import { PRIORITIES, TASK_STATUSES, formatDate, isOverdue, label, matches, personName, todayISO } from "../lib";
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

export function Desk({ query, onOpen }: { query: string; onOpen: (view: ViewId) => void }) {
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
  const today = todayISO();
  const soon = tasks.filter((task) => task.status !== "done" && task.dueDate >= today && task.dueDate <= shift(today, 30));
  const later = tasks.filter((task) => task.status !== "done" && task.dueDate > shift(today, 30));
  const taskPct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const pointDone = points.filter((item) => item.state === "done").length;
  const pointPartial = points.filter((item) => item.state === "partial").length;
  const pointOpen = points.filter((item) => item.state === "open").length;
  const pointPct = points.length ? Math.round((pointDone / points.length) * 100) : 0;

  const byMonth = new Map<string, { done: number; open: number }>();
  for (const task of tasks) {
    const key = monthKey(task.dueDate);
    const bucket = byMonth.get(key) ?? { done: 0, open: 0 };
    if (task.status === "done") bucket.done += 1;
    else bucket.open += 1;
    byMonth.set(key, bucket);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));

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
  const finished = points.filter((item) => item.state === "done" && matches(query, [item.label, item.phase, item.group])).slice(0, 6);
  const activity = data.assignments
    .filter((item) => item.kind === "task" && item.taskId && (admin || item.userId === sessionUser.id))
    .map((item) => {
      const task = data.tasks.find((entry) => entry.id === item.taskId);
      const who = admin ? personName(data.users, item.userId) : "You";
      return { id: item.id, when: item.assignedAt, task, who, role: item.role };
    })
    .filter((item) => item.task && matches(query, [item.task.title, item.who, item.role]))
    .slice(0, 6);

  return (
    <div className="stack">
      <div className="quick-actions">
        {!reviewer && (
          <button type="button" className="btn primary" onClick={() => onOpen("tasks")}>
            <Icon name="plus" /> Create task
          </button>
        )}
        {admin && (
          <button type="button" className="btn ghost" onClick={() => onOpen("projects")}>
            <Icon name="projects" /> Create project
          </button>
        )}
        {admin && (
          <button type="button" className="btn ghost" onClick={() => onOpen("people")}>
            <Icon name="people" /> Invite member
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => onOpen("tasks")}>
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
          <span><Icon name="projects" /> {admin ? "Projects" : "My project"}</span>
          <strong>{scoped.projects.length}</strong>
        </article>
        <article className="metric">
          <span><Icon name="tasks" /> {admin ? "Tasks" : reviewer ? "Reviews" : "My tasks"}</span>
          <strong>{tasks.length}</strong>
        </article>
        <article className="metric">
          <span>Pending</span>
          <strong>{pending}</strong>
        </article>
        <article className="metric">
          <span>In progress</span>
          <strong>{doing}</strong>
        </article>
        <article className="metric">
          <span>In review</span>
          <strong>{review}</strong>
        </article>
        <article className="metric">
          <span>Completed</span>
          <strong>{completed}</strong>
        </article>
        <article className="metric">
          <span><Icon name="alert" /> Overdue</span>
          <strong>{overdue.length}</strong>
        </article>
        {admin && (
          <article className="metric">
            <span>Assigned to me</span>
            <strong>{mine.length}</strong>
          </article>
        )}
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
            <h2>Tasks by status</h2>
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
            <h2>Tasks by priority</h2>
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
            <h2>Tasks by due month</h2>
            <span>Done and still open</span>
          </header>
          {months.length === 0 && <p className="empty">No dated tasks yet.</p>}
          <ul className="bars">
            {months.map(([key, bucket]) => {
              const total = bucket.done + bucket.open || 1;
              return (
                <li key={key}>
                  <span>{monthLabel(key)}</span>
                  <div className="bar stack-bar">
                    <span style={{ width: `${(bucket.done / total) * 100}%`, background: "#16a34a" }} />
                    <span style={{ width: `${(bucket.open / total) * 100}%`, background: "#2563eb" }} />
                  </div>
                  <em>{bucket.done + bucket.open}</em>
                </li>
              );
            })}
          </ul>
          <p className="muted chart-key"><i className="swatch-done" /> Done <i className="swatch-open" /> Still open</p>
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
            <h2>Due outlook</h2>
            <span>Open tasks</span>
          </header>
          <ul className="bars">
            {[
              { label: "Overdue", value: overdue.length, color: "#dc2626" },
              { label: "Next 30 days", value: soon.length, color: "#d97706" },
              { label: "Later", value: later.length, color: "#2563eb" },
            ].map((row) => {
              const max = Math.max(1, overdue.length, soon.length, later.length);
              return (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <div className="bar">
                    <span style={{ width: `${(row.value / max) * 100}%`, background: row.color }} />
                  </div>
                  <em>{row.value}</em>
                </li>
              );
            })}
          </ul>
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
            <span>Checkpoints marked done</span>
          </header>
          {finished.length === 0 && <p className="empty">No completed checkpoints in this view.</p>}
          <ul className="due-list">
            {finished.map((item) => (
              <li key={item.id} className="due-row">
                <div>
                  <strong>{item.label}</strong>
                  <p className="muted">{item.phase}</p>
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
                  <strong>
                    {item.who} {item.role === "reviewer" ? "is reviewing" : "is assigned"}
                  </strong>
                  <p className="muted">
                    {item.task?.title} · {formatDate(item.when)}
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

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}
