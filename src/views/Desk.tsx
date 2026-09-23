import { Avatar, Icon, IdChip, Pill } from "../components/Bits";
import { formatDate, isOverdue, matches, openTasks, personName, projectLinks, taskLinks } from "../lib";
import { useStore } from "../store";

export function Desk({ query }: { query: string }) {
  const { data } = useStore();
  if (!data) return null;

  const projects = data.projects.filter((project) =>
    matches(query, [project.name, project.code, project.id, project.description, project.status]),
  );
  const activeTasks = openTasks(data.tasks);
  const due = activeTasks
    .filter((task) => {
      const project = data.projects.find((item) => item.id === task.projectId);
      return matches(query, [task.title, task.id, task.status, project?.name, project?.code]);
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const unassigned = activeTasks.filter((task) => taskLinks(data.assignments, task.id).length === 0);
  const loads = data.users
    .map((user) => ({
      user,
      count: data.assignments.filter((item) => {
        if (item.kind !== "task" || item.userId !== user.id || !item.taskId) return false;
        const task = data.tasks.find((entry) => entry.id === item.taskId);
        return task ? task.status !== "done" : false;
      }).length,
    }))
    .sort((a, b) => b.count - a.count);
  const peak = Math.max(1, ...loads.map((item) => item.count));

  return (
    <div className="stack">
      <section className="metrics">
        <article className="metric">
          <span><Icon name="tasks" /> Open tasks</span>
          <strong>{activeTasks.length}</strong>
        </article>
        <article className="metric">
          <span><Icon name="projects" /> Active projects</span>
          <strong>{data.projects.filter((project) => project.status === "active").length}</strong>
        </article>
        <article className="metric">
          <span><Icon name="people" /> People</span>
          <strong>{data.users.length}</strong>
        </article>
        <article className="metric">
          <span><Icon name="alert" /> Unassigned</span>
          <strong>{unassigned.length}</strong>
        </article>
      </section>

      <div className="desk-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>Project health</h2>
            <span>{projects.length} showing</span>
          </header>
          {projects.length === 0 && <p className="empty">No project matches that search.</p>}
          <ul className="health-list">
            {projects.map((project) => {
              const tasks = data.tasks.filter((task) => task.projectId === project.id);
              const done = tasks.filter((task) => task.status === "done").length;
              const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
              const members = projectLinks(data.assignments, project.id);
              return (
                <li key={project.id}>
                  <div className="card-top">
                    <span className="dot" style={{ background: project.color }} />
                    <div>
                      <strong>
                        {project.name} <IdChip id={project.id} />
                      </strong>
                      <p className="muted">
                        {project.code} · {personName(data.users, project.ownerId)} · {members.length} on the project
                      </p>
                    </div>
                    <Pill value={project.status} />
                  </div>
                  <div className="progress" aria-hidden="true">
                    <span style={{ width: `${pct}%`, background: project.color }} />
                  </div>
                  <p className="muted">
                    {done} of {tasks.length} done · due {formatDate(project.dueDate)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Due next</h2>
            <span>Open work</span>
          </header>
          {due.length === 0 && <p className="empty">Nothing open matches that search.</p>}
          <ul className="due-list">
            {due.slice(0, 7).map((task) => {
              const project = data.projects.find((item) => item.id === task.projectId);
              const people = taskLinks(data.assignments, task.id);
              const late = isOverdue(task.dueDate, task.status);
              return (
                <li key={task.id} className="due-row">
                  <div>
                    <strong>
                      {task.title} <IdChip id={task.id} />
                    </strong>
                    <p className={late ? "muted overdue" : "muted"}>
                      {project?.code ?? task.projectId} · {formatDate(task.dueDate)}
                      {late ? " · overdue" : ""}
                    </p>
                  </div>
                  <div className="avatar-row">
                    {people.length === 0 && <span className="muted">Open</span>}
                    {people.map((link) => {
                      const user = data.users.find((item) => item.id === link.userId);
                      return user ? <Avatar key={link.id} name={user.name} id={user.id} /> : null;
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>Open load</h2>
          <span>Task assignments still in motion</span>
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
    </div>
  );
}
