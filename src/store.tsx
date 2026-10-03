import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  apiEnabled,
  apiLogin,
  apiLogout,
  apiPasswordChange,
  clearApiToken,
  emptyDesk,
  fetchCollection,
  fetchDashboardSummary,
  fetchDetail,
  fetchReportsSummary,
  getApiToken,
  setApiToken,
  syncDeskDiff,
} from "./api";
import { holdsTask } from "./access";
import { label, nextId, nowStamp, personName, todayISO } from "./lib";
import type { Assignment, Checkpoint, FileName, Project, StoreData, Task, User } from "./types";

const STORAGE_KEY = "northline.store.v9";
const SESSION_KEY = "northline.session";
const TOKEN_KEY = "northline.token";
const IDLE_MS = 30 * 60 * 1000;

function readSession(): { userId: string; exp: number } | "expired" | null {
  const raw = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  if (!raw.startsWith("{")) return { userId: raw, exp: Date.now() + IDLE_MS };
  try {
    const token = JSON.parse(raw) as { userId?: string; exp?: number };
    if (!token.userId || !token.exp) return null;
    if (token.exp < Date.now()) return "expired";
    return { userId: token.userId, exp: token.exp };
  } catch {
    return null;
  }
}

function bootSession(): { userId: string | null; note: string | null } {
  const found = readSession();
  if (found === "expired") {
    clearApiToken();
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    return { userId: null, note: "That session expired. Sign in again." };
  }
  if (found && apiEnabled() && !getApiToken()) {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    return { userId: null, note: "Sign in again to continue." };
  }
  return { userId: found ? found.userId : null, note: null };
}

