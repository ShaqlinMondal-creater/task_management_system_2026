import type { Assignment, Project, StoreData, User } from "./types";

export type ViewId = "desk" | "projects" | "tasks" | "people" | "assign" | "checks" | "admin";

const NAV: Record<User["role"], ViewId[]> = {
  admin: ["desk", "projects", "tasks", "people", "assign", "checks", "admin"],
  manager: ["desk", "projects", "tasks", "people", "assign"],
  member: ["desk", "projects", "tasks", "people", "assign"],
  viewer: ["desk", "projects", "tasks"],
  reviewer: ["desk", "tasks", "people", "assign"],
};

export function viewsFor(role: User["role"]) {
  return NAV[role];
}

export function scopeFor(data: StoreData, user: User) {
  if (user.role === "admin" || user.role === "manager") {
    return {
      users: data.users,
      projects: data.projects,
      tasks: data.tasks,
      assignments: data.assignments,
    };
  }

  const assignments = data.assignments.filter((item) => item.userId === user.id);
  const taskIds = new Set(
    assignments.filter((item) => item.kind === "task" && item.taskId).map((item) => item.taskId as string),
  );
  const projectIds = new Set(assignments.map((item) => item.projectId));

  return {
    users: data.users.filter((item) => item.id === user.id),
    projects: data.projects.filter((project) => projectIds.has(project.id)),
    tasks: data.tasks.filter((task) => taskIds.has(task.id)),
    assignments,
  };
}

export function holdsTask(assignments: Assignment[], taskId: string, userId: string) {
  return assignments.some((item) => item.kind === "task" && item.taskId === taskId && item.userId === userId);
}

export function projectRole(assignments: Assignment[], project: Project, userId: string) {
  return assignments.find((item) => item.kind === "project" && item.projectId === project.id && item.userId === userId)?.role ?? null;
}
