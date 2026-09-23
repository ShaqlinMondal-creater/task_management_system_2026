import { CHECKPOINTS } from "./checkpoints";
import { nextId } from "./lib";
import type { Assignment, Checkpoint, Task, TaskStatus } from "./types";

const MEMBER_IDS = ["u02", "u03"];

export function checkpointsForProject(projectId: string, existingIds: string[]) {
  const made: Checkpoint[] = [];
  const ids = [...existingIds];
  for (const phase of CHECKPOINTS) {
    for (const group of phase.groups) {
      for (const item of group.items) {
        const id = nextId("c", ids);
        ids.push(id);
        made.push({
          id,
          projectId,
          area: phase.area,
          phase: phase.title,
          group: group.title,
          label: item.label,
          state: item.state,
          role: item.owner ?? phase.owner,
        });
      }
    }
  }
  return made;
}

function statusFor(role: Checkpoint["role"], states: Checkpoint["state"][]): TaskStatus {
  if (states.every((state) => state === "done")) return "done";
  if (role === "reviewer") return "review";
  if (states.some((state) => state === "partial")) return "doing";
  return "todo";
}

function priorityFor(states: Checkpoint["state"][]) {
  if (states.every((state) => state === "done")) return "low" as const;
  if (states.some((state) => state === "partial")) return "high" as const;
  return "medium" as const;
}

function dueFor(states: Checkpoint["state"][]) {
  if (states.every((state) => state === "done")) return "2026-09-23";
  if (states.some((state) => state === "partial")) return "2026-10-16";
  return "2026-11-20";
}

export function tasksFromCheckpoints(checkpoints: Checkpoint[]) {
  const buckets = new Map<string, Checkpoint[]>();
  const order: string[] = [];
  for (const item of checkpoints) {
    if (item.role === "admin") continue;
    const key = item.role === "reviewer" && item.label === "IN_REVIEW" ? "reviewer|IN_REVIEW" : `${item.role}|${item.phase}|${item.group}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)?.push(item);
  }

  const tasks: Task[] = [];
  const taskAssignments: Assignment[] = [];
  let memberTurn = 0;

  order.forEach((key, index) => {
    const items = buckets.get(key) ?? [];
    const first = items[0];
    if (!first) return;
    const n = index + 1;
    const id = `t${String(n).padStart(2, "0")}`;
    const userId = first.role === "reviewer" ? "u04" : MEMBER_IDS[memberTurn++ % MEMBER_IDS.length];
    const states = items.map((item) => item.state);
    tasks.push({
      id,
      title: items.length === 1 ? first.label : `${first.phase} · ${first.group}`,
      description: `${items.length} checkpoint${items.length === 1 ? "" : "s"} from the project list.`,
      projectId: first.projectId,
      status: statusFor(first.role, states),
      priority: priorityFor(states),
      dueDate: dueFor(states),
      createdBy: "u01",
      createdAt: "2026-09-23",
      checkpointIds: items.map((item) => item.id),
    });
    taskAssignments.push({
      id: `a${String(n + 4).padStart(2, "0")}`,
      kind: "task",
      projectId: first.projectId,
      taskId: id,
      userId,
      role: first.role === "reviewer" ? "reviewer" : "assignee",
      assignedAt: "2026-09-23",
    });
  });

  return { tasks, taskAssignments };
}
