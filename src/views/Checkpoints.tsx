import { useMemo, useState } from "react";
import type { CheckState } from "../checkpoints";
import { label, matches, personName } from "../lib";
import { useStore } from "../store";
import type { Checkpoint } from "../types";

const STATE_LABEL: Record<CheckState, string> = {
  done: "Done",
  partial: "Partial",
  open: "Not started",
};

export function Checkpoints({ query }: { query: string }) {
  const { data } = useStore();
  const [area, setArea] = useState<"all" | "Frontend" | "Backend">("all");
  const rows = data?.checkpoints ?? [];
  const totals = {
    total: rows.length,
    done: rows.filter((item) => item.state === "done").length,
    partial: rows.filter((item) => item.state === "partial").length,
    open: rows.filter((item) => item.state === "open").length,
  };

  const taskOf = (id: string) => data?.tasks.find((task) => task.checkpointIds.includes(id));
  const holder = (item: Checkpoint) => {
    const task = taskOf(item.id);
    if (!task || !data) return "With admin";
    const link = data.assignments.find((entry) => entry.kind === "task" && entry.taskId === task.id);
    const who = personName(data.users, link?.userId);
    return `${task.title} · ${who}`;
  };

  const phases = useMemo(() => {
    const filtered = rows.filter(
      (item) => (area === "all" || item.area === area) && matches(query, [item.label, item.group, item.phase, item.area, STATE_LABEL[item.state]]),
    );
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
  }, [area, query, rows]);

  if (!data) return null;

  return (
    <div className="stack">
      <div className="view-head">
        <p>Creating a project makes this full list, and only an admin can see it. A task then holds one checkpoint or several, and that task goes to a member or a reviewer.</p>
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
      <div className="filters">
        {(["all", "Frontend", "Backend"] as const).map((value) => (
          <button key={value} type="button" className={area === value ? "btn primary small" : "btn ghost small"} onClick={() => setArea(value)}>
            {value === "all" ? "All" : value}
          </button>
        ))}
      </div>
      {phases.length === 0 && <p className="empty">No checkpoint matches that search.</p>}
      {phases.map((phase) => (
        <section key={phase.phase} className="panel">
          <header className="panel-head">
            <h2>
              <span className="eyebrow">{phase.area}</span>
              {phase.phase}
            </h2>
          </header>
          {phase.groups.map(([group, items]) => (
            <div key={group} className="check-group">
              <h3>{group}</h3>
              <ul className="check-list">
                {items.map((item) => (
                  <li key={item.id} className={`check-item state-${item.state}`}>
                    <span className="check-mark" aria-hidden="true" />
                    <span>{item.label}</span>
                    <span className="check-task">{holder(item)}</span>
                    <em>{STATE_LABEL[item.state]}</em>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <p className="muted">Admin checkpoints stay on this list until you put them on a task. Member and reviewer checkpoints are already grouped into tasks. {label("admin")} keeps the list.</p>
    </div>
  );
}
