import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Avatar, Icon, Mark } from "./components/Bits";
import { Confirm } from "./components/Modal";
import { Drawer, Dropdown, Tooltip } from "./components/System";
import type { IconName } from "./components/Bits";
import { scopeFor, viewsFor } from "./access";
import type { ViewId } from "./access";
import { ago, greeting, isOverdue, label, openTasks, personName, taskLinks, todayISO } from "./lib";
import { useStore } from "./store";
import type { FileName, NoticeKind } from "./types";
import { StoreProvider } from "./store";
import { ToastProvider, useToast } from "./toast";
import { Login } from "./views/Login";
import type { ProfileTab } from "./views/Settings";

const Assignments = lazy(() => import("./views/Assignments").then((m) => ({ default: m.Assignments })));
const Admin = lazy(() => import("./views/Admin").then((m) => ({ default: m.Admin })));
const Checkpoints = lazy(() => import("./views/Checkpoints").then((m) => ({ default: m.Checkpoints })));
const Desk = lazy(() => import("./views/Desk").then((m) => ({ default: m.Desk })));
const People = lazy(() => import("./views/People").then((m) => ({ default: m.People })));
const Projects = lazy(() => import("./views/Projects").then((m) => ({ default: m.Projects })));
const Reports = lazy(() => import("./views/Reports").then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import("./views/Settings").then((m) => ({ default: m.Settings })));
const Tasks = lazy(() => import("./views/Tasks").then((m) => ({ default: m.Tasks })));

const VIEW_KEY = "northline.view";
const VIEWS: ViewId[] = ["desk", "projects", "tasks", "people", "assign", "checks", "admin", "settings", "reports"];

function savedView(): ViewId {
  const saved = sessionStorage.getItem(VIEW_KEY);
  return VIEWS.includes(saved as ViewId) ? (saved as ViewId) : "desk";
}

const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: "desk", label: "Dashboard", icon: "desk" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "reports", label: "Reports", icon: "chart" },
  { id: "people", label: "People", icon: "people" },
  { id: "assign", label: "Assignments", icon: "assign" },
  { id: "checks", label: "Checkpoints", icon: "check" },
  { id: "admin", label: "Admin", icon: "alert" },
];

