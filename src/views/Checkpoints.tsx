import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { CheckState } from "../checkpoints";
import { Field, Icon, SearchSelect } from "../components/Bits";
import { Button, Card, Input, Pagination, Select, Tabs } from "../components/System";
import { CheckpointView } from "../components/CheckpointView";
import { Modal } from "../components/Modal";
import { formatWhen, label, matches, personName, taskLinks, todayISO } from "../lib";
import { useStore } from "../store";
import { useToast } from "../toast";
import type { Checkpoint, Role } from "../types";

const STATE_LABEL: Record<CheckState, string> = {
  done: "Done",
  partial: "Partial",
  open: "Not started",
};

const PHOTO_LIMIT = 900_000;

type Draft = {
  projectId: string;
  area: "Frontend" | "Backend";
  phase: string;
  group: string;
  label: string;
  state: CheckState;
  role: Role;
  details: string;
  link: string;
  photo: string;
};

function blank(projectId: string): Draft {
  return { projectId, area: "Frontend", phase: "", group: "", label: "", state: "open", role: "member", details: "", link: "", photo: "" };
}

export function Checkpoints({ query }: { query: string }) {
  const store = useStore();
  const toast = useToast();
  const { data, sessionUser } = store;
  const admin = sessionUser?.role === "admin";
  const [area, setArea] = useState<"all" | "Frontend" | "Backend">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [find, setFind] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CheckState>("all");
  const [taskFilter, setTaskFilter] = useState<"all" | "task" | "free">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [assignIds, setAssignIds] = useState<string[] | null>(null);
  const [assignUser, setAssignUser] = useState("");
  const [page, setPage] = useState(0);
  const [viewing, setViewing] = useState<Checkpoint | null>(null);
  const [dialog, setDialog] = useState<{ mode: "new" } | { mode: "edit"; item: Checkpoint } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const shut = (key: string, allDone: boolean) => (key in folds ? folds[key] : allDone);
  const toggleFold = (key: string, allDone: boolean) => {
    setFolds((current) => {
      const closed = key in current ? current[key] : allDone;
      return { ...current, [key]: !closed };
    });
  };
  const rows = (data?.checkpoints ?? []).filter((item) => projectFilter === "all" || item.projectId === projectFilter);
  const totals = {
    total: rows.length,
    done: rows.filter((item) => item.state === "done").length,
    partial: rows.filter((item) => item.state === "partial").length,
    open: rows.filter((item) => item.state === "open").length,
  };

  const placesFor = (id: string) => {
    if (!data) return [];
    return data.tasks
      .filter((task) => task.checkpointIds.includes(id))
      .map((task) => ({
        task,
        people: taskLinks(data.assignments, task.id).map((link) => ({
          link,
          name: personName(data.users, link.userId),
        })),
      }));
  };
  const holder = (item: Checkpoint) => {
    const places = placesFor(item.id);
    if (places.length === 0) return "Not on a task";
    return places
      .map((place) => {
        const names = place.people.map((person) => person.name);
        return `${place.task.title} · ${names.length ? names.join(", ") : "Nobody assigned"}`;
      })
      .join("; ");
  };

  const phases = useMemo(() => {
    const filtered = rows.filter((item) => {
      const places = placesFor(item.id);
      const names = places.flatMap((place) => place.people.map((person) => person.name));
      const onTask = places.length > 0;
      return (
        (area === "all" || item.area === area) &&
        (statusFilter === "all" || item.state === statusFilter) &&
        (taskFilter === "all" || (taskFilter === "task" ? onTask : !onTask)) &&
        matches(find, [item.label, ...names]) &&
        matches(query, [item.label, item.group, item.phase, item.area, item.details, STATE_LABEL[item.state], ...names])
      );
    });
    const phaseOrder: string[] = [];
    const grouped = new Map<string, Map<string, Checkpoint[]>>();
    for (const item of filtered) {
      if (!grouped.has(item.phase)) {
        grouped.set(item.phase, new Map());
        phaseOrder.push(item.phase);
      }
      const groups = grouped.get(item.phase);
      if (!groups) continue;
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return phaseOrder.map((phase) => ({
      phase,
      area: grouped.get(phase)?.values().next().value?.[0]?.area ?? "Frontend",
      groups: [...(grouped.get(phase)?.entries() ?? [])],
    }));
  }, [area, find, query, rows, statusFilter, taskFilter]);

  if (!data || !sessionUser) return null;

  const visibleIds = phases.flatMap((phase) => phase.groups.flatMap(([, items]) => items.map((item) => item.id)));

  const openAssign = (ids: string[]) => {
    setAssignIds(ids);
    setAssignUser("");
    setError(null);
  };

  const confirmAssign = (event: FormEvent) => {
    event.preventDefault();
    if (!assignIds || assignIds.length === 0) return;
    const person = data.users.find((user) => user.id === assignUser);
    const points = assignIds.map((id) => data.checkpoints.find((item) => item.id === id)).filter((item) => item !== undefined);
    if (!person || points.length === 0) {
      setError("Choose a person.");
      return;
    }
    const projectIds = new Set(points.map((item) => item.projectId));
    if (projectIds.size !== 1) {
      setError("Choose checkpoints from one project.");
      return;
    }
    const states = points.map((item) => item.state);
    const [year, month, day] = todayISO().split("-").map(Number);
    const due = new Date(year, (month ?? 1) - 1, day ?? 1);
    due.setDate(due.getDate() + 30);
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    store.addTask(
      {
        title: points.length === 1 ? points[0].label : points.every((item) => item.phase === points[0].phase && item.group === points[0].group) ? `${points[0].phase} · ${points[0].group}` : `${points.length} checkpoints`,
        description: `${points.length} checkpoint${points.length === 1 ? "" : "s"} assigned together.`,
        projectId: points[0].projectId,
        status: person.role === "reviewer" ? "review" : states.every((state) => state === "done") ? "done" : states.some((state) => state === "partial") ? "doing" : "todo",
        priority: states.every((state) => state === "done") ? "low" : states.some((state) => state === "partial") ? "high" : "medium",
        dueDate,
        checkpointIds: points.map((item) => item.id),
      },
      [person.id],
      person.role === "reviewer" ? "reviewer" : "assignee",
    );
    toast(`Assigned to ${person.name}`);
    setSelected((current) => current.filter((id) => !assignIds.includes(id)));
    setAssignIds(null);
  };

  const reload = () => {
    setFind("");
    setStatusFilter("all");
    setTaskFilter("all");
    setArea("all");
    setProjectFilter("all");
    setPage(0);
  };

  const openNew = () => {
    setDraft(blank(data.projects[0]?.id ?? ""));
    setError(null);
    setDialog({ mode: "new" });
  };

  const openEdit = (item: Checkpoint) => {
    if (!admin) return;
    setDraft({
      projectId: item.projectId,
      area: item.area,
      phase: item.phase,
      group: item.group,
      label: item.label,
      state: item.state,
      role: item.role,
      details: item.details ?? "",
      link: item.link ?? "",
      photo: item.photo ?? "",
    });
    setError(null);
    setDialog({ mode: "edit", item });
  };

  const onPhoto = (file: File | undefined) => {
    if (!file || !draft) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const photo = String(reader.result ?? "");
      if (photo.length > PHOTO_LIMIT) {
        setError("That photo is too large. Use a smaller image.");
        return;
      }
      setError(null);
      setDraft({ ...draft, photo });
    };
    reader.readAsDataURL(file);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.projectId || !draft.phase.trim() || !draft.group.trim() || !draft.label.trim()) {
      setError("Project, phase, group, and label are required.");
      return;
    }
    const payload = {
      projectId: draft.projectId,
      area: draft.area,
      phase: draft.phase.trim(),
      group: draft.group.trim(),
      label: draft.label.trim(),
      state: draft.state,
      role: draft.role,
      details: draft.details.trim(),
      link: draft.link.trim(),
      photo: draft.photo.trim(),
    };
    if (dialog?.mode === "edit") {
      store.updateCheckpoint(dialog.item.id, payload);
      toast("Checkpoint saved");
    } else {
      store.addCheckpoint(payload);
      toast("Checkpoint created");
    }
    setDialog(null);
  };

  return (
    <div className="stack">
      <div className="view-head">
        <p>Creating a project makes this full list, and only an admin can see it. A task then holds one checkpoint or several, and that task goes to a member or a reviewer.</p>
        {admin && (
          <button type="button" className="btn primary" onClick={openNew}>
            New checkpoint
          </button>
        )}
      </div>
      <section className="metrics check-metrics">
        <article className="metric">
          <span>Done</span>
          <strong>{totals.done}</strong>
        </article>
        <article className="metric">
          <span>Partial</span>
          <strong>{totals.partial}</strong>
        </article>
        <article className="metric">
          <span>Not started</span>
          <strong>{totals.open}</strong>
        </article>
        <article className="metric">
          <span>Total</span>
          <strong>{totals.total}</strong>
        </article>
      </section>
      <div className="filters check-filters">
        <label>
          Project
          <SearchSelect
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="All projects"
            options={[
              { value: "all", label: "All projects" },
              ...(data?.projects ?? []).map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` })),
            ]}
          />
        </label>
        <label>
          Search
          <Input value={find} onChange={(value) => { setFind(value); setPage(0); }} placeholder="Checkpoint or person" label="Search checkpoints" />
        </label>
        <label>
          Status
          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value as "all" | CheckState); setPage(0); }}
            options={[
              { value: "all", label: "All" },
              { value: "open", label: "Not started" },
              { value: "partial", label: "Partial" },
              { value: "done", label: "Done" },
            ]}
          />
        </label>
        <label>
          Task
          <select className="control" value={taskFilter} onChange={(event) => setTaskFilter(event.target.value as "all" | "task" | "free")}>
            <option value="all">All</option>
            <option value="task">On a task</option>
            <option value="free">Not on a task</option>
          </select>
        </label>
        <Tabs
          value={area}
          onChange={(value) => { setArea(value as "all" | "Frontend" | "Backend"); setPage(0); }}
          options={[{ value: "all", label: "All" }, { value: "Frontend", label: "Frontend" }, { value: "Backend", label: "Backend" }]}
        />
        <Button kind="ghost" onClick={reload}><Icon name="refresh" /> Reload</Button>
      </div>
      {admin && (
        <div className="bulk-bar">
          <label className="check">
            <input
              type="checkbox"
              checked={visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))}
              onChange={() => {
                const allOn = visibleIds.every((id) => selected.includes(id));
                setSelected(allOn ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])]);
              }}
            />
            Select shown
          </label>
          <span>{selected.length} selected</span>
          <button type="button" className="btn primary small" disabled={selected.length === 0} onClick={() => openAssign(selected)}>
            Assign selected
          </button>
          <button type="button" className="btn ghost small" disabled={selected.length === 0} onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      )}
      {phases.length === 0 && <p className="empty">No checkpoint matches that search.</p>}
      {phases.slice(page * 4, page * 4 + 4).map((phase) => {
        const phaseItems = phase.groups.flatMap(([, items]) => items);
        const phaseDone = phaseItems.length > 0 && phaseItems.every((item) => item.state === "done");
        const phaseKey = `phase:${phase.phase}`;
        const phaseShut = shut(phaseKey, phaseDone);
        return (
        <Card key={phase.phase}>
          <header className="panel-head">
            {phaseDone ? (
              <h2>
                <button type="button" className="check-fold" aria-expanded={!phaseShut} onClick={() => toggleFold(phaseKey, phaseDone)}>
                  <span className={phaseShut ? "chev" : "chev open"} aria-hidden="true"><Icon name="chevron" /></span>
                  <span className="fold-title">
                    <span className="eyebrow">{phase.area}</span>
                    {phase.phase}
                  </span>
                  <span className="fold-count">Done</span>
                </button>
              </h2>
            ) : (
              <h2>
                <span className="eyebrow">{phase.area}</span>
                {phase.phase}
              </h2>
            )}
          </header>
          {!phaseShut && phase.groups.map(([group, items]) => {
            const groupDone = items.length > 0 && items.every((item) => item.state === "done");
            const groupKey = `group:${phase.phase}:${group}`;
            const groupShut = phaseDone ? false : shut(groupKey, groupDone);
            return (
            <div key={group} className="check-group">
              <h3>
                {groupDone && !phaseDone ? (
                  <button type="button" className="check-fold" aria-expanded={!groupShut} onClick={() => toggleFold(groupKey, groupDone)}>
                    <span className={groupShut ? "chev" : "chev open"} aria-hidden="true"><Icon name="chevron" /></span>
                    {group}
                    <span className="fold-count">Done</span>
                  </button>
                ) : (
                  group
                )}
              </h3>
              {!groupShut && (
              <ul className="check-list">
                {items.map((item) => (
                  <li key={item.id} className={`check-item state-${item.state}`}>
                    {admin && (
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        aria-label={`Select ${item.label}`}
                        onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}
                      />
                    )}
                    <span className="check-mark" aria-hidden="true" />
                    <span className="check-copy">
                      <button type="button" className="text-btn" onClick={() => setViewing(item)}>
                        {item.label}
                      </button>
                      {item.details && <small>{item.details}</small>}
                      {(item.link || item.photo) && (
                        <span className="refs">
                          {item.link && (
                            <a href={item.link} target="_blank" rel="noreferrer">
                              Reference link
                            </a>
                          )}
                          {item.photo && <img src={item.photo} alt="" />}
                        </span>
                      )}
                    </span>
                    <span className={placesFor(item.id).length > 0 ? "hold hold-task" : "hold hold-admin"}>{holder(item)}</span>
                    {admin ? (
                      <span className="check-status">
                        <select
                          className="control check-state"
                          value={item.state}
                          aria-label={`${item.label} status`}
                          onChange={(event) => {
                            const state = event.target.value as CheckState;
                            store.updateCheckpoint(item.id, { state });
                            toast(`${item.label} saved`);
                          }}
                        >
                          <option value="open">Not started</option>
                          <option value="partial">Partial</option>
                          <option value="done">Done</option>
                        </select>
                        {item.state === "done" && item.doneAt && <em>{formatWhen(item.doneAt)}</em>}
                      </span>
                    ) : (
                      <em>{STATE_LABEL[item.state]}{item.state === "done" && item.doneAt ? ` · ${formatWhen(item.doneAt)}` : ""}</em>
                    )}
                    {admin && (
                      <span className="check-actions">
                        <button type="button" className="btn ghost small" onClick={() => openAssign([item.id])}>
                          Assign
                        </button>
                        <button type="button" className="btn ghost small" onClick={() => openEdit(item)}>
                          Edit
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              )}
            </div>
            );
          })}
        </Card>
        );
      })}
      <Pagination page={page} pages={Math.ceil(phases.length / 4)} onPage={setPage} />
      <p className="muted">Admin checkpoints stay on this list until you put them on a task. Member and reviewer checkpoints are already grouped into tasks. {label("admin")} keeps the list.</p>
      {viewing && (
        <CheckpointView
          item={viewing}
          holder={holder(viewing)}
          onClose={() => setViewing(null)}
          onEdit={
            admin
              ? () => {
                  const current = viewing;
                  setViewing(null);
                  openEdit(current);
                }
              : undefined
          }
        />
      )}
      {assignIds && (
        <Modal title={assignIds.length === 1 ? "Assign checkpoint" : `Assign ${assignIds.length} checkpoints`} onClose={() => setAssignIds(null)}>
          <form className="stack" onSubmit={confirmAssign}>
            <p className="muted">These checkpoints move onto a new task for the person you choose.</p>
            <Field label="Person">
              <select className="control" value={assignUser} onChange={(event) => setAssignUser(event.target.value)} required>
                <option value="">Choose a person</option>
                {data.users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} · {label(user.role)}</option>
                ))}
              </select>
            </Field>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => setAssignIds(null)}>Cancel</button>
              <button type="submit" className="btn primary">Assign</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog && draft && (
        <Modal title={dialog.mode === "edit" ? dialog.item.label : "New checkpoint"} onClose={() => setDialog(null)}>
          {dialog.mode === "edit" && (
            <div className="project-detail check-edit-facts">
              {(() => {
                const places = placesFor(dialog.item.id);
                const people = places.flatMap((place) => place.people.map((person) => ({ ...person, task: place.task })));
                return (
                  <>
                    <section>
                      <h3>Task</h3>
                      {places.length === 0 ? (
                        <p>Not on a task yet.</p>
                      ) : (
                        <ul className="line-list">
                          {places.map((place) => (
                            <li key={place.task.id}>
                              <strong>{place.task.title}</strong>
                              <span>{place.task.id} · {label(place.task.status)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section>
                      <h3>Assigned</h3>
                      {people.length === 0 ? (
                        <p>Nobody is assigned.</p>
                      ) : (
                        <ul className="line-list">
                          {people.map((person) => (
                            <li key={person.link.id}>
                              <strong>{person.name}</strong>
                              <span>{label(person.link.role)} · {person.link.userId} · {person.task.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                );
              })()}
              <div className="fact-grid">
                <div><span>Id</span><strong>{dialog.item.id}</strong></div>
                <div><span>Project</span><strong>{data.projects.find((project) => project.id === dialog.item.projectId)?.name ?? dialog.item.projectId}</strong></div>
                <div><span>Area</span><strong>{dialog.item.area}</strong></div>
                <div><span>Phase</span><strong>{dialog.item.phase}</strong></div>
                <div><span>Group</span><strong>{dialog.item.group}</strong></div>
                <div><span>Status</span><strong>{STATE_LABEL[dialog.item.state]}</strong></div>
                <div><span>Done time</span><strong>{dialog.item.doneAt ? formatWhen(dialog.item.doneAt) : "Not done yet"}</strong></div>
                <div><span>Owner role</span><strong>{label(dialog.item.role)}</strong></div>
              </div>
              <section>
                <h3>Details</h3>
                <p>{dialog.item.details?.trim() ? dialog.item.details : "No details yet."}</p>
              </section>
              <section>
                <h3>Reference link</h3>
                {dialog.item.link ? (
                  <a href={dialog.item.link} target="_blank" rel="noreferrer">{dialog.item.link}</a>
                ) : (
                  <p>No reference link.</p>
                )}
              </section>
              <section>
                <h3>Photo</h3>
                {dialog.item.photo ? <img className="detail-photo" src={dialog.item.photo} alt="" /> : <p>No photo.</p>}
              </section>
              <h3>Update</h3>
            </div>
          )}
          <form className="form-grid" onSubmit={save}>
            <Field label="Project">
              <select className="control" value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Area">
              <select className="control" value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value as Draft["area"] })}>
                <option value="Frontend">Frontend</option>
                <option value="Backend">Backend</option>
              </select>
            </Field>
            <Field label="Phase">
              <input className="control" value={draft.phase} onChange={(event) => setDraft({ ...draft, phase: event.target.value })} required />
            </Field>
            <Field label="Group">
              <input className="control" value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value })} required />
            </Field>
            <Field label="Label" wide>
              <input className="control" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required />
            </Field>
            <Field label="State">
              <select className="control" value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value as CheckState })}>
                <option value="open">Not started</option>
                <option value="partial">Partial</option>
                <option value="done">Done</option>
              </select>
            </Field>
            <Field label="Owner role">
              <select className="control" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </Field>
            <Field label="Details" wide>
              <textarea className="control" rows={3} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} placeholder="What this checkpoint is for" />
            </Field>
            <Field label="Reference link" wide>
              <input className="control" type="url" value={draft.link} onChange={(event) => setDraft({ ...draft, link: event.target.value })} placeholder="https://" />
            </Field>
            <Field label="Photo" wide>
              <input className="control" type="file" accept="image/*" onChange={(event) => onPhoto(event.target.files?.[0])} />
              {draft.photo && (
                <span className="refs">
                  <img src={draft.photo} alt="" />
                  <button type="button" className="btn ghost small" onClick={() => setDraft({ ...draft, photo: "" })}>
                    Remove photo
                  </button>
                </span>
              )}
            </Field>
            {error && <p className="form-error wide">{error}</p>}
            <div className="form-actions wide">
              <button type="button" className="btn ghost" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary">
                Save checkpoint
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
