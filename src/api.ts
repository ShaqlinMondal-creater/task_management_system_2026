import type { FileName, StoreData, User } from "./types";

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

export async function fetchCollection<T>(name: FileName): Promise<T[]> {
  const res = await apiFetch(`/api/${name}/all`);
  if (!res.ok) throw new Error(await readError(res, `Could not load ${name} from the API.`));
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`${name} from the API must be a list.`);
  return json as T[];
}

export async function fetchDetail<T extends { id: string }>(name: FileName, id: string): Promise<T> {
  const res = await apiFetch(`/api/${name}/detail/${id}`);
  if (!res.ok) throw new Error(await readError(res, `Could not load ${name}/${id}.`));
  return (await res.json()) as T;
}

export async function apiCreate<T extends { id: string }>(name: FileName, row: T): Promise<T> {
  const res = await apiFetch(`/api/${name}/create`, { method: "POST", body: JSON.stringify(row) });
  if (!res.ok) throw new Error(await readError(res, `Could not create ${name}.`));
  return (await res.json()) as T;
}

export async function apiUpdate<T extends { id: string }>(name: FileName, id: string, row: Partial<T> & { id?: string }): Promise<T> {
  const res = await apiFetch(`/api/${name}/update/${id}`, { method: "POST", body: JSON.stringify(row) });
  if (!res.ok) throw new Error(await readError(res, `Could not update ${name}/${id}.`));
  return (await res.json()) as T;
}

export async function apiDelete(name: FileName, id: string): Promise<void> {
  const res = await apiFetch(`/api/${name}/delete/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(await readError(res, `Could not delete ${name}/${id}.`));
}

export type DashboardSummary = {
  metrics: Record<string, number>;
  desk: StoreData;
};

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await apiFetch("/api/dashboard/summary");
  if (!res.ok) throw new Error(await readError(res, "Could not load the dashboard."));
  return (await res.json()) as DashboardSummary;
}

export async function fetchReportsSummary(projectId = "all"): Promise<DashboardSummary> {
  const q = projectId && projectId !== "all" ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const res = await apiFetch(`/api/reports/summary${q}`);
  if (!res.ok) throw new Error(await readError(res, "Could not load reports."));
  return (await res.json()) as DashboardSummary;
}

export type NoticeItem = {
  id: string;
  kind: string;
  when: string;
  title: string;
  detail: string;
};

export async function fetchNotifications(): Promise<NoticeItem[]> {
  const res = await apiFetch("/api/notifications/all");
  if (!res.ok) throw new Error(await readError(res, "Could not load notifications."));
  const json = (await res.json()) as { notices?: NoticeItem[] };
  return Array.isArray(json.notices) ? json.notices : [];
}

export type ConstraintsMap = {
  roles: string[];
  userStatuses: string[];
  projectStatuses: string[];
  taskStatuses: string[];
  priorities: string[];
  assignmentKinds: string[];
  checkpointStates: string[];
  checkpointAreas: string[];
};

export async function fetchConstraints(): Promise<ConstraintsMap> {
  const res = await apiFetch("/api/auth/constraints");
  if (!res.ok) throw new Error(await readError(res, "Could not load constraints."));
  return (await res.json()) as ConstraintsMap;
}

export async function updateConstraints(patch: Partial<ConstraintsMap>): Promise<ConstraintsMap> {
  const res = await apiFetch("/api/auth/constraint-update", {
    method: "POST",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not update constraints."));
  const json = (await res.json()) as { constraints: ConstraintsMap };
  return json.constraints;
}

export type TableInfo = {
  name: string;
  file: string;
  shape: "array" | "object" | "unknown";
  rows: number;
};

export type TableDetail = {
  name: string;
  file: string;
  shape: "array" | "object";
  columns: string[];
  rows: Record<string, unknown>[];
};

export async function fetchTables(): Promise<TableInfo[]> {
  const res = await apiFetch("/api/tables/all");
  if (!res.ok) throw new Error(await readError(res, "Could not list tables."));
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("Tables list must be an array.");
  return json as TableInfo[];
}

export async function fetchTableDetail(name: string): Promise<TableDetail> {
  const res = await apiFetch(`/api/tables/detail/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(await readError(res, `Could not load table ${name}.`));
  return (await res.json()) as TableDetail;
}

export async function updateTableCell(
  name: string,
  input: { rowId: string; column: string; value: unknown },
): Promise<TableDetail> {
  const res = await apiFetch(`/api/tables/cell/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, `Could not update ${name}.`));
  return (await res.json()) as TableDetail;
}

export type TablesStatus = {
  hasUsers: boolean;
  needsImport: boolean;
  files: string[];
};

export async function fetchTablesStatus(): Promise<TablesStatus> {
  if (!BASE) throw new Error("VITE_API_URL is not set.");
  const res = await fetch(`${BASE}/api/tables/status`);
  if (!res.ok) throw new Error(await readError(res, "Could not check table status."));
  return (await res.json()) as TablesStatus;
}

export async function importTableFiles(files: Record<string, unknown>) {
  const res = await apiFetch("/api/tables/import", {
    method: "POST",
    body: JSON.stringify({ files }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not import JSON."));
  return (await res.json()) as { ok: boolean; written: string[]; status: TablesStatus };
}

/** Read browser FileList of *.json into { users: [...], ... }. */
export async function readJsonFileList(list: FileList | File[]): Promise<Record<string, unknown>> {
  const files: Record<string, unknown> = {};
  for (const file of Array.from(list)) {
    const name = file.name.replace(/\.json$/i, "").trim();
    if (!name) continue;
    const text = await file.text();
    try {
      files[name] = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`${file.name} is not valid JSON.`);
    }
  }
  if (!Object.keys(files).length) throw new Error("Choose at least one .json file.");
  return files;
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

export async function apiRegister(input: { name: string; email: string; password: string; mobile?: string }) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not create account."));
  return (await res.json()) as { ok: boolean; user: User };
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

type Row = { id: string };

/** Persist only real row changes via create / update / delete. */
export async function syncDeskDiff(prev: StoreData, next: StoreData, loaded: FileName[]) {
  if (!BASE) throw new Error("VITE_API_URL is not set.");
  if (!getApiToken()) throw new Error("Sign in required");
  if (!loaded.length) return;

  const orderDelete: FileName[] = ["assignments", "tasks", "checkpoints", "projects", "users"];
  const orderUpsert: FileName[] = ["users", "projects", "checkpoints", "tasks", "assignments"];

  for (const name of orderDelete) {
    if (!loaded.includes(name)) continue;
    const nextIds = new Set(next[name].map((row) => row.id));
    for (const row of prev[name] as Row[]) {
      if (nextIds.has(row.id)) continue;
      await apiDelete(name, row.id);
    }
  }

  for (const name of orderUpsert) {
    if (!loaded.includes(name)) continue;
    const prevById = new Map((prev[name] as Row[]).map((row) => [row.id, row]));
    for (const row of next[name] as Row[]) {
      const old = prevById.get(row.id);
      if (!old) {
        await apiCreate(name, row);
        continue;
      }
      if (JSON.stringify(old) === JSON.stringify(row)) continue;
      await apiUpdate(name, row.id, row);
    }
  }
}