function Shell() {
  const store = useStore();
  const [view, setView] = useState<ViewId>(savedView);
  const [intent, setIntent] = useState<"create-task" | "create-project" | "invite" | "my-tasks" | null>(null);
  const [query, setQuery] = useState("");
  const [liveQuery, setLiveQuery] = useState("");
  const [seedAsk, setSeedAsk] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<ProfileTab>("account");
  const profileRef = useRef<HTMLElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const push = useToast();

  function openSettings(tab: ProfileTab = "account") {
    setSettingsTab(tab);
    openView("settings");
  }

  function openView(next: ViewId, nextIntent: "create-task" | "create-project" | "invite" | "my-tasks" | null = null) {
    setView(next);
    setIntent(nextIntent);
    sessionStorage.setItem(VIEW_KEY, next);
    setDrawer(false);
    setProfileOpen(false);
    setNotesOpen(false);
  }

  useEffect(() => {
    document.documentElement.lang = store.sessionUser?.settings?.language === "hi" ? "hi" : "en";
  }, [store.sessionUser?.settings?.language]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLiveQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawer(false);
      setProfileOpen(false);
      setNotesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!profileOpen && !notesOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (notesRef.current && !notesRef.current.contains(target)) setNotesOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [profileOpen, notesOpen]);

  if (store.loading) return <ShellSkeleton />;

  if (!store.data) {
    return (
      <div className="boot error-state" role="alert">
        <div className="error-mark">
          <Icon name="alert" />
        </div>
        <h1>The desk could not open</h1>
        <p>{store.error ?? "The ledger could not be opened."}</p>
        <button type="button" className="btn primary" onClick={() => void store.resetSeed()}>
          Try again
        </button>
      </div>
    );
  }

  if (!store.sessionUser) return <Login />;

  const user = store.sessionUser;
  const allowed = viewsFor(user.role);
  const nav = NAV.filter((item) => allowed.includes(item.id));
  const active = allowed.includes(view) ? view : "desk";
  const page = nav.find((item) => item.id === active);
  const scoped = scopeFor(store.data, user);
  const counts: Record<ViewId, number> = {
    desk: openTasks(scoped.tasks).length,
    projects: scoped.projects.length,
    tasks: scoped.tasks.length,
    people: scoped.users.length,
    assign: scoped.assignments.length,
    checks: store.data.checkpoints.length,
    admin: store.data.users.length,
    settings: 0,
    reports: scoped.tasks.filter((task) => isOverdue(task.dueDate, task.status)).length,
  };
  const heading = active === "desk" ? `${greeting()}, ${user.name.split(" ")[0]}` : active === "settings" ? "Profile" : page?.label;
  const data = store.data;
  const mine = data.tasks.filter((task) => taskLinks(data.assignments, task.id).some((link) => link.userId === user.id));
  const endSoon = shiftDay(todayISO(), 1);
  const notes = [
    ...data.assignments.filter((item) => item.kind === "task" && item.userId === user.id && item.taskId).map((item) => ({
      id: `assign-${item.id}`,
      kind: "assigned" as NoticeKind,
      when: item.assignedAt,
      title: "Task assigned to you",
      detail: data.tasks.find((task) => task.id === item.taskId)?.title ?? "Task",
    })),
    ...data.assignments.filter((item) => item.kind === "project" && item.userId === user.id && item.role !== "lead").map((item) => ({
      id: `invite-${item.id}`,
      kind: "invite" as NoticeKind,
      when: item.assignedAt,
      title: "Project invitation",
      detail: data.projects.find((project) => project.id === item.projectId)?.name ?? "Project",
    })),
    ...data.tasks.flatMap((task) => (task.comments ?? []).filter((comment) => comment.userId !== user.id && comment.body.includes(`@${user.name}`)).map((comment) => ({
      id: `mention-${comment.id}`,
      kind: "mention" as NoticeKind,
      when: comment.at,
      title: `${personName(data.users, comment.userId)} mentioned you`,
      detail: task.title,
    }))),
    ...mine.flatMap((task) => (task.comments ?? []).filter((comment) => comment.userId !== user.id && !comment.body.includes(`@${user.name}`)).map((comment) => ({
      id: `comment-${comment.id}`,
      kind: "comment" as NoticeKind,
      when: comment.at,
      title: `${personName(data.users, comment.userId)} added a comment`,
      detail: task.title,
    }))),
    ...mine.filter((task) => task.status !== "done" && task.dueDate >= todayISO() && task.dueDate <= endSoon).map((task) => ({
      id: `soon-${task.id}`,
      kind: "due" as NoticeKind,
      when: task.dueDate,
      title: task.dueDate === todayISO() ? "Task deadline today" : "Task deadline tomorrow",
      detail: task.title,
    })),
    ...mine.filter((task) => isOverdue(task.dueDate, task.status)).map((task) => ({
      id: `late-${task.id}`,
      kind: "overdue" as NoticeKind,
      when: task.dueDate,
      title: "Task is overdue",
      detail: task.title,
    })),
    ...mine.filter((task) => task.status === "done").map((task) => ({
      id: `done-${task.id}`,
      kind: "completed" as NoticeKind,
      when: task.doneAt || task.updatedAt || task.createdAt,
      title: "Task completed",
      detail: task.title,
    })),
    ...mine.flatMap((task) => (task.activity ?? []).filter((item) => item.text.includes("changed status") && !item.text.startsWith(user.name)).map((item) => ({
      id: `status-${item.id}`,
      kind: "status" as NoticeKind,
      when: item.at,
      title: "Status changed",
      detail: `${task.title} · ${item.text}`,
    }))),
  ].filter((item) => user.settings?.notices?.[item.kind] !== false).sort((a, b) => b.when.localeCompare(a.when)).slice(0, 12);

  function save(name: FileName) {
    store.exportFile(name);
    push(`${name}.json downloaded`);
  }

  const renderNav = () =>
    nav.map((item) => (
      <button key={item.id} type="button" className="nav-btn" aria-current={active === item.id ? "page" : undefined} onClick={() => openView(item.id)}>
        <Tooltip text={item.label}><Icon name={item.icon} /></Tooltip>
        <span className="nav-label">{item.label}</span>
        <span className="nav-count">{counts[item.id]}</span>
      </button>
    ));

  return (
    <div className={user.settings?.density === "compact" ? "app compact" : "app"}>
      <aside className="rail">
        <div className="brand">
          <Mark />
          <div>
            <strong>Northline</strong>
            <span>Task desk</span>
          </div>
        </div>
        <nav className="nav" aria-label="Desk">{renderNav()}</nav>
        <button type="button" className="rail-user" onClick={() => openSettings("account")}>
          <Avatar name={user.name} id={user.id} photo={user.photo} />
          <div>
            <strong>{user.name}</strong>
            <span>{label(user.role)}</span>
          </div>
        </button>
      </aside>
      {drawer && (
        <Drawer title="Navigation" onClose={() => setDrawer(false)}>
            <div className="brand">
              <Mark />
              <div>
                <strong>Northline</strong>
                <span>Task desk</span>
              </div>
              <button type="button" className="icon-btn drawer-close" onClick={() => setDrawer(false)} aria-label="Close navigation">
                <Icon name="close" />
              </button>
            </div>
            <nav className="nav">{renderNav()}</nav>
        </Drawer>
      )}
      <div className="main">
        <header className="topbar">
          <div className="top-title">
            <button type="button" className="icon-btn nav-toggle" aria-label="Open navigation" onClick={() => setDrawer(true)}>
              <Icon name="menu" />
            </button>
            <div>
              <nav className="crumbs" aria-label="Breadcrumb">
                <span>Northline</span>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{active === "settings" ? "Profile" : page?.label ?? "Dashboard"}</span>
              </nav>
              <h1>{heading}</h1>
            </div>
          </div>
          <div className="top-actions">
            <label className="search-wrap">
              <Icon name="search" />
              <input
                className="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={user.role === "admin" ? "Search names, titles, ids" : "Search your tasks"}
                aria-label="Search the ledger"
              />
            </label>
            <div className="pop" ref={notesRef}>
              <button
                type="button"
                className="icon-btn bell"
                aria-label={`Notifications, ${notes.length}`}
                aria-expanded={notesOpen}
                onClick={() => {
                  setNotesOpen((open) => !open);
                  setProfileOpen(false);
                }}
              >
                <Icon name="bell" />
                {notes.length > 0 && <span className="badge">{notes.length}</span>}
              </button>
              {notesOpen && (
                <div className="menu notes">
                  <p>Notifications</p>
                  {notes.length === 0 && <p className="empty">No notifications yet.</p>}
                  {notes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setNotesOpen(false);
                        openView("tasks");
                      }}
                    >
                      <Icon name="bell" />
                      <span>
                        <strong>{item.title}</strong>
                        {item.detail}
                        <small>{ago(item.when)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {user.role === "admin" && (
              <Dropdown label={<><Icon name="download" /> {store.usingLocal ? "Working copy" : "JSON files"}</>}>
                <p>Edits stay in this browser. Download a file and replace the matching one in public/assets, then reload the seed.</p>
                <button type="button" onClick={() => save("users")}><Icon name="download" /> users.json</button>
                <button type="button" onClick={() => save("projects")}><Icon name="download" /> projects.json</button>
                <button type="button" onClick={() => save("tasks")}><Icon name="download" /> tasks.json</button>
                <button type="button" onClick={() => save("assignments")}><Icon name="download" /> assignments.json</button>
                <button type="button" onClick={() => save("checkpoints")}><Icon name="download" /> checkpoints.json</button>
                <button
                  type="button"
                  onClick={() => setSeedAsk(true)}
                >
                  <Icon name="refresh" /> Reload seed
                </button>
              </Dropdown>
            )}
            <Dropdown
              className="pop"
              summaryClass="profile-btn"
              menuClass="profile-menu"
              rootRef={profileRef}
              open={profileOpen}
              onToggle={(open) => {
                setProfileOpen(open);
                if (open) setNotesOpen(false);
              }}
              label={<><Avatar name={user.name} id={user.id} photo={user.photo} /><span className="profile-name">{user.name.split(" ")[0]}</span></>}
            >
              <p>
                <strong>{user.name}</strong>
                {user.email}
                {user.mobile && <small>{user.mobile}</small>}
                {user.bio && <small>{user.bio}</small>}
                <small>{label(user.role)}</small>
              </p>
              <button type="button" onClick={() => openSettings("account")}>
                <Icon name="people" /> Your account
              </button>
              <button type="button" onClick={() => openSettings("security")}>
                <Icon name="check" /> Change password
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(VIEW_KEY);
                  store.logout();
                }}
              >
                <Icon name="logout" /> Sign out
              </button>
            </Dropdown>
          </div>
        </header>
        {store.error && (
          <div className="error-banner" role="alert">
            <Icon name="alert" />
            <div>
              <strong>Something went wrong</strong>
              <p>{store.error}</p>
            </div>
            <button type="button" className="btn ghost small" onClick={() => void store.resetSeed()}>
              Try again
            </button>
          </div>
        )}
        {user.role === "admin" && store.usingLocal && (
          <p className="banner">This browser is using your working copy. The files in public/assets are still the original seed.</p>
        )}
        <div className="content">
          <Suspense fallback={<p className="empty">Opening this page…</p>}>
            {active === "desk" && <Desk query={liveQuery} onOpen={openView} />}
            {active === "projects" && <Projects query={liveQuery} intent={intent} onIntent={() => setIntent(null)} />}
            {active === "tasks" && <Tasks query={liveQuery} intent={intent} onIntent={() => setIntent(null)} />}
            {active === "people" && <People query={liveQuery} intent={intent} onIntent={() => setIntent(null)} />}
            {active === "assign" && <Assignments query={liveQuery} />}
            {active === "checks" && <Checkpoints query={liveQuery} />}
            {active === "admin" && <Admin query={liveQuery} />}
            {active === "reports" && <Reports query={liveQuery} />}
            {active === "settings" && <Settings key={user.id} tab={settingsTab} onTab={setSettingsTab} />}
          </Suspense>
        </div>
      </div>
      {seedAsk && (
        <Confirm
          title="Reload seed"
          body="This replaces the working copy in this browser with the files in public/assets."
          confirmLabel="Reload seed"
          onCancel={() => setSeedAsk(false)}
          onConfirm={() => {
            setSeedAsk(false);
            void store.resetSeed().then(() => push("Seed reloaded"));
          }}
        />
      )}
    </div>
  );
}

function shiftDay(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function ShellSkeleton() {
  return (
    <div className="app" role="status" aria-live="polite">
      <aside className="rail" aria-hidden="true">
        <div className="skel skel-brand" />
        <div className="nav">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="skel skel-nav" />
          ))}
        </div>
      </aside>
      <div className="main" aria-hidden="true">
        <header className="topbar">
          <div className="skel skel-title" />
        </header>
        <div className="content">
          <div className="metrics">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="skel skel-metric" />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Opening the desk</span>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}
