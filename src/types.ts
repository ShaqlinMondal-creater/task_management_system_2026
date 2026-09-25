export type Role = "admin" | "manager" | "member" | "viewer" | "reviewer";
export type UserStatus = "active" | "away" | "inactive";
export type ProjectStatus = "planned" | "active" | "paused" | "done";
export type TaskStatus = "backlog" | "todo" | "doing" | "review" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type AssignmentKind = "project" | "task";
export type NoticeKind = "assigned" | "mention" | "comment" | "due" | "overdue" | "invite" | "completed" | "status";

export interface UserSettings {
  notices?: Partial<Record<NoticeKind, boolean>>;
  density?: "comfortable" | "compact";
  language?: "en" | "hi";
  timezone?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  mobile?: string;
  bio?: string;
  photo?: string;
  settings?: UserSettings;
  role: Role;
  title: string;
  department: string;
  status: UserStatus;
}

export interface ProjectCredential {
  id: string;
  label: string;
  username: string;
  secret: string;
  url: string;
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
  icon?: string;
  credentials?: ProjectCredential[];
  notes?: string;
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
  doneAt?: string | null;
  details?: string;
  link?: string;
  photo?: string;
}

export interface TaskFile {
  id: string;
  name: string;
  url: string;
}

export interface TaskComment {
  id: string;
  userId: string;
  body: string;
  at: string;
  replyTo?: string | null;
}

export interface TaskActivity {
  id: string;
  at: string;
  text: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  startDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string | null;
  doneAt?: string | null;
  checkpointIds: string[];
  tags?: string[];
  attachments?: TaskFile[];
  estimate?: string;
  actual?: string;
  parentId?: string | null;
  blockedByIds?: string[];
  blocksIds?: string[];
  relatedIds?: string[];
  customStatus?: string;
  comments?: TaskComment[];
  activity?: TaskActivity[];
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
