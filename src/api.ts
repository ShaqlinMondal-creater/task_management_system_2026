import type { Assignment, Checkpoint, FileName, Project, StoreData, Task, User } from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_TOKEN_KEY = "northline.apiToken";

export function apiEnabled() {
  return Boolean(BASE);
}

export function apiBase() {
  return BASE;
}

export function getApiToken() {
  return sessionStorage.getItem(API_TOKEN_KEY) || localStorage.getItem(API_TOKEN_KEY) || "";
}

export function setApiToken(token: string, remember = false) {
  clearApiToken();
  if (remember) localStorage.setItem(API_TOKEN_KEY, token);
  else sessionStorage.setItem(API_TOKEN_KEY, token);
}

export function clearApiToken() {
  sessionStorage.removeItem(API_TOKEN_KEY);
  localStorage.removeItem(API_TOKEN_KEY);
}

export function emptyDesk(): StoreData {
  return { users: [], projects: [], tasks: [], assignments: [], checkpoints: [] };
}

async function readError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null;
  if (body?.details?.length) return body.details.join("; ");
  return body?.error || fallback;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  if (!BASE) throw new Error("VITE_API_URL is not set.");
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearApiToken();
  }
  return res;
}

async function readAll<T>(name: FileName): Promise<T[]> {
  const res = await apiFetch(`/api/${name}/all`);
  if (!res.ok) throw new Error(await readError(res, `Could not load ${name} from the API.`));
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`${name} from the API must be a list.`);
  return json as T[];
}

type Row = { id: string };

async function deleteMissing(name: FileName, nextRows: Row[]) {
  const current = await readAll<Row>(name);
  const nextIds = new Set(nextRows.map((row) => row.id));
  for (const row of current) {
    if (nextIds.has(row.id)) continue;
    const res = await apiFetch(`/api/${name}/delete/${row.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(await readError(res, `Could not delete ${name}/${row.id}.`));
  }
}

async function upsertRows(name: FileName, nextRows: Row[]) {
  const current = await readAll<Row>(name);
  const currentById = new Map(current.map((row) => [row.id, row]));
  for (const row of nextRows) {
    if (!currentById.has(row.id)) {
      const res = await apiFetch(`/api/${name}/create`, {
        method: "POST",
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(await readError(res, `Could not create ${name}/${row.id}.`));
      continue;
    }
    if (JSON.stringify(currentById.get(row.id)) === JSON.stringify(row)) continue;
    const res = await apiFetch(`/api/${name}/update/${row.id}`, {
      method: "POST",
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(await readError(res, `Could not update ${name}/${row.id}.`));
  }
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not sign in."));
  return (await res.json()) as { user: User; token: string };
}

export async function apiLogout() {
  const token = getApiToken();
  if (!token || !BASE) return;
  await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  clearApiToken();
}

export async function apiForgot(email: string) {
  const res = await fetch(`${BASE}/api/auth/forgot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not start password reset."));
  return (await res.json()) as { email: string; code: string; message: string };
}

export async function apiPasswordUpdate(email: string, code: string, newPassword: string) {
  const res = await fetch(`${BASE}/api/auth/password-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, newPassword }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not reset password."));
  return (await res.json()) as { ok: boolean };
}

export async function apiPasswordChange(currentPassword: string, newPassword: string) {
  const res = await apiFetch("/api/auth/password-change", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not change password."));
  return (await res.json()) as { ok: boolean };
}

export async function fetchDesk(): Promise<StoreData> {
  if (!BASE) throw new Error("VITE_API_URL is not set.");
  if (!getApiToken()) throw new Error("Sign in required");
  const [users, projects, tasks, assignments, checkpoints] = await Promise.all([
    readAll<User>("users"),
    readAll<Project>("projects"),
    readAll<Task>("tasks"),
    readAll<Assignment>("assignments"),
    readAll<Checkpoint>("checkpoints"),
  ]);
  return { users, projects, tasks, assignments, checkpoints };
}

/** Temporary bridge: uses the five CRUD routes until store actions call them directly. */
export async function saveDesk(data: StoreData) {
  if (!BASE) throw new Error("VITE_API_URL is not set.");
  if (!getApiToken()) throw new Error("Sign in required");
  await deleteMissing("assignments", data.assignments);
  await deleteMissing("tasks", data.tasks);
  await deleteMissing("checkpoints", data.checkpoints);
  await deleteMissing("projects", data.projects);
  await deleteMissing("users", data.users);
  await upsertRows("users", data.users);
  await upsertRows("projects", data.projects);
  await upsertRows("checkpoints", data.checkpoints);
  await upsertRows("tasks", data.tasks);
  await upsertRows("assignments", data.assignments);
}
