import { useState } from "react";
import { Avatar, Icon, Loader, Mark } from "./components/Bits";
import type { IconName } from "./components/Bits";
import { greeting, openTasks } from "./lib";
import { StoreProvider, useStore } from "./store";
import { Assignments } from "./views/Assignments";
import { Desk } from "./views/Desk";
import { Login } from "./views/Login";
import { People } from "./views/People";
import { Projects } from "./views/Projects";
import { Tasks } from "./views/Tasks";

type View = "desk" | "projects" | "tasks" | "people" | "assign";

const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: "desk", label: "Desk", icon: "desk" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "people", label: "People", icon: "people" },
  { id: "assign", label: "Assignments", icon: "assign" },
];

function Shell() {
  const store = useStore();
  const [view, setView] = useState<View>("desk");
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
  const counts: Record<View, number> = {
    desk: openTasks(store.data.tasks).length,
    projects: store.data.projects.length,
    tasks: store.data.tasks.length,
    people: store.data.users.length,
    assign: store.data.assignments.length,
  };
  const heading = view === "desk" ? `${greeting()}, ${user.name.split(" ")[0]}` : NAV.find((item) => item.id === view)?.label;

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
          {NAV.map((item) => (
            <button key={item.id} type="button" className="nav-btn" aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}>
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
            <span>{user.title}</span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{NAV.find((item) => item.id === view)?.label}</p>
            <h1>{heading}</h1>
          </div>
          <div className="top-actions">
            <label className="search-wrap">
              <Icon name="search" />
              <input
                className="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names, titles, ids"
                aria-label="Search the ledger"
              />
            </label>
            <details className="filemenu">
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
                <button type="button" onClick={() => void store.resetSeed()}>
                  <Icon name="refresh" /> Reload seed
                </button>
              </div>
            </details>
            <button type="button" className="btn ghost" onClick={store.logout}>
              <Icon name="logout" />
              Sign out
            </button>
          </div>
        </header>
        {store.error && <p className="banner">{store.error}</p>}
        {store.usingLocal && (
          <p className="banner">This browser is using your working copy. The files in public/assets are still the original seed.</p>
        )}
        <div className="content">
          {view === "desk" && <Desk query={query} />}
          {view === "projects" && <Projects query={query} />}
          {view === "tasks" && <Tasks query={query} />}
          {view === "people" && <People query={query} />}
          {view === "assign" && <Assignments query={query} />}
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
