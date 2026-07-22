import { getWorkspacePathForPort } from "./session-routing.js";

/**
 * Workspace/git-branch header indicators + the "Open workspace in app"
 * split button (VS Code / Cursor / Terminal / Finder / …), mirroring the
 * Codex-style split button in the chat header.
 *
 * `foregroundPort`/`liveInstances` are owned by app.js and change over
 * time, so they're threaded through as getters. `foregroundWorkspacePath`,
 * `lastRenderedWelcomeWorkspacePath`, and `workspaceLaunchInProgress` are
 * only meaningful to this header/welcome logic, so they live here as
 * module-local state — app.js gets a setter for the rare cases where it
 * needs to seed `foregroundWorkspacePath` directly (mirror sync, project
 * chat activation) before calling `updateWorkspaceIndicator`.
 */
export function setupWorkspaceHeader({
  getForegroundPort,
  getLiveInstances,
  nativeAvailable,
  messageRenderer,
  sidebar,
  openFolderBtn,
  transport,
}) {
  let foregroundWorkspacePath = "";
  let lastRenderedWelcomeWorkspacePath = null;
  let workspaceLaunchInProgress = false;

  const workspaceIndicatorEl = document.createElement("div");
  workspaceIndicatorEl.id = "workspace-indicator";
  workspaceIndicatorEl.className = "pill workspace-indicator hidden";
  workspaceIndicatorEl.title = "";
  document
    .querySelector(".header-right")
    ?.insertBefore(workspaceIndicatorEl, document.querySelector("#context-viz"));

  const gitBranchEl = document.createElement("div");
  gitBranchEl.id = "git-branch-indicator";
  gitBranchEl.className = "pill git-branch-indicator hidden";
  gitBranchEl.title = "Current git branch";
  document
    .querySelector(".header-right")
    ?.insertBefore(gitBranchEl, document.querySelector("#context-viz"));

  function updateGitBranchIndicator(branch = "") {
    const name = typeof branch === "string" ? branch.trim() : "";
    if (!name) {
      gitBranchEl.classList.add("hidden");
      gitBranchEl.textContent = "";
      return;
    }
    gitBranchEl.classList.remove("hidden");
    gitBranchEl.textContent = name;
    gitBranchEl.title = `Branch: ${name}`;
  }

  async function refreshGitBranch() {
    try {
      const params = new URLSearchParams();
      const foregroundPort = getForegroundPort();
      if (typeof foregroundPort === "number" && Number.isFinite(foregroundPort)) {
        params.set("foregroundPort", String(foregroundPort));
      }
      const res = await fetch(`/api/git-branch${params.size ? `?${params.toString()}` : ""}`);
      if (!res.ok) {
        updateGitBranchIndicator("");
        return;
      }
      const data = await res.json();
      updateGitBranchIndicator(data?.branch || "");
    } catch {
      updateGitBranchIndicator("");
    }
  }

  function updateWorkspaceIndicator(path = "") {
    const normalizedPath = typeof path === "string" ? path.trim() : "";
    if (!normalizedPath) {
      workspaceIndicatorEl.classList.add("hidden");
      workspaceIndicatorEl.textContent = "";
      workspaceIndicatorEl.title = "";
      if (typeof refreshHeaderOpenAppButton === "function") refreshHeaderOpenAppButton();
      return;
    }
    workspaceIndicatorEl.classList.remove("hidden");
    workspaceIndicatorEl.textContent = normalizedPath;
    workspaceIndicatorEl.title = normalizedPath;
    if (typeof refreshHeaderOpenAppButton === "function") refreshHeaderOpenAppButton();
  }

  function syncWorkspaceIndicatorFromInstances() {
    const workspacePath = getWorkspacePathForPort(getLiveInstances(), getForegroundPort());
    if (workspacePath) foregroundWorkspacePath = workspacePath;
    updateWorkspaceIndicator(workspacePath || foregroundWorkspacePath);
    refreshGitBranch();
  }

  function getCurrentWorkspacePath() {
    return (
      getWorkspacePathForPort(getLiveInstances(), getForegroundPort()) || foregroundWorkspacePath
    );
  }

  function workspacePathFromId(workspaceId) {
    if (typeof workspaceId !== "string") return "";
    return workspaceId.startsWith("workspace:") ? workspaceId.slice("workspace:".length) : "";
  }

  function setForegroundWorkspacePath(path) {
    foregroundWorkspacePath = path;
  }

  function renderWorkspaceWelcome({ force = false } = {}) {
    const workspacePath = getCurrentWorkspacePath();
    const welcomeVisible = Boolean(document.querySelector(".welcome"));
    if (!force && welcomeVisible && lastRenderedWelcomeWorkspacePath === workspacePath) {
      return;
    }
    messageRenderer.renderWelcome({ workspacePath });
    lastRenderedWelcomeWorkspacePath = workspacePath;
  }

  function hasAnySessionsLoaded() {
    return (
      Array.isArray(sidebar.projects) &&
      sidebar.projects.some(
        (project) => Array.isArray(project.sessions) && project.sessions.length > 0,
      )
    );
  }

  function isWorkspaceLaunchInProgress() {
    return workspaceLaunchInProgress;
  }

  function setWorkspaceLaunchInProgress(inProgress) {
    workspaceLaunchInProgress = inProgress;
    if (openFolderBtn) {
      openFolderBtn.disabled = inProgress;
      openFolderBtn.setAttribute("aria-busy", inProgress ? "true" : "false");
      openFolderBtn.title = inProgress ? "Opening workspace..." : "Open folder as workspace";
    }
  }

  // ═══════════════════════════════════════
  // "Open workspace in app" header control (VS Code / Cursor / Terminal / …)
  // Mirrors the Codex-style split button in the chat header.
  // ═══════════════════════════════════════
  const HEADER_OPEN_APP_STORAGE_KEY = "ompcot-open-app";
  const HEADER_OPEN_APP_MONOGRAMS = {
    vscode: "VS",
    cursor: "C",
    webstorm: "WS",
    zed: "Z",
    terminal: "T",
    ghostty: "G",
    finder: "F",
  };
  const HEADER_OPEN_APP_ICONS = {
    vscode: "icons/app-vscode.png",
    cursor: "icons/app-cursor.svg",
    webstorm: "icons/app-webstorm.svg",
    zed: "icons/app-zed.png",
    terminal: "icons/app-terminal.svg",
    ghostty: "icons/app-ghostty.png",
    finder: "icons/app-finder.png",
  };
  const headerOpenApp = {
    el: document.getElementById("header-open-app"),
    btn: document.getElementById("header-open-app-btn"),
    logo: document.getElementById("header-open-app-logo"),
    toggle: document.getElementById("header-open-app-toggle"),
    menu: document.getElementById("header-open-app-menu"),
    apps: [],
    selectedId: localStorage.getItem(HEADER_OPEN_APP_STORAGE_KEY) || null,
  };

  function getSelectedOpenApp() {
    return (
      headerOpenApp.apps.find((a) => a.id === headerOpenApp.selectedId) ||
      headerOpenApp.apps[0] ||
      null
    );
  }

  function openAppMonogram(app) {
    if (!app?.id) return "•";
    return HEADER_OPEN_APP_MONOGRAMS[app.id] || app.label?.slice(0, 1).toUpperCase() || "•";
  }

  function openAppIconPath(app) {
    if (!app?.id) return "";
    return HEADER_OPEN_APP_ICONS[app.id] || "";
  }

  function renderOpenAppLogo(app) {
    const icon = openAppIconPath(app);
    const monogram = openAppMonogram(app);
    if (icon) {
      return `<img src="${icon}" alt="" class="header-open-app-logo-img">`;
    }
    return `<span class="header-open-app-logo-text">${monogram}</span>`;
  }

  function refreshHeaderOpenAppButton() {
    if (!headerOpenApp.el) return;
    const hasNative = nativeAvailable();
    const path = getCurrentWorkspacePath();
    const selected = getSelectedOpenApp();
    if (!hasNative || !selected || !path || headerOpenApp.apps.length === 0) {
      headerOpenApp.el.classList.add("hidden");
      return;
    }
    headerOpenApp.el.classList.remove("hidden");
    if (headerOpenApp.logo) headerOpenApp.logo.innerHTML = renderOpenAppLogo(selected);
    headerOpenApp.btn.title = `Open ${path} in ${selected.label}`;
    headerOpenApp.btn.setAttribute("aria-label", `Open workspace in ${selected.label}`);
  }

  async function openWorkspaceInApp(app) {
    const target = app || getSelectedOpenApp();
    const path = getCurrentWorkspacePath();
    if (!nativeAvailable() || !target || !path) return;
    headerOpenApp.selectedId = target.id;
    localStorage.setItem(HEADER_OPEN_APP_STORAGE_KEY, target.id);
    refreshHeaderOpenAppButton();
    try {
      await transport.openInApp(path, {
        appName: target.appName ?? null,
        command: target.command ?? null,
      });
    } catch (err) {
      console.error("[Header] Failed to open workspace in app:", err);
    }
  }

  function closeHeaderOpenAppMenu() {
    if (headerOpenApp.menu) headerOpenApp.menu.classList.add("hidden");
  }

  function toggleHeaderOpenAppMenu() {
    if (!headerOpenApp.menu) return;
    if (!headerOpenApp.menu.classList.contains("hidden")) {
      closeHeaderOpenAppMenu();
      return;
    }
    headerOpenApp.menu.innerHTML = "";
    for (const app of headerOpenApp.apps) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "header-open-app-menu-item";
      if (app.id === headerOpenApp.selectedId) row.classList.add("active");
      row.title = `Open in ${app.label}`;
      row.setAttribute("aria-label", `Open in ${app.label}`);
      row.innerHTML = `<span class="header-open-app-logo" aria-hidden="true">${renderOpenAppLogo(app)}</span><span>${app.label}</span>`;
      row.addEventListener("click", (ev) => {
        ev.stopPropagation();
        closeHeaderOpenAppMenu();
        void openWorkspaceInApp(app);
      });
      headerOpenApp.menu.appendChild(row);
    }
    headerOpenApp.menu.classList.remove("hidden");
  }

  async function loadHeaderOpenApps() {
    if (!nativeAvailable()) return;
    try {
      const apps = await transport.listInstalledApps();
      headerOpenApp.apps = Array.isArray(apps) ? apps : [];
      if (!headerOpenApp.apps.some((a) => a.id === headerOpenApp.selectedId)) {
        headerOpenApp.selectedId = headerOpenApp.apps[0]?.id || null;
      }
      refreshHeaderOpenAppButton();
    } catch (err) {
      console.error("[Header] Failed to load installed apps:", err);
    }
  }

  if (headerOpenApp.btn) {
    headerOpenApp.btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void openWorkspaceInApp();
    });
  }
  if (headerOpenApp.toggle) {
    headerOpenApp.toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleHeaderOpenAppMenu();
    });
  }
  document.addEventListener("click", () => closeHeaderOpenAppMenu());
  void loadHeaderOpenApps();

  return {
    getCurrentWorkspacePath,
    updateWorkspaceIndicator,
    syncWorkspaceIndicatorFromInstances,
    workspacePathFromId,
    setForegroundWorkspacePath,
    renderWorkspaceWelcome,
    hasAnySessionsLoaded,
    isWorkspaceLaunchInProgress,
    setWorkspaceLaunchInProgress,
    refreshHeaderOpenAppButton,
    loadHeaderOpenApps,
  };
}