interface StoreApi {
  data: StoreData | null;
  loading: boolean;
  pageLoading: boolean;
  error: string | null;
  usingLocal: boolean;
  sessionUser: User | null;
  ensureLoaded: (...names: FileName[]) => Promise<void>;
  ensureDashboard: () => Promise<void>;
  ensureReports: (projectId?: string) => Promise<void>;
  login: (email: string, password: string, remember?: boolean) => Promise<string | null>;
  logout: () => void;
  sessionNote: string | null;
  clearSessionNote: () => void;
  changePassword: (current: string, next: string) => Promise<string | null>;
  resetSeed: () => Promise<void>;
  exportFile: (name: FileName) => void;
  addUser: (input: Omit<User, "id">) => string | null;
  updateUser: (id: string, patch: Partial<User>) => string | null;
  deleteUser: (id: string) => void;
  addProject: (input: Omit<Project, "id">, ownerName: string, memberIds?: string[]) => void;
  updateProject: (id: string, patch: Partial<Project>, ownerName?: string, memberIds?: string[]) => void;
  deleteProject: (id: string) => void;
  addTask: (input: Omit<Task, "id" | "createdAt" | "createdBy">, assigneeIds: string[], role?: string) => void;
  updateTask: (id: string, patch: Partial<Task>, assigneeIds?: string[]) => void;
  deleteTask: (id: string) => void;
  addAssignment: (input: Omit<Assignment, "id" | "assignedAt">) => string | null;
  updateAssignment: (id: string, role: string) => void;
  removeAssignment: (id: string) => void;
  addCheckpoint: (input: Omit<Checkpoint, "id" | "doneAt">) => void;
  updateCheckpoint: (id: string, patch: Partial<Omit<Checkpoint, "id">>) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

function alignTaskStatuses(data: StoreData) {
  const stamp = nowStamp();
  let changed = false;
  const tasks = data.tasks.map((task) => {
    if (task.checkpointIds.length === 0) return task;
    const owned = data.checkpoints.filter((item) => task.checkpointIds.includes(item.id));
    if (owned.length !== task.checkpointIds.length) return task;
    const allDone = owned.every((item) => item.state === "done");
    if (allDone && (task.status !== "done" || task.priority !== "low")) {
      changed = true;
      return {
        ...task,
        status: "done" as const,
        priority: "low" as const,
        updatedAt: stamp,
        doneAt: task.doneAt ?? stamp,
      };
    }
    if (!allDone && task.status === "done") {
      changed = true;
      const reviewerTask = data.assignments.some(
        (item) => item.kind === "task" && item.taskId === task.id && item.role === "reviewer",
      );
      return { ...task, status: reviewerTask ? ("review" as const) : ("doing" as const), updatedAt: stamp, doneAt: null };
    }
    return task;
  });
  return changed ? { ...data, tasks } : data;
}

function withLinks(tasks: Task[], id: string, blockedByIds: string[], blocksIds: string[], relatedIds: string[]) {
  const clean = (ids: string[]) => [...new Set(ids.filter((item) => item && item !== id))];
  const blockedBy = clean(blockedByIds);
  const blocks = clean(blocksIds);
  const related = clean(relatedIds);
  return tasks.map((task) => {
    if (task.id === id) return { ...task, blockedByIds: blockedBy, blocksIds: blocks, relatedIds: related };
    const blocked = new Set(task.blockedByIds ?? []);
    const blocking = new Set(task.blocksIds ?? []);
    const relatedSet = new Set(task.relatedIds ?? []);
    if (blocks.includes(task.id)) blocked.add(id);
    else blocked.delete(id);
    if (blockedBy.includes(task.id)) blocking.add(id);
    else blocking.delete(id);
    if (related.includes(task.id)) relatedSet.add(id);
    else relatedSet.delete(id);
    return { ...task, blockedByIds: [...blocked], blocksIds: [...blocking], relatedIds: [...relatedSet] };
  });
}

function isStore(value: unknown): value is StoreData {
  if (!value || typeof value !== "object") return false;
  const record = value as StoreData;
  return (
    Array.isArray(record.users) &&
    Array.isArray(record.projects) &&
    Array.isArray(record.tasks) &&
    Array.isArray(record.assignments) &&
    Array.isArray(record.checkpoints)
  );
}

function withoutQualityTask(data: StoreData): StoreData {
  const gone = new Set(
    data.tasks.filter((task) => task.id === "t13" || task.title.startsWith("15. Quality checkpoint")).map((task) => task.id),
  );
  if (gone.size === 0) return data;
  return {
    ...data,
    tasks: data.tasks.filter((task) => !gone.has(task.id)),
    assignments: data.assignments.filter((item) => !item.taskId || !gone.has(item.taskId)),
  };
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
    const cleaned = withoutQualityTask(parsed);
    if (cleaned !== parsed) localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

const SEED_CACHE = "northline.seed.cache";

async function readList<T>(name: FileName): Promise<T[]> {
  const res = await fetch(`/assets/${name}.json`);
  if (!res.ok) throw new Error(`Missing public/assets/${name}.json`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`public/assets/${name}.json should be a list.`);
  return json as T[];
}

async function fetchSeed(fresh = false): Promise<StoreData> {
  if (!fresh) {
    try {
      const raw = sessionStorage.getItem(SEED_CACHE);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (isStore(parsed)) return withoutQualityTask(parsed);
    } catch {
      sessionStorage.removeItem(SEED_CACHE);
    }
  }
  const [users, projects, tasks, assignments, checkpoints] = await Promise.all([
    readList<User>("users"),
    readList<Project>("projects"),
    readList<Task>("tasks"),
    readList<Assignment>("assignments"),
    readList<Checkpoint>("checkpoints"),
  ]);
  const seed = withoutQualityTask({ users, projects, tasks, assignments, checkpoints });
  sessionStorage.setItem(SEED_CACHE, JSON.stringify(seed));
  return seed;
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

function resolveOwner(users: User[], ownerId: string, ownerName: string) {
  const typed = ownerName.trim();
  if (!typed) return { users, ownerId };
  const byName = users.find((user) => user.name.toLowerCase() === typed.toLowerCase());
  if (byName) return { users, ownerId: byName.id };
  return { users, ownerId };
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
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingLocal, setUsingLocal] = useState(false);
  const [userId, setUserId] = useState<string | null>(() => bootSession().userId);
  const [sessionNote, setSessionNote] = useState<string | null>(() => bootSession().note);
  const loadedRef = useRef(new Set<FileName>());
  const inflightRef = useRef(new Map<FileName, Promise<void>>());
  const dashboardInflight = useRef<Promise<void> | null>(null);
  const dashboardReady = useRef(false);

  const failAuthLoad = useCallback((err: unknown) => {
    if (String(err).includes("Sign in") || getApiToken() === "") {
      clearApiToken();
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
      setUserId(null);
      setData(emptyDesk());
      loadedRef.current.clear();
      setSessionNote(err instanceof Error ? err.message : "Could not load the API. Sign in again.");
      return true;
    }
    setError(err instanceof Error ? err.message : "Could not load page data.");
    return false;
  }, []);

  const ensureLoaded = useCallback(async (...names: FileName[]) => {
    if (!apiEnabled() || !getApiToken()) return;
    const unique = [...new Set(names)];
    const missing = unique.filter((name) => !loadedRef.current.has(name));
    if (!missing.length) return;

    setPageLoading(true);
    try {
      await Promise.all(
        missing.map((name) => {
          const existing = inflightRef.current.get(name);
          if (existing) return existing;
          const job = fetchCollection(name)
            .then((rows) => {
              setData((prev) => {
                const base = prev ?? emptyDesk();
                if (name === "tasks") {
                  return withoutQualityTask({ ...base, tasks: rows as Task[] });
                }
                return { ...base, [name]: rows } as StoreData;
              });
              loadedRef.current.add(name);
            })
            .finally(() => {
              inflightRef.current.delete(name);
            });
          inflightRef.current.set(name, job);
          return job;
        }),
      );
      setError(null);
    } catch (err: unknown) {
      failAuthLoad(err);
    } finally {
      setPageLoading(false);
    }
  }, [failAuthLoad]);

  const ensureDashboard = useCallback(async () => {
    if (!apiEnabled() || !getApiToken()) return;
    if (dashboardReady.current) return;
    if (dashboardInflight.current) {
      setPageLoading(true);
      try {
        await dashboardInflight.current;
      } finally {
        setPageLoading(false);
      }
      return;
    }

    setPageLoading(true);
    const job = fetchDashboardSummary()
      .then((summary) => {
        const desk = withoutQualityTask(summary.desk);
        setData((prev) => {
          const base = prev ?? emptyDesk();
          const users =
            loadedRef.current.has("users") && base.users.length > desk.users.length ? base.users : desk.users;
          return { ...desk, users };
        });
        for (const name of ["users", "projects", "tasks", "assignments", "checkpoints"] as FileName[]) {
          loadedRef.current.add(name);
        }
        dashboardReady.current = true;
        setError(null);
      })
      .catch((err: unknown) => {
        failAuthLoad(err);
      })
      .finally(() => {
        dashboardInflight.current = null;
      });
    dashboardInflight.current = job;
    try {
      await job;
    } finally {
      setPageLoading(false);
    }
  }, [failAuthLoad]);

  const reportsReady = useRef(false);
  const ensureReports = useCallback(async (_projectId = "all") => {
    if (!apiEnabled() || !getApiToken()) return;
    if (reportsReady.current && ["users", "projects", "tasks", "assignments", "checkpoints"].every((n) => loadedRef.current.has(n as FileName))) {
      return;
    }
    setPageLoading(true);
    try {
      const summary = await fetchReportsSummary(_projectId);
      const desk = withoutQualityTask(summary.desk);
      setData((prev) => {
        const base = prev ?? emptyDesk();
        const users =
          loadedRef.current.has("users") && base.users.length > desk.users.length ? base.users : desk.users;
        return { ...desk, users };
      });
      for (const name of ["users", "projects", "tasks", "assignments", "checkpoints"] as FileName[]) {
        loadedRef.current.add(name);
      }
      reportsReady.current = true;
      setError(null);
    } catch (err: unknown) {
      failAuthLoad(err);
    } finally {
      setPageLoading(false);
    }
  }, [failAuthLoad]);

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

    if (apiEnabled()) {
      // Session only on reload — one detail call, not /users/all.
      if (!getApiToken()) {
        loadedRef.current.clear();
        finish(emptyDesk(), false, null);
        return () => {
          cancel = true;
        };
      }
      const session = readSession();
      const sid = session && session !== "expired" ? session.userId : userId;
      if (!sid) {
        loadedRef.current.clear();
        finish(emptyDesk(), false, null);
        return () => {
          cancel = true;
        };
      }
      fetchDetail<User & { relations?: unknown }>("users", sid)
        .then((detail) => {
          if (cancel) return;
          const { relations: _r, ...user } = detail;
          loadedRef.current.clear();
          finish({ ...emptyDesk(), users: [user] }, false, null);
        })
        .catch((err: unknown) => {
          clearApiToken();
          sessionStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(TOKEN_KEY);
          loadedRef.current.clear();
          finish(emptyDesk(), false, null);
          if (!cancel) setSessionNote(err instanceof Error ? err.message : "Could not load the API. Sign in again.");
        });
      return () => {
        cancel = true;
      };
    }

    const saved = readSaved();
    if (saved) {
      loadedRef.current = new Set<FileName>(["users", "projects", "tasks", "assignments", "checkpoints"]);
      finish(saved, true, null);
      return () => {
        cancel = true;
      };
    }

    fetchSeed()
      .then((seed) => {
        loadedRef.current = new Set<FileName>(["users", "projects", "tasks", "assignments", "checkpoints"]);
        finish(seed, false, null);
      })
      .catch((err: unknown) => {
        finish(null, false, err instanceof Error ? err.message : "Could not load the JSON files.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!data || !userId) return;
    // Only enforce after a full users list was loaded — not on session-only boot.
    if (!loadedRef.current.has("users")) return;
    if (!data.users.some((user) => user.id === userId)) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
      clearApiToken();
      setUserId(null);
      setSessionNote("That session is no longer valid. Sign in again.");
    }
  }, [data, userId]);

  useEffect(() => {
    if (!userId) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void apiLogout();
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(TOKEN_KEY);
        setUserId(null);
        if (apiEnabled()) setData(emptyDesk());
        setSessionNote("You were signed out after 30 minutes of no activity.");
      }, IDLE_MS);
    };
    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [userId]);

