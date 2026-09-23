import { useState } from "react";
import { Avatar, Icon, Loader, Mark } from "./components/Bits";
import type { IconName } from "./components/Bits";
import { scopeFor, viewsFor } from "./access";
import type { ViewId } from "./access";
import { greeting, label, openTasks } from "./lib";
import { StoreProvider, useStore } from "./store";
import { Assignments } from "./views/Assignments";
import { Checkpoints } from "./views/Checkpoints";
import { Desk } from "./views/Desk";
import { Login } from "./views/Login";
import { People } from "./views/People";
import { Projects } from "./views/Projects";
import { Tasks } from "./views/Tasks";

const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: "desk", label: "Desk", icon: "desk" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "people", label: "People", icon: "people" },
  { id: "assign", label: "Assignments", icon: "assign" },
  { id: "checks", label: "Checkpoints", icon: "check" },
];

function Shell() {
  const store = useStore();
  const [view, setView] = useState<ViewId>("desk");
  const [query, setQuery] = useState("");

  if (store.loading) return <Loader label="Opening the desk" />;

  if (!store.data) {
    return (
      <div className="boot">
        <p>{store.error ?? "The ledger could not be opened."}</p>
      </div>
    );
  }

  if (!store.sessionUser) return <Login />;

  const user = store.sessionUser;
  const allowed = viewsFor(user.role);
  const nav = NAV.filter((item) => allowed.includes(item.id));
  const active = allowed.includes(view) ? view : "desk";
  const scoped = scopeFor(store.data, user);
  const counts: Record<ViewId, number> = {
    desk: openTasks(scoped.tasks).length,
    projects: scoped.projects.length,
    tasks: scoped.tasks.length,
    people: scoped.users.length,
    assign: scoped.assignments.length,
    checks: store.data.checkpoints.length,
  };
  const heading = active === "desk" ? `${greeting()}, ${user.name.split(" ")[0]}` : nav.find((item) => item.id === active)?.label;

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
        <nav className="nav">
          {nav.map((item) => (
            <button key={item.id} type="button" className="nav-btn" aria-current={active === item.id ? "page" : undefined} onClick={() => setView(item.id)}>
              <Icon name={item.icon} />
              <span className="nav-label">{item.label}</span>
              <span className="nav-count">{counts[item.id]}</span>
            </button>
          ))}
        </nav>
        <div className="rail-user">
          <Avatar name={user.name} id={user.id} />
          <div>
            <strong>{user.name}</strong>
            <span>{label(user.role)}</span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{nav.find((item) => item.id === active)?.label}</p>
            <h1>{heading}</h1>
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
            {user.role === "admin" && <details className="filemenu">
              <summary>
                <Icon name="download" />
                {store.usingLocal ? "Working copy" : "JSON files"}
              </summary>
              <div className="menu">
                <p>Edits stay in this browser. Download a file and replace the matching one in public/assets, then reload the seed.</p>
                <button type="button" onClick={() => store.exportFile("users")}>
                  <Icon name="download" /> users.json
                </button>
                <button type="button" onClick={() => store.exportFile("projects")}>
                  <Icon name="download" /> projects.json
                </button>
                <button type="button" onClick={() => store.exportFile("tasks")}>
                  <Icon name="download" /> tasks.json
                </button>
                <button type="button" onClick={() => store.exportFile("assignments")}>
                  <Icon name="download" /> assignments.json
                </button>
                <button type="button" onClick={() => store.exportFile("checkpoints")}>
                  <Icon name="download" /> checkpoints.json
                </button>
                <button type="button" onClick={() => void store.resetSeed()}>
                  <Icon name="refresh" /> Reload seed
                </button>
              </div>
            </details>}
            <button type="button" className="btn ghost" onClick={store.logout}>
              <Icon name="logout" />
              Sign out
            </button>
          </div>
        </header>
        {store.error && <p className="banner">{store.error}</p>}
        {user.role === "admin" && store.usingLocal && (
          <p className="banner">This browser is using your working copy. The files in public/assets are still the original seed.</p>
        )}
        <div className="content">
          {active === "desk" && <Desk query={query} />}
          {active === "projects" && <Projects query={query} />}
          {active === "tasks" && <Tasks query={query} />}
          {active === "people" && <People query={query} />}
          {active === "assign" && <Assignments query={query} />}
          {active === "checks" && <Checkpoints query={query} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
