import type { ReactNode } from "react";
import { hue, initials, label } from "../lib";

export type IconName =
  | "desk"
  | "projects"
  | "tasks"
  | "people"
  | "assign"
  | "search"
  | "plus"
  | "download"
  | "refresh"
  | "logout"
  | "enter"
  | "close"
  | "alert";

const ICONS: Record<IconName, ReactNode> = {
  desk: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  projects: (
    <path d="M3.5 7.5h5.2l1.8 2h10v9.2a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3V7.5z" />
  ),
  tasks: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 12.2l2.3 2.3 4.7-5" />
    </>
  ),
  people: (
    <>
      <path d="M16 20.5v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.2a3.4 3.4 0 0 0-3.4 3.4v1.6" />
      <circle cx="9.9" cy="8.2" r="2.7" />
      <path d="M20.2 20.5v-1.4a3.2 3.2 0 0 0-2.4-3.1" />
      <path d="M15.2 5.6a2.7 2.7 0 0 1 0 5.1" />
    </>
  ),
  assign: (
    <>
      <path d="M10 13.2a4.2 4.2 0 0 0 6.3.5l2.2-2.2a4.2 4.2 0 0 0-6-6l-1.2 1.2" />
      <path d="M14 10.8a4.2 4.2 0 0 0-6.3-.5l-2.2 2.2a4.2 4.2 0 0 0 6 6l1.2-1.2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16.2L20 20" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  download: (
    <>
      <path d="M12 4v10" />
      <path d="M8.2 10.2L12 14l3.8-3.8" />
      <path d="M5 19.5h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 4.5V9h-4.5" />
    </>
  ),
  logout: (
    <>
      <path d="M9 20H6.2A1.7 1.7 0 0 1 4.5 18.3V5.7A1.7 1.7 0 0 1 6.2 4H9" />
      <path d="M14 16.5L18.5 12 14 7.5" />
      <path d="M18.2 12H9" />
    </>
  ),
  enter: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6.5L18.5 12 13 17.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Loader({ label }: { label: string }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="loader">
        <span className="loader-ring" />
        <Mark />
      </div>
      <p>{label}</p>
    </div>
  );
}

export function Avatar({ name, id }: { name: string; id: string }) {
  return (
    <span className="avatar" style={{ background: `hsl(${hue(id)} 42% 42%)` }} title={name}>
      {initials(name) || "?"}
    </span>
  );
}

export function Pill({ value }: { value: string }) {
  return (
    <span className={`pill pill-${value}`}>
      <i />
      {label(value)}
    </span>
  );
}

export function IdChip({ id }: { id: string }) {
  return <span className="idchip">{id}</span>;
}

export function Field({ label: text, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{text}</span>
      {children}
    </label>
  );
}

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 7 L18.1 16 L16 14.4 L13.9 16 Z" fill="currentColor" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}
