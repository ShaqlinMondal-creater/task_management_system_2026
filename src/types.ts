export type Role = "admin" | "member" | "reviewer";
export type UserStatus = "active" | "away";
export type ProjectStatus = "planned" | "active" | "paused" | "done";
export type TaskStatus = "backlog" | "todo" | "doing" | "review" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type AssignmentKind = "project" | "task";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  title: string;
  department: string;
  status: UserStatus;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: string;
  dueDate: string;
  ownerId: string;
  color: string;
}

export interface Checkpoint {
  id: string;
  projectId: string;
  area: "Frontend" | "Backend";
  phase: string;
  group: string;
  label: string;
  state: "done" | "partial" | "open";
  role: Role;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  createdBy: string;
  createdAt: string;
  checkpointIds: string[];
}

export interface Assignment {
  id: string;
  kind: AssignmentKind;
  projectId: string;
  taskId: string | null;
  userId: string;
  role: string;
  assignedAt: string;
}

export interface StoreData {
  users: User[];
  projects: Project[];
  tasks: Task[];
  assignments: Assignment[];
  checkpoints: Checkpoint[];
}

export type FileName = "users" | "projects" | "tasks" | "assignments" | "checkpoints";