  useEffect(() => {
    if (!data) return;
    if (!loadedRef.current.has("tasks") || !loadedRef.current.has("checkpoints")) return;
    const next = alignTaskStatuses(data);
    if (next === data) return;
    // Local-only — never sync status alignment to the API on load (that caused /all + t01..tn storm).
    commit(next, { persist: false });
  }, [data]);

  const commit = (next: StoreData, opts?: { persist?: boolean }) => {
    const prev = data;
    setData(next);
    if (!apiEnabled()) {
      setUsingLocal(true);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return;
    }
    setUsingLocal(false);
    if (opts?.persist === false || !prev) return;
    void syncDeskDiff(prev, next, [...loadedRef.current]).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not save to the API.");
    });
  };

  const sessionUser = data?.users.find((user) => user.id === userId) ?? null;

  const api: StoreApi = {
    data,
    loading,
    pageLoading,
    error,
    usingLocal,
    sessionUser,
    ensureLoaded,
    ensureDashboard,
    ensureReports,
    sessionNote,
    clearSessionNote: () => setSessionNote(null),
    login: async (email, password, remember = false) => {
      if (!apiEnabled()) return "Set VITE_API_URL to sign in.";
      try {
        const result = await apiLogin(email.trim(), password);
        setApiToken(result.token, remember);
        const session = JSON.stringify({
          userId: result.user.id,
          exp: Date.now() + (remember ? 14 * 24 * 60 * 60 * 1000 : IDLE_MS),
        });
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(TOKEN_KEY);
        if (remember) localStorage.setItem(TOKEN_KEY, session);
        else sessionStorage.setItem(SESSION_KEY, session);
        // Keep session user immediately; page ensureLoaded will fetch full collections.
        loadedRef.current.clear();
        inflightRef.current.clear();
        setData({ ...emptyDesk(), users: [result.user] });
        setUsingLocal(false);
        setError(null);
        setSessionNote(null);
        setUserId(result.user.id);
        return null;
      } catch (err: unknown) {
        clearApiToken();
        return err instanceof Error ? err.message : "Could not sign in.";
      }
    },
    logout: () => {
      void apiLogout();
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
      setUserId(null);
      loadedRef.current.clear();
      inflightRef.current.clear();
      dashboardReady.current = false;
      dashboardInflight.current = null;
      reportsReady.current = false;
      if (apiEnabled()) setData(emptyDesk());
    },
    changePassword: async (current, next) => {
      if (!sessionUser) return "Sign in before changing a password.";
      if (!apiEnabled()) return "Set VITE_API_URL to change a password.";
      if (next.trim().length < 4) return "Use at least 4 characters.";
      try {
        await apiPasswordChange(current, next.trim());
        return null;
      } catch (err: unknown) {
        return err instanceof Error ? err.message : "Could not change password.";
      }
    },
    resetSeed: async () => {
      setLoading(true);
      try {
        if (apiEnabled()) {
          if (!getApiToken()) {
            loadedRef.current.clear();
            setData(emptyDesk());
            setUsingLocal(false);
            setError(null);
            return;
          }
          loadedRef.current.clear();
          inflightRef.current.clear();
          dashboardReady.current = false;
          dashboardInflight.current = null;
          reportsReady.current = false;
          if (!userId) {
            setData(emptyDesk());
            setUsingLocal(false);
            setError(null);
            return;
          }
          const detail = await fetchDetail<User & { relations?: unknown }>("users", userId);
          const { relations: _r, ...user } = detail;
          setData({ ...emptyDesk(), users: [user] });
          setUsingLocal(false);
          setError(null);
          return;
        }
        const seed = await fetchSeed(true);
        localStorage.removeItem(STORAGE_KEY);
        loadedRef.current = new Set<FileName>(["users", "projects", "tasks", "assignments", "checkpoints"]);
        setData(seed);
        setUsingLocal(false);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not reload the desk data.");
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
      if (!sessionUser || sessionUser.role !== "admin") return "Only an admin can add people.";
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
      if (!sessionUser) return "Sign in to edit an account.";
      if (sessionUser.role !== "admin" && id !== sessionUser.id) return "You can only edit your own account.";
      const safe = sessionUser.role === "admin" ? patch : { ...patch, role: sessionUser.role };
      const email = safe.email?.trim().toLowerCase();
      if (email && data.users.some((user) => user.id !== id && user.email.toLowerCase() === email)) {
        return "That email is already on the ledger.";
      }
      commit({
        ...data,
        users: data.users.map((user) => (user.id === id ? { ...user, ...safe, email: email ?? user.email } : user)),
      });
      return null;
    },
    deleteUser: (id) => {
      if (!data || !sessionUser || sessionUser.role !== "admin" || id === sessionUser.id) return;
      commit({
        ...data,
        users: data.users.filter((user) => user.id !== id),
        projects: data.projects.map((project) =>
          project.ownerId === id ? { ...project, ownerId: sessionUser.id } : project,
        ),
        assignments: data.assignments.filter((item) => item.userId !== id),
      });
    },
    addProject: (input, ownerName, memberIds = []) => {
      if (!data || sessionUser?.role !== "admin") return;
      const resolved = resolveOwner(data.users, input.ownerId, ownerName);
      const id = nextId("p", data.projects.map((project) => project.id));
      let assignments = withMembership(
        [
          ...data.assignments,
          {
            id: nextId("a", data.assignments.map((item) => item.id)),
            kind: "project" as const,
            projectId: id,
            taskId: null,
            userId: resolved.ownerId,
            role: "lead",
            assignedAt: todayISO(),
          },
        ],
        id,
        resolved.ownerId,
      );
      for (const userId of memberIds) {
        if (userId !== resolved.ownerId) assignments = withMembership(assignments, id, userId);
      }
      commit({
        ...data,
        users: resolved.users,
        projects: [...data.projects, { ...input, id, ownerId: resolved.ownerId }],
        assignments,
      });
    },
    updateProject: (id, patch, ownerName, memberIds) => {
      if (!data || sessionUser?.role !== "admin") return;
      const current = data.projects.find((project) => project.id === id);
      const resolved = resolveOwner(data.users, patch.ownerId ?? current?.ownerId ?? "", ownerName ?? "");
      const ownerId = ownerName !== undefined ? resolved.ownerId : (patch.ownerId ?? current?.ownerId);
      let assignments = ownerId ? withMembership(data.assignments, id, ownerId) : data.assignments;
      if (memberIds && ownerId) {
        const keep = new Set([ownerId, ...memberIds]);
        assignments = assignments.filter((item) => item.kind !== "project" || item.projectId !== id || keep.has(item.userId));
        for (const userId of memberIds) assignments = withMembership(assignments, id, userId);
      }
      commit({
        ...data,
        users: ownerName !== undefined ? resolved.users : data.users,
        assignments,
        projects: data.projects.map((project) => (project.id === id ? { ...project, ...patch, ownerId: ownerId ?? project.ownerId } : project)),
      });
    },
    deleteProject: (id) => {
      if (!data || sessionUser?.role !== "admin") return;
      commit({
        ...data,
        projects: data.projects.filter((project) => project.id !== id),
        tasks: data.tasks.filter((task) => task.projectId !== id),
        assignments: data.assignments.filter((item) => item.projectId !== id),
        checkpoints: data.checkpoints.filter((item) => item.projectId !== id),
      });
    },
    addTask: (input, assigneeIds, role = "assignee") => {
      if (!data || !sessionUser || sessionUser.role === "reviewer" || sessionUser.role === "viewer") return;
      const allowedIds = sessionUser.role === "admin" ? assigneeIds : [sessionUser.id];
      const id = nextId("t", data.tasks.map((task) => task.id));
      let assignments = data.assignments;
      for (const userId of allowedIds) {
        assignments = withMembership(assignments, input.projectId, userId);
        assignments = [
          ...assignments,
          {
            id: nextId("a", assignments.map((item) => item.id)),
            kind: "task" as const,
            projectId: input.projectId,
            taskId: id,
            userId,
            role,
            assignedAt: todayISO(),
          },
        ];
      }
      const taken = new Set(data.tasks.flatMap((task) => task.checkpointIds));
      const checkpointIds = sessionUser.role === "admin" ? input.checkpointIds.filter((item) => !taken.has(item)) : [];
      const created = { ...input, checkpointIds, id, createdBy: sessionUser.id, createdAt: todayISO() };
      commit({
        ...data,
        assignments,
        tasks: withLinks([...data.tasks, created], id, input.blockedByIds ?? [], input.blocksIds ?? [], input.relatedIds ?? []),
      });
    },
    updateTask: (id, patch, assigneeIds) => {
      if (!data || !sessionUser || sessionUser.role === "viewer") return;
      const current = data.tasks.find((task) => task.id === id);
      if (!current) return;
      if (sessionUser.role !== "admin" && !holdsTask(data.assignments, id, sessionUser.id)) return;
      const memberPatch = { ...patch };
      delete memberPatch.checkpointIds;
      const nextPatch = sessionUser.role === "reviewer" ? { status: patch.status ?? current.status, comments: patch.comments ?? current.comments } : sessionUser.role === "admin" ? patch : memberPatch;
      const nextAssignees = assigneeIds === undefined ? undefined : sessionUser.role === "member" ? [sessionUser.id] : assigneeIds;
      const projectId = nextPatch.projectId ?? current.projectId;
      let assignments = data.assignments.map((item) => (item.taskId === id ? { ...item, projectId } : item));
      if (nextAssignees) {
        const previous = assignments.filter((item) => item.kind === "task" && item.taskId === id);
        assignments = assignments.filter((item) => !(item.kind === "task" && item.taskId === id));
        const ordered = [
          ...nextAssignees.filter((userId) => previous.some((item) => item.userId === userId)),
          ...nextAssignees.filter((userId) => !previous.some((item) => item.userId === userId)),
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
      const taken = new Set(data.tasks.filter((task) => task.id !== id).flatMap((task) => task.checkpointIds));
      const chosen = patch.checkpointIds && sessionUser.role === "admin" ? patch.checkpointIds.filter((item) => !taken.has(item) || current.checkpointIds.includes(item)) : null;
      const stamp = nowStamp();
      const nextStatus = nextPatch.status ?? current.status;
      const events = [...(current.activity ?? [])];
      const note = (text: string) => events.push({ id: nextId("e", events.map((item) => item.id)), at: stamp, text });
      if (nextStatus !== current.status) note(`${sessionUser.name} changed status → ${label(nextStatus)}`);
      if (nextPatch.dueDate && nextPatch.dueDate !== current.dueDate) note(`${sessionUser.name} changed the deadline to ${nextPatch.dueDate}`);
      if (nextAssignees) {
        const previousIds = data.assignments.filter((item) => item.kind === "task" && item.taskId === id).map((item) => item.userId);
        const added = nextAssignees.filter((userId) => !previousIds.includes(userId));
        if (added.length) note(`${sessionUser.name} assigned ${current.title} to ${added.map((userId) => personName(data.users, userId)).join(", ")}`);
      }
      const previousComments = current.comments ?? [];
      const nextComments = nextPatch.comments ?? previousComments;
      for (const item of nextComments.filter((comment) => !previousComments.some((commentItem) => commentItem.id === comment.id))) {
        note(`${personName(data.users, item.userId)} added a comment`);
      }
      const becameDone = nextStatus === "done" && current.status !== "done";
      const leftDone = nextStatus !== "done" && current.status === "done";
      const owned = new Set(current.checkpointIds);
      commit({
        ...data,
        assignments,
        checkpoints: data.checkpoints.map((item) => {
          if (!becameDone || !owned.has(item.id)) return item;
          if (item.state === "done" && item.doneAt) return item;
          return { ...item, state: "done" as const, doneAt: item.doneAt ?? stamp };
        }),
        tasks: withLinks(
          data.tasks.map((task) => {
            if (task.id === id) {
              return {
                ...task,
                ...nextPatch,
                checkpointIds: chosen ?? task.checkpointIds,
                activity: events,
                updatedAt: stamp,
                doneAt: becameDone ? stamp : leftDone ? null : task.doneAt ?? null,
              };
            }
            return task;
          }),
          id,
          nextPatch.blockedByIds ?? current.blockedByIds ?? [],
          nextPatch.blocksIds ?? current.blocksIds ?? [],
          nextPatch.relatedIds ?? current.relatedIds ?? [],
        ),
      });
    },
    deleteTask: (id) => {
      if (!data || sessionUser?.role !== "admin") return;
      commit({
        ...data,
        tasks: data.tasks.filter((task) => task.id !== id).map((task) => ({
          ...task,
          parentId: task.parentId === id ? null : task.parentId,
          blockedByIds: (task.blockedByIds ?? []).filter((item) => item !== id),
          blocksIds: (task.blocksIds ?? []).filter((item) => item !== id),
          relatedIds: (task.relatedIds ?? []).filter((item) => item !== id),
        })),
        assignments: data.assignments.filter((item) => item.taskId !== id),
      });
    },
    addAssignment: (input) => {
      if (!data || sessionUser?.role !== "admin") return "Only an admin can change assignments.";
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
      if (!data || sessionUser?.role !== "admin") return;
      commit({
        ...data,
        assignments: data.assignments.map((item) => (item.id === id ? { ...item, role } : item)),
      });
    },
    addCheckpoint: (input) => {
      if (!data || sessionUser?.role !== "admin") return;
      const id = nextId("c", data.checkpoints.map((item) => item.id));
      commit({
        ...data,
        checkpoints: [
          ...data.checkpoints,
          {
            ...input,
            id,
            doneAt: input.state === "done" ? nowStamp() : null,
            details: (input.details ?? "").trim(),
            link: (input.link ?? "").trim(),
            photo: (input.photo ?? "").trim(),
          },
        ],
      });
    },
    updateCheckpoint: (id, patch) => {
      if (!data || !sessionUser) return;
      const current = data.checkpoints.find((item) => item.id === id);
      if (!current) return;
      const mine = data.tasks.some((task) => task.checkpointIds.includes(id) && holdsTask(data.assignments, task.id, sessionUser.id));
      const nextPatch = sessionUser.role === "admin" ? patch : mine && patch.state ? { state: patch.state } : null;
      if (!nextPatch) return;
      const checkpoints = data.checkpoints.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...nextPatch };
        if (nextPatch.details !== undefined) next.details = nextPatch.details.trim();
        if (nextPatch.link !== undefined) next.link = nextPatch.link.trim();
        if (nextPatch.photo !== undefined) next.photo = nextPatch.photo.trim();
        if (next.state === "done" && item.state !== "done") next.doneAt = nowStamp();
        if (next.state !== "done") next.doneAt = null;
        return next;
      });
      commit(alignTaskStatuses({ ...data, checkpoints }));
    },
    removeAssignment: (id) => {
      if (!data || sessionUser?.role !== "admin") return;
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
