import { Fragment, useMemo, useState } from "react";
import { holdsTask, scopeFor } from "../access";
import { Avatar, Icon, IdChip, Pill } from "../components/Bits";
import { Confirm } from "../components/Modal";
import { Table } from "../components/System";
import { PROJECT_ROLES, TASK_ROLES, formatDate, formatWhen, label, matches, personName, projectLinks, taskLinks } from "../lib";
import { useStore } from "../store";
import { useToast } from "../toast";

export function Assignments({ query }: { query: string }) {
  const store = useStore();
  const toast = useToast();
  const { data, sessionUser } = store;
  const admin = sessionUser?.role === "admin";
  const [projectId, setProjectId] = useState(data?.projects[0]?.id ?? "");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [kindFilter, setKindFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string; from: string } | null>(null);

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

  if (!data || !sessionUser) return null;
  if (!selected) return <p className="empty">Add a project before assigning people.</p>;

  const scoped = scopeFor(data, sessionUser);
  const projectChoices = admin ? data.projects : scoped.projects;
  const members = projectLinks(data.assignments, selected.id);
  const tasks = (admin ? data.tasks : scoped.tasks.filter((task) => holdsTask(data.assignments, task.id, sessionUser.id))).filter((task) => task.projectId === selected.id);
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
        <div>
          <p>{admin ? "Add people to the project first. Then hand each task to someone." : "These are your assignments. Open a task and update its checkpoints."}</p>
        </div>
        <label>
          Project
          <select
            className="control"
            value={selected.id}
            onChange={(event) => {
              setProjectId(event.target.value);
              setMessage(null);
            }}
          >
            {projectChoices.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message && <p className="form-error">{message}</p>}

      {admin && <section className="panel">
          <header className="panel-head">
            <h2>People on {selected.name}</h2>
            <span>{members.length}</span>
          </header>
          {members.length === 0 && <p className="empty">Nobody is on this project yet.</p>}
          <ul className="assign-people">
            {members.map((member) => {
              const user = data.users.find((item) => item.id === member.userId);
              if (!user) return null;
              return (
                <li key={member.id}>
                  <Avatar name={user.name} id={user.id} />
                  <div>
                    <strong>{user.name}</strong>
                    <p className="muted">{label(member.role)}</p>
                  </div>
                  <select className="control" value={member.role} aria-label={`${user.name} role`} onChange={(event) => store.updateAssignment(member.id, event.target.value)}>
                    {PROJECT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {label(role)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn ghost small" onClick={() => setPendingRemove({ id: member.id, name: user.name, from: selected.name })}>
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
                  {user.name}
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
              <Icon name="plus" /> Add
            </button>
          </div>
      </section>}

      <section className="panel">
        <header className="panel-head">
          <h2>{admin ? "Tasks" : "Your tasks"}</h2>
          <span>Open a row for the people and checkpoints</span>
        </header>
        {tasks.length === 0 && <p className="empty">This project has no tasks yet.</p>}
        {tasks.length > 0 && (
          <Table head={["Task", "Status", "People", "Checkpoints", ""]}>
                {tasks.map((task) => {
                  const links = taskLinks(data.assignments, task.id);
                  const openUsers = data.users.filter((user) => !links.some((link) => link.userId === user.id));
                  const points = task.checkpointIds.map((id) => data.checkpoints.find((item) => item.id === id)).filter((item) => item !== undefined);
                  const open = openTask === task.id;
                  return (
                    <Fragment key={task.id}>
                      <tr>
                        <td><strong>{task.title}</strong></td>
                        <td><Pill value={task.status} /></td>
                        <td>{links.length}</td>
                        <td>{points.length}</td>
                        <td>
                          <button type="button" className={open ? "icon-btn chev open" : "icon-btn chev"} aria-label={open ? "Hide task details" : "Show task details"} onClick={() => setOpenTask(open ? null : task.id)}>
                            <Icon name="chevron" />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="task-drop">
                          <td colSpan={5}>
                            <div className="task-drop-grid">
                              <div className="drop-pane drop-people">
                                <h3>People on this task</h3>
                                {links.length === 0 && <p className="muted">Nobody yet.</p>}
                                <ul className="drop-people-list">
                                  {links.map((link) => {
                                    const user = data.users.find((item) => item.id === link.userId);
                                    if (!user) return null;
                                    return (
                                      <li key={link.id}>
                                        <Avatar name={user.name} id={user.id} />
                                        <div>
                                          <strong>{user.name}</strong>
                                          <p className="muted">{label(link.role)}</p>
                                        </div>
                                        {admin && (
                                          <select className="control" value={link.role} aria-label={`${user.name} on ${task.title}`} onChange={(event) => store.updateAssignment(link.id, event.target.value)}>
                                            {TASK_ROLES.map((role) => (
                                              <option key={role} value={role}>{label(role)}</option>
                                            ))}
                                          </select>
                                        )}
                                        {admin && <button type="button" className="btn ghost small" onClick={() => setPendingRemove({ id: link.id, name: user.name, from: task.title })}>Remove</button>}
                                      </li>
                                    );
                                  })}
                                </ul>
                                {admin && (
                                  <select
                                    className="control"
                                    value=""
                                    aria-label={`Add someone to ${task.title}`}
                                    onChange={(event) => {
                                      const userId = event.target.value;
                                      if (!userId) return;
                                      setMessage(store.addAssignment({ kind: "task", projectId: selected.id, taskId: task.id, userId, role: "assignee" }));
                                    }}
                                  >
                                    <option value="">Add someone</option>
                                    {openUsers.map((user) => (
                                      <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <div className="drop-pane drop-points">
                                <h3>Checkpoints</h3>
                                {points.length === 0 && <p className="muted">No checkpoints on this task.</p>}
                                <ul className="drop-points-list">
                                  {points.map((item) => (
                                    <li key={item.id} className={`state-${item.state}`}>
                                      <span className="check-mark" />
                                      <strong>{item.label}</strong>
                                      <select
                                        className="control tiny"
                                        value={item.state}
                                        aria-label={`${item.label} status`}
                                        onChange={(event) => {
                                          const state = event.target.value as "done" | "partial" | "open";
                                          store.updateCheckpoint(item.id, { state });
                                          toast(`${item.label} saved`);
                                        }}
                                      >
                                        <option value="open">Not started</option>
                                        <option value="partial">Partial</option>
                                        <option value="done">Done</option>
                                      </select>
                                      {item.doneAt && <em>{formatWhen(item.doneAt)}</em>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
          </Table>
        )}
      </section>

      {admin && <section className="panel">
        <header className="panel-head">
          <h2>Links</h2>
          <span>A plain reading of who is connected</span>
        </header>
        <div className="filters">
          <label>
            Show
            <select className="control" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
              <option value="all">People and tasks</option>
              <option value="project">People on projects</option>
              <option value="task">People on tasks</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
            Every project
          </label>
        </div>
        {ledger.length === 0 && <p className="empty">Nothing matches.</p>}
        <ul className="link-list">
          {ledger.map((item) => {
            const task = data.tasks.find((entry) => entry.id === item.taskId);
            const project = data.projects.find((entry) => entry.id === item.projectId);
            const who = personName(data.users, item.userId);
            return (
              <li key={item.id}>
                <Avatar name={who} id={item.userId} />
                <p>
                  <strong>{who}</strong> {item.kind === "task" ? `is ${label(item.role)} on ${task?.title ?? "a missing task"}` : `is the ${label(item.role)} on ${project?.name ?? "a missing project"}`}
                  <span className="muted">
                    {" "}
                    <IdChip id={item.id} /> · {formatDate(item.assignedAt)}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </section>}
      {pendingRemove && (
        <Confirm
          title="Remove person"
          body={`Remove ${pendingRemove.name} from ${pendingRemove.from}?`}
          confirmLabel="Remove"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            store.removeAssignment(pendingRemove.id);
            setPendingRemove(null);
          }}
        />
      )}
    </div>
  );
}
