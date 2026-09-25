import { useState } from "react";
import { scopeFor } from "../access";
import { Avatar, Pill } from "../components/Bits";
import { Table } from "../components/System";
import { TASK_STATUSES, formatDate, isOverdue, label, matches, personName, taskLinks } from "../lib";
import { useStore } from "../store";
import type { Task, TaskStatus } from "../types";

const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: "#94a3b8",
  todo: "#64748b",
  doing: "#2563eb",
  review: "#4f46e5",
  done: "#16a34a",
};

function hoursOf(value?: string) {
  if (!value?.trim()) return null;
  const text = value.trim().toLowerCase();
  let hours = 0;
  let matched = false;
  const hour = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minute = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hour) {
    hours += Number(hour[1]);
    matched = true;
  }
  if (minute) {
    hours += Number(minute[1]) / 60;
    matched = true;
  }
  if (!matched && /^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return matched ? hours : null;
}

function stamp(iso: string) {
  const text = iso.includes("T") ? iso : `${iso}T00:00`;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

function formatHours(hours: number) {
  return `${Math.round(hours * 10) / 10}h`;
}

function formatSpan(hours: number) {
  if (hours < 24) return `${Math.round(hours * 10) / 10} hours`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function Reports({ query }: { query: string }) {
  const { data, sessionUser } = useStore();
  const [projectId, setProjectId] = useState("all");
  if (!data || !sessionUser) return null;

  const scoped = scopeFor(data, sessionUser);
  const projects = projectId === "all" ? scoped.projects : scoped.projects.filter((project) => project.id === projectId);
  const tasks = scoped.tasks.filter((task) => {
    if (projectId !== "all" && task.projectId !== projectId) return false;
    const project = scoped.projects.find((item) => item.id === task.projectId);
    return matches(query, [task.title, task.id, task.status, project?.name, project?.code]);
  });

  const completed = tasks.filter((task) => task.status === "done");
  const pending = tasks.filter((task) => task.status !== "done");
  const overdue = tasks.filter((task) => isOverdue(task.dueDate, task.status));
  const completion = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
  const spans = completed
    .map((task) => {
      const start = stamp(task.createdAt);
      const end = task.doneAt ? stamp(task.doneAt) : null;
      if (start === null || end === null || end < start) return null;
      return (end - start) / 36e5;
    })
    .filter((item): item is number => item !== null);
  const average = spans.length ? spans.reduce((sum, item) => sum + item, 0) / spans.length : null;

  const timed = tasks.map((task) => ({ task, estimate: hoursOf(task.estimate), actual: hoursOf(task.actual) }));
  const estimated = timed.reduce((sum, item) => sum + (item.estimate ?? 0), 0);
  const actual = timed.reduce((sum, item) => sum + (item.actual ?? 0), 0);
  const logged = timed.filter((item) => item.task.estimate || item.task.actual);

  const people = scoped.users.filter((user) => user.status !== "inactive");
  const rows = people.map((user) => {
    const held = tasks.filter((task) => taskLinks(data.assignments, task.id).some((link) => link.userId === user.id));
    return {
      user,
      tasks: held.length,
      done: held.filter((task) => task.status === "done").length,
      late: held.filter((task) => isOverdue(task.dueDate, task.status)).length,
      open: held.filter((task) => task.status !== "done").length,
    };
  }).sort((a, b) => b.open - a.open || b.tasks - a.tasks);
  const loadPeak = Math.max(1, ...rows.map((row) => row.open));
  const unassigned = tasks.filter((task) => taskLinks(data.assignments, task.id).length === 0).length;

  const byMonth = new Map<string, number>();
  for (const task of completed) {
    const when = task.doneAt || task.updatedAt || task.createdAt;
    const key = monthKey(when);
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const monthPeak = Math.max(1, ...months.map(([, count]) => count));
  const statusPeak = Math.max(1, ...TASK_STATUSES.map((status) => tasks.filter((task) => task.status === status).length));

  return (
    <div className="stack">
      <div className="view-head">
        <p>Project totals, team workload, and time logged on estimate and actual. Pending is every task that is not done.</p>
        <label className="field">
          <span>Project</span>
          <select className="control" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="all">All projects</option>
            {scoped.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      </div>

      <section className="metrics">
        <article className="metric"><span>Completion %</span><strong>{completion}%</strong></article>
        <article className="metric"><span>Total tasks</span><strong>{tasks.length}</strong></article>
        <article className="metric tone-done"><span>Completed</span><strong>{completed.length}</strong></article>
        <article className="metric"><span>Pending</span><strong>{pending.length}</strong></article>
        <article className="metric tone-late"><span>Overdue</span><strong>{overdue.length}</strong></article>
        <article className="metric"><span>Average completion time</span><strong>{average === null ? "None" : formatSpan(average)}</strong></article>
      </section>
      {average === null && <p className="muted">No completed task has a finish time yet, so the average stays empty.</p>}

      <section className="panel stack">
        <header className="panel-head"><h2>Time tracking</h2><span>Estimate and actual</span></header>
        <div className="fact-grid">
          <div><span>Estimated</span><strong>{formatHours(estimated)}</strong></div>
          <div><span>Actual</span><strong>{formatHours(actual)}</strong></div>
          <div><span>Difference</span><strong>{formatHours(actual - estimated)}</strong></div>
          <div><span>Tasks with time</span><strong>{logged.length}</strong></div>
        </div>
        {logged.length === 0 && <p className="empty">No time has been logged. Set estimate and actual on a task.</p>}
        {logged.length > 0 && (
          <Table head={["Task", "Estimate", "Actual"]}>
            {logged.map(({ task, estimate, actual: spent }) => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>{estimate === null ? (task.estimate || "—") : formatHours(estimate)}</td>
                <td>{spent === null ? (task.actual || "—") : formatHours(spent)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="panel stack">
        <header className="panel-head"><h2>Team analytics</h2><span>Tasks, completed, overdue, workload</span></header>
        {unassigned > 0 && <p className="muted">{unassigned} tasks have no assignee.</p>}
        <Table head={["Member", "Tasks per member", "Completed per member", "Overdue per member", "Workload"]}>
          {rows.map((row) => (
            <tr key={row.user.id}>
              <td>
                <span className="avatar-row">
                  <Avatar name={row.user.name} id={row.user.id} photo={row.user.photo} />
                  {row.user.name}
                </span>
              </td>
              <td>{row.tasks}</td>
              <td>{row.done}</td>
              <td>{row.late}</td>
              <td>
                <div className="bar"><span style={{ width: `${(row.open / loadPeak) * 100}%`, background: "#2563eb" }} /></div>
                <span className="muted">{row.open} open</span>
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <div className="chart-grid">
        <section className="panel">
          <header className="panel-head"><h2>Task completion chart</h2><span>Marked done</span></header>
          {months.length === 0 && <p className="empty">No tasks have been completed yet.</p>}
          <ul className="bars wide">
            {months.map(([key, count]) => (
              <li key={key}>
                <span>{monthLabel(key)}</span>
                <div className="bar"><span style={{ width: `${(count / monthPeak) * 100}%`, background: "#16a34a" }} /></div>
                <em>{count}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Task distribution</h2><span>{completion}% complete</span></header>
          <ul className="bars wide">
            {TASK_STATUSES.map((status) => {
              const value = tasks.filter((task) => task.status === status).length;
              return (
                <li key={status}>
                  <span>{label(status)}</span>
                  <div className="bar"><span style={{ width: `${(value / statusPeak) * 100}%`, background: STATUS_COLOR[status] }} /></div>
                  <em>{value}</em>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Project progress</h2></header>
          {projects.map((project) => {
            const projectTasks = tasks.filter((task) => task.projectId === project.id);
            const done = projectTasks.filter((task) => task.status === "done").length;
            const pct = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0;
            return (
              <div key={project.id} className="progress-block">
                <div className="card-top">
                  <strong>{project.name}</strong>
                  <Pill value={project.status} />
                </div>
                <div className="progress" aria-hidden="true"><span style={{ width: `${pct}%`, background: project.color }} /></div>
                <p className="muted">{pct}% · {done} of {projectTasks.length} tasks done · due {formatDate(project.dueDate)}</p>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Team workload chart</h2><span>Open tasks</span></header>
          <ul className="bars wide">
            {rows.map((row) => (
              <li key={row.user.id}>
                <span>{row.user.name}</span>
                <div className="bar"><span style={{ width: `${(row.open / loadPeak) * 100}%`, background: "#2563eb" }} /></div>
                <em>{row.open}</em>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel stack">
        <header className="panel-head"><h2>Overdue tasks</h2><span>{overdue.length}</span></header>
        {overdue.length === 0 && <p className="empty">No overdue tasks in this report.</p>}
        {overdue.length > 0 && (
          <Table head={["Task", "Project", "Due", "People"]}>
            {overdue.map((task: Task) => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>{scoped.projects.find((project) => project.id === task.projectId)?.name ?? "Project"}</td>
                <td>{formatDate(task.dueDate)}</td>
                <td>{taskLinks(data.assignments, task.id).map((link) => personName(data.users, link.userId)).join(", ") || "Unassigned"}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
