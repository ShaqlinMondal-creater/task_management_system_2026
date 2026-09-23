import { useMemo, useState } from "react";
import { Avatar, Icon, IdChip, Pill } from "../components/Bits";
import { PROJECT_ROLES, TASK_ROLES, formatDate, label, matches, personName, projectLinks, taskLinks } from "../lib";
import { useStore } from "../store";

export function Assignments({ query }: { query: string }) {
  const store = useStore();
  const { data } = store;
  const [projectId, setProjectId] = useState(data?.projects[0]?.id ?? "");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [kindFilter, setKindFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const selected = data?.projects.find((project) => project.id === projectId) ?? data?.projects[0];

  const ledger = useMemo(() => {
    if (!data) return [];
    return data.assignments.filter((item) => {
      if (!showAll && selected && item.projectId !== selected.id) return false;
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      const project = data.projects.find((entry) => entry.id === item.projectId);
      const task = data.tasks.find((entry) => entry.id === item.taskId);
      const user = data.users.find((entry) => entry.id === item.userId);
      return matches(query, [item.id, item.kind, item.role, project?.name, project?.code, task?.title, task?.id, user?.name, user?.id]);
    });
  }, [data, showAll, selected, kindFilter, query]);

  if (!data) return null;
  if (!selected) return <p className="empty">Add a project before assigning people.</p>;

  const members = projectLinks(data.assignments, selected.id);
  const tasks = data.tasks.filter((task) => task.projectId === selected.id);
  const available = data.users.filter((user) => !members.some((member) => member.userId === user.id));

  const addMember = () => {
    if (!memberId) {
      setMessage("Choose a person to add.");
      return;
    }
    const error = store.addAssignment({
      kind: "project",
      projectId: selected.id,
      taskId: null,
      userId: memberId,
      role: memberRole,
    });
    setMessage(error);
    if (!error) setMemberId("");
  };

  return (
    <div className="stack">
      <div className="view-head">
        <p>A project row puts a person on the work. A task row points that person at one task. Each row keeps its own id.</p>
      </div>
      {message && <p className="form-error">{message}</p>}
      <div className="assign-layout">
        <aside className="panel project-pick">
          <header className="panel-head">
            <h2>Projects</h2>
          </header>
          {data.projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={project.id === selected.id ? "pick on" : "pick"}
              onClick={() => {
                setProjectId(project.id);
                setMessage(null);
              }}
            >
              <span className="dot" style={{ background: project.color }} />
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.code} · <IdChip id={project.id} />
                </small>
              </span>
            </button>
          ))}
        </aside>

        <div className="stack">
          <section className="panel">
            <header className="panel-head">
              <h2>On {selected.name}</h2>
              <span>{members.length} people</span>
            </header>
            <ul className="member-list">
              {members.map((member) => {
                const user = data.users.find((item) => item.id === member.userId);
                if (!user) return null;
                return (
                  <li key={member.id}>
                    <Avatar name={user.name} id={user.id} />
                    <div>
                      <strong>
                        {user.name} <IdChip id={user.id} />
                      </strong>
                      <p className="muted">
                        Link <IdChip id={member.id} />
                      </p>
                    </div>
                    <select className="control" value={member.role} onChange={(event) => store.updateAssignment(member.id, event.target.value)}>
                      {PROJECT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {label(role)}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn ghost small" onClick={() => store.removeAssignment(member.id)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="add-row">
              <select className="control" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                <option value="">Add a person</option>
                {available.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.id})
                  </option>
                ))}
              </select>
              <select className="control" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                {PROJECT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {label(role)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn primary" onClick={addMember}>
                <Icon name="plus" /> Assign
              </button>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Tasks</h2>
              <span>Who holds each one</span>
            </header>
            {tasks.length === 0 && <p className="empty">This project has no tasks yet.</p>}
            <ul className="task-assign">
              {tasks.map((task) => {
                const links = taskLinks(data.assignments, task.id);
                const openUsers = data.users.filter((user) => !links.some((link) => link.userId === user.id));
                return (
                  <li key={task.id}>
                    <div className="card-top">
                      <div>
                        <strong>
                          {task.title} <IdChip id={task.id} />
                        </strong>
                        <p className="muted">{label(task.status)}</p>
                      </div>
                      <Pill value={task.priority} />
                    </div>
                    <div className="chip-row">
                      {links.length === 0 && <span className="muted">Nobody yet</span>}
                      {links.map((link) => {
                        const user = data.users.find((item) => item.id === link.userId);
                        if (!user) return null;
                        return (
                          <span key={link.id} className="chip">
                            <Avatar name={user.name} id={user.id} />
                            {user.name}
                            <select className="control tiny" value={link.role} onChange={(event) => store.updateAssignment(link.id, event.target.value)}>
                              {TASK_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {label(role)}
                                </option>
                              ))}
                            </select>
                            <button type="button" className="icon-btn" aria-label={`Remove ${user.name}`} onClick={() => store.removeAssignment(link.id)}>
                              ×
                            </button>
                          </span>
                        );
                      })}
                      <select
                        className="control"
                        value=""
                        onChange={(event) => {
                          const userId = event.target.value;
                          if (!userId) return;
                          setMessage(
                            store.addAssignment({
                              kind: "task",
                              projectId: selected.id,
                              taskId: task.id,
                              userId,
                              role: "assignee",
                            }),
                          );
                        }}
                      >
                        <option value="">Add to task</option>
                        {openUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>Id map</h2>
          <span>How the rows point at each other</span>
        </header>
        <div className="filters">
          <label>
            Kind
            <select className="control" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
              <option value="all">All links</option>
              <option value="project">Project</option>
              <option value="task">Task</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
            Show every project
          </label>
        </div>
        <div className="ledger-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Link</th>
                <th>Kind</th>
                <th>Project</th>
                <th>Task</th>
                <th>Person</th>
                <th>Role</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((item) => {
                const task = data.tasks.find((entry) => entry.id === item.taskId);
                return (
                  <tr key={item.id}>
                    <td>
                      <IdChip id={item.id} />
                    </td>
                    <td>
                      <Pill value={item.kind} />
                    </td>
                    <td>
                      {data.projects.find((project) => project.id === item.projectId)?.name ?? "Missing project"}{" "}
                      <IdChip id={item.projectId} />
                    </td>
                    <td>
                      {item.taskId ? (
                        <>
                          {task?.title ?? "Missing task"} <IdChip id={item.taskId} />
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {personName(data.users, item.userId)} <IdChip id={item.userId} />
                    </td>
                    <td>{label(item.role)}</td>
                    <td>{formatDate(item.assignedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ledger.length === 0 && <p className="empty">No links match.</p>}
        </div>
      </section>
    </div>
  );
}
