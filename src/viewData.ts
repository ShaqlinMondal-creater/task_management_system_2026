import type { ViewId } from "./access";
import type { FileName } from "./types";

/** Collections each page needs. Only these APIs run when that page opens (if not cached). */
/** Desk uses GET /api/dashboard/summary instead of these. */
export const VIEW_COLLECTIONS: Record<ViewId, FileName[]> = {
  desk: [],
  projects: ["users", "projects", "tasks", "assignments", "checkpoints"],
  tasks: ["users", "projects", "tasks", "assignments", "checkpoints"],
  people: ["users", "tasks", "assignments"],
  assign: ["users", "projects", "tasks", "assignments", "checkpoints"],
  checks: ["users", "projects", "tasks", "assignments", "checkpoints"],
  admin: ["users", "projects", "tasks", "assignments", "checkpoints"],
  reports: [],
  settings: ["users"],
};
