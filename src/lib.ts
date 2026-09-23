import type { Assignment, Task, User } from "./types";

export const TASK_STATUSES = ["backlog", "todo", "doing", "review", "done"] as const;
export const PROJECT_STATUSES = ["planned", "active", "paused", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const USER_ROLES = ["admin", "member", "reviewer"] as const;
export const PROJECT_ROLES = ["lead", "member", "reviewer"] as const;
export const TASK_ROLES = ["assignee", "reviewer"] as const;
export const COLORS = ["#1e6b45", "#2a5f8a", "#c24e2a", "#8a5a2a", "#5c4d8a", "#1f6f78"];

const LABELS: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  done: "Done",
  backlog: "Backlog",
  todo: "To do",
  doing: "In progress",
  review: "In review",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
  admin: "Admin",
  lead: "Lead",
  member: "Member",
  assignee: "Assignee",
  reviewer: "Reviewer",
  away: "Away",
  project: "Project",
  task: "Task",
};

export function label(value: string) {
  return LABELS[value] ?? value;
}

export function nextId(prefix: string, ids: string[]) {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatDate(iso: string) {
  if (!iso) return "No date";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function isOverdue(iso: string, status: string) {
  if (!iso || status === "done") return false;
  return iso < todayISO();
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function hue(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function personName(users: User[], id: string | null | undefined) {
  if (!id) return "Unassigned";
  return users.find((user) => user.id === id)?.name ?? "Unknown";
}

export function matches(query: string, parts: Array<string | null | undefined>) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((part) => (part ?? "").toLowerCase().includes(q));
}

export function taskLinks(assignments: Assignment[], taskId: string) {
  return assignments.filter((item) => item.kind === "task" && item.taskId === taskId);
}

export function projectLinks(assignments: Assignment[], projectId: string) {
  return assignments.filter((item) => item.kind === "project" && item.projectId === projectId);
}

export function suggestCode(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts
    .slice(0, 3)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function openTasks(tasks: Task[]) {
  return tasks.filter((task) => task.status !== "done");
}
