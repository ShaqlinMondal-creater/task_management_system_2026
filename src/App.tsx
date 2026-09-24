import { useEffect, useRef, useState } from "react";
import { Avatar, Icon, Mark } from "./components/Bits";
import { Modal } from "./components/Modal";
import { Drawer, Dropdown, Tooltip } from "./components/System";
import type { IconName } from "./components/Bits";
import { scopeFor, viewsFor } from "./access";
import type { ViewId } from "./access";
import { formatDate, greeting, label, openTasks, personName } from "./lib";
import { useStore } from "./store";
import type { FileName } from "./types";
import { StoreProvider } from "./store";
import { ToastProvider, useToast } from "./toast";
import { Assignments } from "./views/Assignments";
import { Checkpoints } from "./views/Checkpoints";
import { Desk } from "./views/Desk";
import { ChangePassword, Login } from "./views/Login";
import { People } from "./views/People";
import { Projects } from "./views/Projects";
import { Tasks } from "./views/Tasks";

const VIEW_KEY = "northline.view";
const VIEWS: ViewId[] = ["desk", "projects", "tasks", "people", "assign", "checks"];

function savedView(): ViewId {
  const saved = sessionStorage.getItem(VIEW_KEY);
  return VIEWS.includes(saved as ViewId) ? (saved as ViewId) : "desk";
}

const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: "desk", label: "Dashboard", icon: "desk" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "people", label: "People", icon: "people" },
  { id: "assign", label: "Assignments", icon: "assign" },
  { id: "checks", label: "Checkpoints", icon: "check" },
];

function Shell() {
  const store = useStore();
  const [view, setView] = useState<ViewId>(savedView);
  const [intent, setIntent] = useState<"create-task" | "create-project" | "invite" | "my-tasks" | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const profileRef = useRef<HTMLElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const push = useToast();

  function openView(next: ViewId, nextIntent: "create-task" | "create-project" | "invite" | "my-tasks" | null = null) {
    setView(next);
    setIntent(nextIntent);
    sessionStorage.setItem(VIEW_KEY, next);
    setDrawer(false);
    setProfileOpen(false);
    setNotesOpen(false);
  }

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
  };
  const heading = active === "desk" ? `${greeting()}, ${user.name.split(" ")[0]}` : page?.label;
  const notes = store.data.assignments
    .filter((item) => item.kind === "task" && item.taskId && (user.role === "admin" || item.userId === user.id))
    .slice()
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    .slice(0, 6)
    .map((item) => {
      const task = store.data?.tasks.find((entry) => entry.id === item.taskId);
      const who = user.role === "admin" ? personName(store.data?.users ?? [], item.userId) : "You";
      return { id: item.id, who, role: item.role, title: task?.title ?? item.taskId, when: item.assignedAt };
    });

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
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <Mark />
          <div>
            <strong>Northline</strong>
            <span>Task desk</span>
          </div>
        </div>
        <nav className="nav" aria-label="Desk">{renderNav()}</nav>
        <div className="rail-user">
          <Avatar name={user.name} id={user.id} />
          <div>
            <strong>{user.name}</strong>
            <span>{label(user.role)}</span>
          </div>
        </div>
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
                <span aria-current="page">{page?.label ?? "Dashboard"}</span>
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
                  <p>Recent assignments</p>
                  {notes.length === 0 && <p className="empty">No assignments yet.</p>}
                  {notes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        openView("tasks");
                        push(`Opened ${item.title}`);
                      }}
                    >
                      <Icon name="assign" />
                      <span>
                        <strong>{item.who}</strong> {item.role === "reviewer" ? "is reviewing" : "is assigned"} {item.title}
                        <small>{formatDate(item.when)}</small>
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
                  onClick={() => {
                    void store.resetSeed().then(() => push("Seed reloaded"));
                  }}
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
              label={<><Avatar name={user.name} id={user.id} /><span className="profile-name">{user.name.split(" ")[0]}</span></>}
            >
              <p>
                <strong>{user.name}</strong>
                {user.email}
                <small>{label(user.role)}</small>
              </p>
              <button type="button" onClick={() => openView("people")}>
                <Icon name="people" /> Your account
              </button>
              <button type="button" onClick={() => setPasswordOpen(true)}>
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
          {active === "desk" && <Desk query={query} onOpen={openView} />}
          {active === "projects" && <Projects query={query} intent={intent} onIntent={() => setIntent(null)} />}
          {active === "tasks" && <Tasks query={query} intent={intent} onIntent={() => setIntent(null)} />}
          {active === "people" && <People query={query} intent={intent} onIntent={() => setIntent(null)} />}
          {active === "assign" && <Assignments query={query} />}
          {active === "checks" && <Checkpoints query={query} />}
        </div>
      </div>
      {passwordOpen && (
        <Modal title="Change password" onClose={() => setPasswordOpen(false)}>
          <ChangePassword onClose={() => setPasswordOpen(false)} />
        </Modal>
      )}
    </div>
  );
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
