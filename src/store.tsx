import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { nextId, todayISO } from "./lib";
import type { Assignment, FileName, Project, StoreData, Task, User } from "./types";

const STORAGE_KEY = "northline.store.v1";
const SESSION_KEY = "northline.session";

interface StoreApi {
  data: StoreData | null;
  loading: boolean;
  error: string | null;
  usingLocal: boolean;
  sessionUser: User | null;
  login: (email: string, password: string) => string | null;
  logout: () => void;
  resetSeed: () => Promise<void>;
  exportFile: (name: FileName) => void;
  addUser: (input: Omit<User, "id">) => string | null;
  updateUser: (id: string, patch: Partial<User>) => string | null;
  deleteUser: (id: string) => void;
  addProject: (input: Omit<Project, "id">) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addTask: (input: Omit<Task, "id" | "createdAt" | "createdBy">, assigneeIds: string[]) => void;
  updateTask: (id: string, patch: Partial<Task>, assigneeIds?: string[]) => void;
  deleteTask: (id: string) => void;
  addAssignment: (input: Omit<Assignment, "id" | "assignedAt">) => string | null;
  updateAssignment: (id: string, role: string) => void;
  removeAssignment: (id: string) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

function isStore(value: unknown): value is StoreData {
  if (!value || typeof value !== "object") return false;
  const record = value as StoreData;
  return (
    Array.isArray(record.users) &&
    Array.isArray(record.projects) &&
    Array.isArray(record.tasks) &&
    Array.isArray(record.assignments)
  );
}

function readSaved(): StoreData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStore(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function readList<T>(name: FileName): Promise<T[]> {
  const res = await fetch(`/assets/${name}.json`);
  if (!res.ok) throw new Error(`Missing public/assets/${name}.json`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`public/assets/${name}.json should be a list.`);
  return json as T[];
}

async function fetchSeed(): Promise<StoreData> {
  const [users, projects, tasks, assignments] = await Promise.all([
    readList<User>("users"),
    readList<Project>("projects"),
    readList<Task>("tasks"),
    readList<Assignment>("assignments"),
  ]);
  return { users, projects, tasks, assignments };
}

function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function withMembership(assignments: Assignment[], projectId: string, userId: string) {
  const exists = assignments.some(
    (item) => item.kind === "project" && item.projectId === projectId && item.userId === userId,
  );
  if (exists) return assignments;
  return [
    ...assignments,
    {
      id: nextId("a", assignments.map((item) => item.id)),
      kind: "project" as const,
      projectId,
      taskId: null,
      userId,
      role: "member",
      assignedAt: todayISO(),
    },
  ];
}

const BOOT_MS = 420;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingLocal, setUsingLocal] = useState(false);
  const [userId, setUserId] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY));

  useEffect(() => {
    let cancel = false;
    const started = performance.now();
    const finish = (next: StoreData | null, local: boolean, message: string | null) => {
      const delay = Math.max(0, BOOT_MS - (performance.now() - started));
      window.setTimeout(() => {
        if (cancel) return;
        setData(next);
        setUsingLocal(local);
        setError(message);
        setLoading(false);
      }, delay);
    };

    const saved = readSaved();
    if (saved) {
      finish(saved, true, null);
      return () => {
        cancel = true;
      };
    }

    fetchSeed()
      .then((seed) => finish(seed, false, null))
      .catch((err: unknown) => {
        finish(null, false, err instanceof Error ? err.message : "Could not load the JSON files.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (data && userId && !data.users.some((user) => user.id === userId)) {
      sessionStorage.removeItem(SESSION_KEY);
      setUserId(null);
    }
  }, [data, userId]);

  const commit = (next: StoreData) => {
    setData(next);
    setUsingLocal(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const sessionUser = data?.users.find((user) => user.id === userId) ?? null;

  const api: StoreApi = {
    data,
    loading,
    error,
    usingLocal,
    sessionUser,
    login: (email, password) => {
      const user = data?.users.find(
        (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password,
      );
      if (!user) return "No account matches that email and password.";
      sessionStorage.setItem(SESSION_KEY, user.id);
      setUserId(user.id);
      return null;
    },
    logout: () => {
      sessionStorage.removeItem(SESSION_KEY);
      setUserId(null);
    },
    resetSeed: async () => {
      setLoading(true);
      try {
        const seed = await fetchSeed();
        localStorage.removeItem(STORAGE_KEY);
        setData(seed);
        setUsingLocal(false);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not reload the seed files.");
      } finally {
        setLoading(false);
      }
    },
    exportFile: (name) => {
      if (!data) return;
      download(name, data[name]);
    },
    addUser: (input) => {
      if (!data) return "Ledger is not ready.";
      const email = input.email.trim().toLowerCase();
      if (data.users.some((user) => user.email.toLowerCase() === email)) {
        return "That email is already on the ledger.";
      }
      commit({
        ...data,
        users: [...data.users, { ...input, email, id: nextId("u", data.users.map((user) => user.id)) }],
      });
      return null;
    },
    updateUser: (id, patch) => {
      if (!data) return "Ledger is not ready.";
      const email = patch.email?.trim().toLowerCase();
      if (email && data.users.some((user) => user.id !== id && user.email.toLowerCase() === email)) {
        return "That email is already on the ledger.";
      }
      commit({
        ...data,
        users: data.users.map((user) => (user.id === id ? { ...user, ...patch, email: email ?? user.email } : user)),
      });
      return null;
    },
    deleteUser: (id) => {
      if (!data || !sessionUser || id === sessionUser.id) return;
      commit({
        ...data,
        users: data.users.filter((user) => user.id !== id),
        projects: data.projects.map((project) =>
          project.ownerId === id ? { ...project, ownerId: sessionUser.id } : project,
        ),
        assignments: data.assignments.filter((item) => item.userId !== id),
      });
    },
    addProject: (input) => {
      if (!data) return;
      const id = nextId("p", data.projects.map((project) => project.id));
      const assignments = withMembership(
        [
          ...data.assignments,
          {
            id: nextId("a", data.assignments.map((item) => item.id)),
            kind: "project" as const,
            projectId: id,
            taskId: null,
            userId: input.ownerId,
            role: "lead",
            assignedAt: todayISO(),
          },
        ],
        id,
        input.ownerId,
      );
      commit({ ...data, projects: [...data.projects, { ...input, id }], assignments });
    },
    updateProject: (id, patch) => {
      if (!data) return;
      const assignments =
        patch.ownerId !== undefined ? withMembership(data.assignments, id, patch.ownerId) : data.assignments;
      commit({
        ...data,
        assignments,
        projects: data.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)),
      });
    },
    deleteProject: (id) => {
      if (!data) return;
      commit({
        ...data,
        projects: data.projects.filter((project) => project.id !== id),
        tasks: data.tasks.filter((task) => task.projectId !== id),
        assignments: data.assignments.filter((item) => item.projectId !== id),
      });
    },
    addTask: (input, assigneeIds) => {
      if (!data || !sessionUser) return;
      const id = nextId("t", data.tasks.map((task) => task.id));
      let assignments = data.assignments;
      for (const userId of assigneeIds) {
        assignments = withMembership(assignments, input.projectId, userId);
        assignments = [
          ...assignments,
          {
            id: nextId("a", assignments.map((item) => item.id)),
            kind: "task" as const,
            projectId: input.projectId,
            taskId: id,
            userId,
            role: "assignee",
            assignedAt: todayISO(),
          },
        ];
      }
      commit({
        ...data,
        assignments,
        tasks: [
          ...data.tasks,
          { ...input, id, createdBy: sessionUser.id, createdAt: todayISO() },
        ],
      });
    },
    updateTask: (id, patch, assigneeIds) => {
      if (!data) return;
      const current = data.tasks.find((task) => task.id === id);
      if (!current) return;
      const projectId = patch.projectId ?? current.projectId;
      let assignments = data.assignments.map((item) => (item.taskId === id ? { ...item, projectId } : item));
      if (assigneeIds) {
        const previous = assignments.filter((item) => item.kind === "task" && item.taskId === id);
        assignments = assignments.filter((item) => !(item.kind === "task" && item.taskId === id));
        const ordered = [
          ...assigneeIds.filter((userId) => previous.some((item) => item.userId === userId)),
          ...assigneeIds.filter((userId) => !previous.some((item) => item.userId === userId)),
        ];
        for (const userId of ordered) {
          assignments = withMembership(assignments, projectId, userId);
          const prior = previous.find((item) => item.userId === userId);
          assignments = [
            ...assignments,
            {
              id: prior?.id ?? nextId("a", assignments.map((item) => item.id)),
              kind: "task" as const,
              projectId,
              taskId: id,
              userId,
              role: prior?.role ?? "assignee",
              assignedAt: prior?.assignedAt ?? todayISO(),
            },
          ];
        }
      }
      commit({
        ...data,
        assignments,
        tasks: data.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
      });
    },
    deleteTask: (id) => {
      if (!data) return;
      commit({
        ...data,
        tasks: data.tasks.filter((task) => task.id !== id),
        assignments: data.assignments.filter((item) => item.taskId !== id),
      });
    },
    addAssignment: (input) => {
      if (!data) return "Ledger is not ready.";
      const duplicate = data.assignments.some(
        (item) =>
          item.kind === input.kind &&
          item.projectId === input.projectId &&
          item.taskId === input.taskId &&
          item.userId === input.userId,
      );
      if (duplicate) return "That assignment already exists.";
      let assignments = withMembership(data.assignments, input.projectId, input.userId);
      if (input.kind === "project") {
        const already = assignments.some(
          (item) => item.kind === "project" && item.projectId === input.projectId && item.userId === input.userId,
        );
        if (already && input.role) {
          assignments = assignments.map((item) =>
            item.kind === "project" && item.projectId === input.projectId && item.userId === input.userId
              ? { ...item, role: input.role }
              : item,
          );
          commit({ ...data, assignments });
          return null;
        }
      }
      assignments = [
        ...assignments,
        { ...input, id: nextId("a", assignments.map((item) => item.id)), assignedAt: todayISO() },
      ];
      commit({ ...data, assignments });
      return null;
    },
    updateAssignment: (id, role) => {
      if (!data) return;
      commit({
        ...data,
        assignments: data.assignments.map((item) => (item.id === id ? { ...item, role } : item)),
      });
    },
    removeAssignment: (id) => {
      if (!data) return;
      const target = data.assignments.find((item) => item.id === id);
      if (!target) return;
      let assignments = data.assignments.filter((item) => item.id !== id);
      if (target.kind === "project") {
        assignments = assignments.filter(
          (item) => !(item.kind === "task" && item.projectId === target.projectId && item.userId === target.userId),
        );
      }
      commit({ ...data, assignments });
    },
  };

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
