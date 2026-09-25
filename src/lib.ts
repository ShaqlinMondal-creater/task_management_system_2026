import type { Assignment, Task, User } from "./types";

export const TASK_STATUSES = ["backlog", "todo", "doing", "review", "done"] as const;
export const PROJECT_STATUSES = ["planned", "active", "paused", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const USER_ROLES = ["admin", "manager", "member", "viewer", "reviewer"] as const;
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
  manager: "Manager",
  lead: "Lead",
  member: "Member",
  viewer: "Viewer",
  inactive: "Inactive",
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

export function fitImage(file: File, max = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be read."));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result ?? ""));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ago(iso: string) {
  if (!iso) return "";
  const hasTime = iso.includes("T");
  const [date, time] = iso.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = (time ?? "00:00").split(":").map(Number);
  const then = new Date(year, (month ?? 1) - 1, day ?? 1, hour || 0, minute || 0);
  const diff = Date.now() - then.getTime();
  if (!hasTime) return formatDate(date);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function formatDate(iso: string) {
  if (!iso) return "No date";
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const [date, time] = iso.split("T");
  const formatted = formatDate(date);
  return time ? `${formatted}, ${time}` : formatted;
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
