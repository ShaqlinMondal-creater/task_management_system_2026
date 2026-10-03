import type { Assignment, Checkpoint, FileName, Project, StoreData, Task, User } from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiEnabled() {
  return Boolean(BASE);
}

export function apiBase() {
  return BASE;
}

async function readCollection<T>(name: FileName): Promise<T[]> {
  const res = await fetch(`${BASE}/api/${name}`);
  if (!res.ok) throw new Error(`Could not load ${name} from the API.`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`${name} from the API must be a list.`);
  return json as T[];
}

export async function fetchDesk(): Promise<StoreData> {
  if (!BASE) throw new Error("VITE_API_URL is not set.");
  const [users, projects, tasks, assignments, checkpoints] = await Promise.all([
    readCollection<User>("users"),
    readCollection<Project>("projects"),
    readCollection<Task>("tasks"),
    readCollection<Assignment>("assignments"),
    readCollection<Checkpoint>("checkpoints"),
  ]);
  return { users, projects, tasks, assignments, checkpoints };
}

export async function saveDesk(data: StoreData) {
  if (!BASE) throw new Error("VITE_API_URL is not set.");
  const names: FileName[] = ["users", "projects", "tasks", "assignments", "checkpoints"];
  await Promise.all(
    names.map(async (name) => {
      const res = await fetch(`${BASE}/api/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data[name]),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Could not save ${name} to the API.`);
      }
    }),
  );
}
