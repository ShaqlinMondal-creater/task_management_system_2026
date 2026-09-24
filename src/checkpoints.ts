import type { Role } from "./types";

export type CheckState = "done" | "partial" | "open";

export interface CheckItem {
  label: string;
  state: CheckState;
  owner?: Role;
}

export interface CheckGroup {
  title: string;
  items: CheckItem[];
}

export interface CheckPhase {
  id: string;
  area: "Frontend" | "Backend";
  owner: Role;
  title: string;
  note?: string;
  groups: CheckGroup[];
}

function items(state: CheckState, labels: string[]): CheckItem[] {
  return labels.map((label) => ({ label, state }));
}

export const CHECKPOINTS: CheckPhase[] = [
  {
    id: "fe-layout",
    area: "Frontend",
    owner: "admin",
    title: "1. Global layout",
    groups: [
      {
        title: "Shell",
        items: [
          ...items("partial", ["Responsive sidebar", "Mobile navigation / drawer"]),
          ...items("done", ["Desktop navigation", "Top navbar", "Search", "Consistent page container", "Loading states", "Empty states", "Confirmation dialogs"]),
          ...items("partial", ["User profile menu", "Error states"]),
          ...items("open", ["Notification icon", "Breadcrumbs", "Toast notifications", "Skeleton loaders"]),
        ],
      },
    ],
  },
  {
    id: "fe-system",
    area: "Frontend",
    owner: "admin",
    title: "2. Design system",
    note: "Shared pieces live in one place. Pages should not invent their own controls.",
    groups: [
      {
        title: "Reusable controls",
        items: [
          ...items("done", ["Button", "Input", "Select", "Multi-select", "Date picker", "Modal", "Drawer", "Dropdown", "Tabs", "Badge", "Avatar", "Tooltip", "Pagination", "Table", "Card", "Status indicator", "Priority indicator"]),
        ],
      },
    ],
  },
  {
    id: "fe-auth",
    area: "Frontend",
    owner: "admin",
    title: "3. Authentication",
    groups: [
      {
        title: "Login",
        items: [
          ...items("done", ["Email / username", "Password", "Show / hide password", "Remember me", "Forgot password", "Login validation", "API error handling", "Loading state", "Redirect after login"]),
        ],
      },
      {
        title: "Registration",
        items: items("done", ["Name", "Email", "Mobile", "Password", "Confirm password", "Terms acceptance", "Validation", "Email verification"]),
      },
      {
        title: "Password and session",
        items: items("done", ["Forgot password", "OTP / email verification", "Reset password", "Change password", "Token handling", "Automatic logout", "Expired-session handling", "Protected routes"]),
      },
    ],
  },
  {
    id: "fe-dashboard",
    area: "Frontend",
    owner: "admin",
    title: "4. Dashboard",
    groups: [
      {
        title: "KPI cards",
        items: items("done", ["Total projects", "Total tasks", "Pending tasks", "In-progress tasks", "Completed tasks", "Overdue tasks", "Tasks assigned to me"]),
      },
      {
        title: "Charts",
        items: items("done", ["Tasks by status", "Tasks by priority", "Tasks completed over time", "Project progress", "Team workload", "Overdue trends"]),
      },
      {
        title: "Quick actions and activity",
        items: items("done", ["Create task", "Create project", "Invite member", "View my tasks", "Recent activity", "Recently completed", "Upcoming deadlines"]),
      },
    ],
  },
  {
    id: "fe-projects",
    area: "Frontend",
    owner: "admin",
    title: "5. Project management",
    groups: [
      {
        title: "Project list",
        items: [
          ...items("done", ["Project cards", "Search", "Project status", "Owner", "Start date", "End date", "Progress", "Table view", "Filter", "Sort", "Pagination"]),
        ],
      },
      {
        title: "Create project",
        items: items("done", ["Project name", "Description", "Project owner", "Start date", "End date", "Status", "Priority", "Project color", "Team members on the form", "Project icon"]),
      },
      {
        title: "Project detail tabs",
        items: items("done", ["Overview", "Tasks", "Board", "Calendar", "Members", "Files", "Activity", "Settings"]),
      },
    ],
  },
  {
    id: "fe-tasks",
    area: "Frontend",
    owner: "member",
    title: "6. Task management",
    groups: [
      {
        title: "Create task",
        items: [
          ...items("done", ["Task title", "Description", "Project", "Assignee", "Status", "Priority", "Due date", "Creator", "Start date", "Tags", "Attachments", "Estimated time", "Actual time", "Parent task", "Checklist"]),
        ],
      },
      {
        title: "Statuses and priority",
        items: [
          ...items("done", ["TODO", "IN_PROGRESS", "DONE", "Custom statuses later", "LOW", "MEDIUM", "HIGH", "URGENT"]),
          { label: "IN_REVIEW", state: "done", owner: "reviewer" },
        ],
      },
      {
        title: "Task detail",
        items: items("done", ["Detail drawer or page", "Checklist", "Attachments", "Comments", "Activity history"]),
      },
    ],
  },
  {
    id: "fe-subtasks",
    area: "Frontend",
    owner: "member",
    title: "7. Subtasks and dependencies",
    groups: [
      {
        title: "Subtasks",
        items: items("open", ["Create subtask", "Assign subtask", "Due date", "Status", "Priority", "Progress", "Nested tree"]),
      },
      {
        title: "Dependencies",
        items: items("open", ["Blocked by", "Blocks", "Related task"]),
      },
    ],
  },
  {
    id: "fe-views",
    area: "Frontend",
    owner: "member",
    title: "8. Task views",
    note: "Every view must read the same task records.",
    groups: [
      {
        title: "Required",
        items: [...items("open", ["List view", "Calendar"]), ...items("done", ["Kanban board"])],
      },
      {
        title: "Advanced",
        items: items("open", ["Timeline", "Gantt", "Table", "Workload"]),
      },
    ],
  },
  {
    id: "fe-search",
    area: "Frontend",
    owner: "member",
    title: "9. Search and filters",
    groups: [
      {
        title: "Search",
        items: [
          ...items("partial", ["Global task search", "Project search", "User search", "Search by title", "Search by description"]),
        ],
      },
      {
        title: "Filters and sort",
        items: [
          ...items("partial", ["Assignee", "Project"]),
          ...items("open", [
          "Status",
          "Priority",
          "Due date",
          "Created date",
          "Tags",
          "Creator",
          "Newest",
          "Oldest",
          "Due date sort",
          "Priority sort",
          "Updated",
          "Alphabetical",
          "Saved filters",
          "My overdue tasks",
          "High priority",
          "Due this week",
          "Unassigned",
          ]),
        ],
      },
    ],
  },
  {
    id: "fe-team",
    area: "Frontend",
    owner: "admin",
    title: "10. Team and collaboration",
    groups: [
      {
        title: "Team",
        items: [
          ...items("partial", ["Team list", "Assign role", "Member workload"]),
          ...items("open", ["Invite member", "Remove member", "Member profile"]),
        ],
      },
      {
        title: "Comments and activity",
        items: items("open", ["Add comment", "Edit comment", "Delete comment", "Reply", "@mention", "Comment timestamps", "Activity stream"]),
      },
    ],
  },
  {
    id: "fe-notifications",
    area: "Frontend",
    owner: "admin",
    title: "11. Notifications",
    groups: [
      {
        title: "In-app center",
        items: items("open", [
          "Task assigned",
          "Task mentioned",
          "Comment",
          "Due soon",
          "Overdue",
          "Project invitation",
          "Task completed",
          "Status changed",
          "Email notifications",
          "Push notifications",
          "WhatsApp integration",
        ]),
      },
    ],
  },
  {
    id: "fe-admin",
    area: "Frontend",
    owner: "admin",
    title: "12. Admin",
    groups: [
      {
        title: "Sections",
        items: items("open", ["Admin dashboard", "Users", "Roles", "Projects", "Tasks", "Activity logs", "Settings", "System"]),
      },
      {
        title: "Users and roles",
        items: [
          ...items("partial", ["User list", "Search", "Create", "Edit", "Delete", "Assign role"]),
          ...items("open", ["Filter", "Activate / deactivate", "Admin", "Manager", "Member", "Viewer"]),
        ],
      },
    ],
  },
  {
    id: "fe-profile",
    area: "Frontend",
    owner: "member",
    title: "13. Profile and settings",
    groups: [
      {
        title: "Profile",
        items: items("open", ["Name", "Profile image", "Email", "Mobile", "Bio", "Password"]),
      },
      {
        title: "Settings",
        items: items("open", ["Account", "Notifications", "Appearance", "Language", "Timezone", "Security", "Dark / light mode", "Custom theme", "Two-factor authentication"]),
      },
    ],
  },
  {
    id: "fe-reports",
    area: "Frontend",
    owner: "admin",
    title: "14. Reporting",
    groups: [
      {
        title: "Analytics",
        items: items("open", [
          "Completion %",
          "Total tasks",
          "Completed",
          "Pending",
          "Overdue",
          "Average completion time",
          "Tasks per member",
          "Completed per member",
          "Overdue per member",
          "Workload",
          "Task completion chart",
          "Task distribution",
          "Project progress",
          "Team workload chart",
        ]),
      },
    ],
  },
  {
    id: "fe-quality",
    area: "Frontend",
    owner: "reviewer",
    title: "15. Quality checkpoint",
    groups: [
      {
        title: "Responsive, UX, performance",
        items: items("open", [
          "320px",
          "375px",
          "390px",
          "430px",
          "Tablet",
          "Laptop",
          "Desktop",
          "Large desktop",
          "No dead buttons",
          "No fake data",
          "No broken links",
          "Proper loading",
          "Proper errors",
          "Proper empty states",
          "Keyboard accessibility",
          "Focus states",
          "Confirmation before destructive actions",
          "Lazy loading",
          "Code splitting",
          "Image optimization",
          "API caching",
          "Debounced search",
          "Pagination / infinite scrolling",
          "Avoid unnecessary re-renders",
        ]),
      },
    ],
  },
  {
    id: "be-note",
    area: "Backend",
    owner: "admin",
    title: "Backend",
    note: "The backend list in the brief is the same frontend checklist. It is kept once here so the two copies cannot drift. No API server is set up yet.",
    groups: [
      {
        title: "Not started",
        items: items("open", ["API", "Database", "Auth tokens", "Roles on the server", "File storage", "Notification delivery"]),
      },
    ],
  },
];

export function checkpointTotals(phases: CheckPhase[] = CHECKPOINTS) {
  const all = phases.flatMap((phase) => phase.groups.flatMap((group) => group.items));
  return {
    total: all.length,
    done: all.filter((item) => item.state === "done").length,
    partial: all.filter((item) => item.state === "partial").length,
    open: all.filter((item) => item.state === "open").length,
  };
}
