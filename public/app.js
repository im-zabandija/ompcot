/**
 * Main App - Ties everything together
 */

import { installAuthenticatedFetch, stripSensitiveConnectionParams } from "./access-control.js";
import { setupCommandPalette } from "./app-command-palette.js";
import { setupComposer } from "./app-composer.js";
import { setupContextViz } from "./app-context-viz.js";
import { setupKeyboardShortcuts } from "./app-keyboard-shortcuts.js";
import { setupLanQr } from "./app-lan-qr.js";
import { setupModelPicker } from "./app-model-picker.js";
import { setupPackageBrowser } from "./app-package-browser.js";
import { setupRpcEvents } from "./app-rpc-events.js";
import { setupSessionRouting } from "./app-session-routing.js";
import { setupSettingsPanel } from "./app-settings-panel.js";
import { setupSlashMenu } from "./app-slash-menu.js";
import { setupSwapOverlay } from "./app-swap-overlay.js";
import { setupVoiceInput } from "./app-voice-input.js";
import { setupWorkspaceHeader } from "./app-workspace-header.js";
import { DialogHandler } from "./dialogs.js";
import { FileBrowser } from "./file-browser.js";
import { setupMessagesInsets } from "./layout-insets.js";
import { MessageRenderer } from "./message-renderer.js";
import { SessionSidebar } from "./session-sidebar.js";
import { setupSidebarSearchControl } from "./sidebar-search-control.js";
import { StateManager } from "./state.js";
import { ToolCardRenderer } from "./tool-card.js";
import { initTransport } from "./transport.js";
import { resolveWebSocketUrl, WebSocketClient } from "./websocket-client.js";
import {
  openFolderAsWorkspace,
  startInWindowNewSession,
  startNewProjectChat,
} from "./workspace-actions.js";

installAuthenticatedFetch(window);

const fetchInstances = async () => {
  try {
    const res = await fetch("/api/instances");
    if (!res.ok) return [];
    const data = await res.json();
    return data.instances || [];
  } catch {
    return [];
  }
};
const getCurrentPort = () => {
  const fromTransport = transport?.currentPort?.();
  if (typeof fromTransport === "number") return fromTransport;
  const fromLocation = Number(location.port);
  return Number.isFinite(fromLocation) && fromLocation > 0 ? fromLocation : 47821;
};
const mobileClientMode = new URLSearchParams(window.location.search).get("mobile") === "1";
const navigateInWindow = (url) => {
  let target = url;
  if (mobileClientMode) {
    try {
      const nextUrl = new URL(url, window.location.href);
      nextUrl.searchParams.set("mobile", "1");
      target = nextUrl.toString();
    } catch {}
  }
  window.location.href = target;
};

// Initialize components
const wsUrl = resolveWebSocketUrl(window);
stripSensitiveConnectionParams(window);
const wsClient = new WebSocketClient(wsUrl);
const { onBeforeInstanceSwap, dismissBootSwapOverlayWhenReady } = setupSwapOverlay({ wsClient });
// Unified control transport: every process/window lifecycle + native op goes
// through the broker WebSocket (broker_control). No Tauri IPC hooks — the
// desktop WebView, a remote client, and a mobile client all use the same API.
// Native-only ops are gated on
// `transport.capabilities.native` (advertised by the broker handshake).
const transport = initTransport({ wsClient, env: window });
// True once the broker advertises a native (OS/window) control handler — i.e.
// we're attached to the desktop host. Drives native-only UI gating. Starts
// false and flips when the `capabilities` frame arrives (see listener below).
// `?mobile=1` is a browser client even if it reaches the desktop broker, so it
// must not use native workspace/window controls.
const nativeAvailable = () => !mobileClientMode && transport.capabilities.native;
const canUseSessionControl = () => transport.capabilities.native;
const state = new StateManager();
const messageRenderer = new MessageRenderer(document.getElementById("messages"));
const toolCardRenderer = new ToolCardRenderer(document.getElementById("messages"));
const dialogHandler = new DialogHandler(document.getElementById("dialog-container"), wsClient);

// Session sidebar
const sidebar = new SessionSidebar(
  document.getElementById("session-list"),
  handleSessionSelect,
  handleNewProjectChat,
  { onOpenProject: () => handleOpenFolder() },
);

// UI elements
const messageInput = document.getElementById("message-input");
const chatForm = document.getElementById("chat-form");
const sendBtn = document.getElementById("send-btn");
const abortBtn = document.getElementById("abort-btn");
const statusIndicator = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");
const openFolderBtn = document.getElementById("open-folder-btn");
const sidebarEl = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarOverlay = document.getElementById("sidebar-overlay");

const refreshSessionsBtn = document.getElementById("refresh-sessions-btn");
const sessionSearchInput = document.getElementById("session-search-input");
const sessionSearchClearBtn = document.getElementById("session-search-clear");
const typingIndicator = document.getElementById("typing-indicator");

const sessionCostEl = document.getElementById("session-cost");
const tokenUsageEl = document.getElementById("token-usage");
const scrollBottomBtn = document.getElementById("scroll-bottom-btn");
const scrollBottomBadge = document.getElementById("scroll-bottom-badge");
const messagesContainer = document.getElementById("messages");
const mainContainer = document.querySelector(".main");
const headerEl = document.querySelector(".header");
const inputAreaEl = document.querySelector(".input-area");
const composerCard = document.getElementById("composer-card");
const settingsPanel = document.getElementById("settings-panel");

headerEl?.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target.closest("button, a, input, select, textarea, [role=button]")) return;
  window.__TAURI__?.window?.getCurrentWindow().startDragging();
});

setupMessagesInsets({
  main: mainContainer,
  messages: messagesContainer,
  header: headerEl,
  inputArea: inputAreaEl,
});

// State tracking
let sessionTotalCost = 0;
let lastInputTokens = 0;
let contextWindowSize = 0; // fetched from model info
const originalTitle = document.title;
let hasFocus = true;
let unreadCount = 0;
let isScrolledUp = false;
let lastSentMessage = null; // Track to avoid duplicate rendering in mirror mode
let lastUsage = null; // Full usage object for context visualiser
let mirrorActiveSessionFile = null; // The live session file path from the TUI
let viewingActiveSession = true; // Whether we're viewing the live session or a historical one
let isMirrorMode = false; // Set when mirror_sync received
let liveInstances = []; // All running Ompcot instances [{port, sessionFile, cwd}]
// When true, the next foreground message lifecycle events should reload the
// sidebar until the newly persisted session file appears in the list.
let pendingNewSessionRefresh = false;
let pendingNewSessionPreviousFile = null;
// When set while streaming, holds the session filePath to switch to once the
// current agent run ends. The history is rendered immediately; omp gets the
// switch_session RPC only after agent_end so the running call is not aborted.
let pendingSessionSwitchPath = null;
let sessionsLoaded = false;
// Serializes handleSessionSelect: the function is a long async sequence that
// mutates shared routing state (foregroundPort, mirrorActiveSessionFile,
// viewingActiveSession, pendingSessionSwitchPath). Two overlapping invocations
// (fast double-click on different sessions) would interleave their awaits and
// corrupt that state, so a second call queues behind the first.
let sessionSelectChain = Promise.resolve();
let deferredMirrorSync = null;
// Maps port -> sessionFile for each omp process we're tracking
const portSessionMap = new Map();
// The port that wsClient is currently connected to (the "foreground" session)
let foregroundPort = getCurrentPort();
const {
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
} = setupWorkspaceHeader({
  getForegroundPort: () => foregroundPort,
  getLiveInstances: () => liveInstances,
  nativeAvailable,
  messageRenderer,
  sidebar,
  openFolderBtn,
  transport,
});
const getActivePort = () => foregroundPort;
function logSessionRoute(label, details = {}) {
  console.debug(`[Session route] ${label}`, {
    foregroundPort,
    activeSessionFile: sidebar?.activeSessionFile || null,
    mirrorActiveSessionFile,
    viewingActiveSession,
    isStreaming: state?.isStreaming,
    wsSessionId: wsClient?.sessionId || null,
    wsSourcePort: wsClient?.sourcePort || null,
    ...details,
  });
}
wsClient.setRoutingContext({
  workspaceId: `workspace:${getCurrentWorkspacePath() || "unknown"}`,
  sourcePort: foregroundPort,
});

// File browser
const fileSidebar = document.getElementById("file-sidebar");
const fileSidebarToggle = document.getElementById("file-sidebar-toggle");
const fileSidebarClose = document.getElementById("file-sidebar-close");
const fileSidebarUp = document.getElementById("file-sidebar-up");
const fileList = document.getElementById("file-list");
const fileSidebarPath = document.getElementById("file-sidebar-path");
const fileBrowser = new FileBrowser(fileList, fileSidebarPath, messageInput);
fileSidebarToggle.addEventListener("click", () => {
  const isCollapsed = fileSidebar.classList.toggle("collapsed");
  if (!isCollapsed && !fileBrowser.currentPath) {
    fileBrowser.load(); // Load session cwd
  }
  localStorage.setItem("ompcot-file-sidebar", isCollapsed ? "closed" : "open");
});

fileSidebarClose.addEventListener("click", () => {
  fileSidebar.classList.add("collapsed");
  localStorage.setItem("ompcot-file-sidebar", "closed");
});

fileSidebarUp.addEventListener("click", () => {
  const parent = fileBrowser.getParentPath();
  if (parent) fileBrowser.load(parent);
});

document.getElementById("file-sidebar-finder").addEventListener("click", () => {
  if (fileBrowser.currentPath) {
    fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: fileBrowser.currentPath }),
    });
  }
});

// Restore file sidebar state
if (localStorage.getItem("ompcot-file-sidebar") === "open") {
  fileSidebar.classList.remove("collapsed");
  fileBrowser.load();
}

// ═══════════════════════════════════════
// Focus tracking for tab title notifications
// ═══════════════════════════════════════

window.addEventListener("focus", () => {
  hasFocus = true;
  unreadCount = 0;
  document.title = originalTitle;
});

window.addEventListener("blur", () => {
  hasFocus = false;
});

// Reconnect WebSocket when returning to the app (iOS suspends WS connections)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wsClient.ws?.readyState !== WebSocket.OPEN) {
    console.log("[App] Returning to app, reconnecting...");
    wsClient.forceReconnect();
  }
});

// ═══════════════════════════════════════
// Scroll-to-bottom button + new message indicator
// ═══════════════════════════════════════

messagesContainer.addEventListener("scroll", () => {
  const threshold = 150;
  const atBottom =
    messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight <
    threshold;
  isScrolledUp = !atBottom;

  if (atBottom) {
    scrollBottomBtn.classList.add("hidden");
    scrollBottomBadge.classList.add("hidden");
  } else {
    scrollBottomBtn.classList.remove("hidden");
  }
});

scrollBottomBtn.addEventListener("click", () => {
  messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: "smooth" });
  scrollBottomBtn.classList.add("hidden");
  scrollBottomBadge.classList.add("hidden");
});

function showNewMessageBadge() {
  if (isScrolledUp) {
    scrollBottomBadge.classList.remove("hidden");
  }
}

// ═══════════════════════════════════════
// WebSocket event handlers
// ═══════════════════════════════════════

wsClient.addEventListener("connected", () => {
  updateConnectionStatus("connected");
  // Fetch model context window size for token % display
  setTimeout(fetchContextWindow, 1000);
  // Sync the plan-mode button with the extension's real state
  void syncPlanMode();
});

wsClient.addEventListener("disconnected", () => {
  updateConnectionStatus("disconnected");
  sidebar.clearStreaming();

  // Deferred session switch requires agent_end to complete, which won't fire
  // after a crash/disconnect. Unblock input immediately so the user isn't stuck.
  if (pendingSessionSwitchPath) {
    pendingSessionSwitchPath = null;
    updateUI();
  }

  // If the streaming state is still true 3 s after disconnect (omp likely
  // crashed — agent_end won't re-fire after reconnect), unlock the UI.
  // Brief intentional reconnects (Case 1 session switch) complete in < 100 ms
  // so they are unaffected by the 3-second gate.
  setTimeout(() => {
    if (wsClient.connectionState !== "open" && state.isStreaming) {
      state.setStreaming(false);
      showTypingIndicator(false);
      updateUI();
    }
  }, 3000);
});

wsClient.addEventListener("reconnectFailed", () => {
  updateConnectionStatus("disconnected");
  messageRenderer.renderError("Connection lost. Please refresh the page.");
});

wsClient.addEventListener("rpcEvent", (e) => {
  handleRPCEvent(e.detail);
});

wsClient.addEventListener("serverError", (e) => {
  messageRenderer.renderError(e.detail.message);
});

// The broker could not deliver a command to any live omp process. For a tracked
// prompt this means the user's message was dropped — surface it, clear the
// optimistic streaming/typing state, and restore the text so it isn't lost.
wsClient.addEventListener("commandUndeliverable", (e) => {
  const { requestId, reason, command } = e.detail || {};
  const pending = requestId ? getInFlightPrompt(requestId) : null;
  if (!pending) {
    console.warn("[WS] command undeliverable:", { command, reason, requestId });
    return;
  }
  clearTimeout(pending.timer);
  deleteInFlightPrompt(requestId);
  state.setStreaming(false);
  showTypingIndicator(false);
  const detail =
    reason === "no_route"
      ? "no running session to receive it"
      : "the session process is no longer reachable";
  messageRenderer.renderError(
    `Message not delivered (${detail}). The session may have closed — start a new chat or try again.`,
  );
  if (pending.message && !messageInput.value.trim()) {
    messageInput.value = pending.message;
    messageInput.style.height = "auto";
  }
});

// Mirror mode: receive full state snapshot on connect
wsClient.addEventListener("mirrorSync", (e) => {
  handleMirrorSync(e.detail);
});

// Forward reference: `setupSessionRouting()` (called later, once composer and
// model-picker are ready) assigns the real implementation into
// `pollInstancesImpl`. `setupRpcEvents()` needs a stable `pollInstances`
// value right now even though the real implementation isn't ready yet.
let pollInstancesImpl = () => Promise.resolve();
const pollInstances = (...args) => pollInstancesImpl(...args);
// Same forward-reference for the composer's plan-mode indicator: assigned
// once `setupComposer()` returns, called from the `plan_mode_changed` event.
let setPlanModeIndicatorImpl = () => {};

const { handleRPCEvent, resetStreamingState } = setupRpcEvents({
  state,
  sidebar,
  messageRenderer,
  messagesContainer,
  toolCardRenderer,
  transport,
  dialogHandler,
  originalTitle,
  updateUI,
  updateCostDisplay,
  updateTokenUsage,
  showTypingIndicator,
  showNewMessageBadge,
  hideCompactButton,
  syncWorkspaceIndicatorFromInstances,
  pollInstances,
  isFocused: () => hasFocus,
  getForegroundPort: () => foregroundPort,
  setForegroundPort: (port) => {
    foregroundPort = port;
  },
  getLiveInstances: () => liveInstances,
  getMirrorActiveSessionFile: () => mirrorActiveSessionFile,
  getPendingSessionSwitchPath: () => pendingSessionSwitchPath,
  setPendingSessionSwitchPath: (v) => {
    pendingSessionSwitchPath = v;
  },
  getPendingNewSessionRefresh: () => pendingNewSessionRefresh,
  setPendingNewSessionRefresh: (v) => {
    pendingNewSessionRefresh = v;
  },
  getPendingNewSessionPreviousFile: () => pendingNewSessionPreviousFile,
  setPendingNewSessionPreviousFile: (v) => {
    pendingNewSessionPreviousFile = v;
  },
  getLastSentMessage: () => lastSentMessage,
  setLastSentMessage: (msg) => {
    lastSentMessage = msg;
  },
  addSessionCost: (delta) => {
    sessionTotalCost += delta;
  },
  setLastInputTokens: (n) => {
    lastInputTokens = n;
  },
  setLastUsage: (u) => {
    lastUsage = u;
  },
  bumpUnread: (title) => {
    unreadCount++;
    document.title = `(${unreadCount}) ● ${title}`;
  },
  onPlanModeChanged: (enabled) => setPlanModeIndicatorImpl(enabled),
});

// ═══════════════════════════════════════
// Command Palette
// ═══════════════════════════════════════

const { commandPalette, closeCommandPalette, rpcCommand } = setupCommandPalette({
  statusText,
  messageRenderer,
  toolCardRenderer,
});

// ═══════════════════════════════════════
// Model OMPcker
// ═══════════════════════════════════════

const {
  modelDropdownMenu,
  closeModelDropdown,
  fetchModelInfo,
  formatThinkingLevelLabel,
  updateThinkingBtn,
  updateModelLabel,
  updateOnboardingUI,
  currentOnboardingState,
  getCurrentThinkingLevel,
  setCurrentThinkingLevel,
  setCurrentModelId,
} = setupModelPicker({
  settingsPanel,
  composerCard,
  messageInput,
  rpcCommand,
  updateUI,
  updateTokenUsage,
  setContextWindowSize: (n) => {
    contextWindowSize = n;
  },
  hasAnySessionsLoaded,
  getCurrentWorkspacePath,
  openConfigurationSettings: () => openSettings().then(() => selectSettingsTab("configuration")),
});

// ═══════════════════════════════════════
// Composer (app-composer.js) — input, images, send, queue, abort
// ═══════════════════════════════════════

const {
  clearMessageQueue,
  flushQueue,
  escapeHtml,
  getInFlightPrompt,
  deleteInFlightPrompt,
  setPlanModeIndicator,
  syncPlanMode,
} = setupComposer({
  transport,
  state,
  wsClient,
  sidebar,
  messageRenderer,
  messageInput,
  composerCard,
  chatForm,
  abortBtn,
  currentOnboardingState,
  abortCurrentRun,
  pollInstances,
  setLastSentMessage: (msg) => {
    lastSentMessage = msg;
  },
  rpcCommand,
});
setPlanModeIndicatorImpl = setPlanModeIndicator;

// Slash-command autocomplete (app-slash-menu.js) — "/" prefix menu above the composer
setupSlashMenu({ messageInput });

// ═══════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════

function isMobile() {
  return window.innerWidth <= 768;
}

function updateSidebarToggleIcon() {
  sidebarToggle.textContent = "☰";
}

function toggleSidebar() {
  sidebarEl.classList.toggle("collapsed");
  sidebarOverlay.classList.toggle(
    "visible",
    !sidebarEl.classList.contains("collapsed") && isMobile(),
  );
  updateSidebarToggleIcon();
}

sidebarToggle.addEventListener("click", toggleSidebar);

sidebarOverlay.addEventListener("click", () => {
  sidebarEl.classList.add("collapsed");
  sidebarOverlay.classList.remove("visible");
  updateSidebarToggleIcon();
});

refreshSessionsBtn.addEventListener("click", () => {
  if (isMobile()) {
    location.reload();
    return;
  }
  refreshSessionsBtn.classList.add("spinning");
  sidebar.loadSessions().then(() => {
    setTimeout(() => refreshSessionsBtn.classList.remove("spinning"), 600);
    if (isMirrorMode) updateMirrorLiveIndicator();
  });
});

// Swipe from left edge to open sidebar on mobile
(function initSwipeGesture() {
  let touchStartX = 0;
  let touchStartY = 0;
  let tracking = false;

  document.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      // Only track swipes starting within 20px of left edge
      if (touch.clientX < 20 && isMobile() && sidebarEl.classList.contains("collapsed")) {
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        tracking = true;
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = Math.abs(touch.clientY - touchStartY);
      // If vertical movement dominates, cancel
      if (dy > dx) {
        tracking = false;
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      if (dx > 60) {
        sidebarEl.classList.remove("collapsed");
        sidebarOverlay.classList.add("visible");
      }
    },
    { passive: true },
  );
})();

// Session search
setupSidebarSearchControl({
  input: sessionSearchInput,
  clearButton: sessionSearchClearBtn,
  onChange: (value) => sidebar.setSearchQuery(value),
});

/**
 * Reset the chat surface to a fresh "new session" view inside the current window.
 * Clears renderers/state, unmarks the active sidebar item and refreshes the list
 * so the newly created session shows up once omp writes its first message to disk.
 */
async function resetUiForNewSession() {
  pendingNewSessionPreviousFile =
    mirrorActiveSessionFile ||
    sidebar.activeSessionFile ||
    liveInstances.find((i) => i?.port === foregroundPort)?.sessionFile ||
    null;
  state.reset();
  messageRenderer.clear();
  toolCardRenderer.clear();
  renderWorkspaceWelcome();
  sidebar.clearActive();
  mirrorActiveSessionFile = null;
  viewingActiveSession = true;
  pendingSessionSwitchPath = null;
  updateMirrorInputState();
  updateUI();

  // Mark that the next assistant turn should refresh the sidebar, since OMP
  // doesn't persist a brand-new session to disk until the first message round-trip.
  pendingNewSessionRefresh = true;

  pollInstances().catch(() => {});
  sidebar.loadSessions().catch(() => {});
}

async function activateNewParallelSession(port, cwd) {
  logSessionRoute("activateNewParallelSession:start", { port, cwd });
  foregroundPort = port;
  portSessionMap.delete(port);
  if (cwd) {
    setForegroundWorkspacePath(cwd);
    updateWorkspaceIndicator(cwd);
  }
  wsClient.setRoutingContext({
    workspaceId: `workspace:${cwd || getCurrentWorkspacePath() || "unknown"}`,
    sessionId: null,
    sourcePort: foregroundPort,
  });
  await resetUiForNewSession();
  pollInstances().catch(() => {});
  logSessionRoute("activateNewParallelSession:done", { port, cwd });
}

async function newSession() {
  if (nativeAvailable()) {
    // Default behavior is process-efficient: create the new chat in-place on
    // the current omp process. Only spawn a dedicated process when a parallel
    // task is actually running.
    await startInWindowNewSession({
      transport,
      getCurrentCwd: getCurrentWorkspacePath,
      getCurrentPort: getActivePort,
      fetchInstances,
      navigate: navigateInWindow,
      onBeforeSwap: onBeforeInstanceSwap,
      shouldSpawnParallel: () => state.isStreaming,
      onInPlaceSessionCreated: () => {
        resetUiForNewSession().catch(() => {});
      },
      onParallelSessionCreated: activateNewParallelSession,
      renderError: (message) => messageRenderer.renderError(message),
    });
    return;
  }

  if (canUseSessionControl()) {
    sessionTotalCost = 0;
    lastInputTokens = 0;
    updateCostDisplay();
    updateTokenUsage();
    try {
      await transport.newSession(getActivePort());
      await resetUiForNewSession();
    } catch (err) {
      messageRenderer.renderError(`Failed to start new session: ${err}`);
      return;
    }
    if (isMobile()) {
      sidebarEl.classList.add("collapsed");
      sidebarOverlay.classList.remove("visible");
    }
    return;
  }

  // Browser/dev fallback: classic in-place "new session" against the same
  // omp process (no Tauri windows available in this mode).
  sessionTotalCost = 0;
  lastInputTokens = 0;
  updateCostDisplay();
  updateTokenUsage();
  const data = await rpcCommand({ type: "new_session" }, "Starting new session...");
  if (data?.success === false || data?.data?.cancelled) {
    messageRenderer.renderError(data?.error || "New session was cancelled");
    return;
  }
  await resetUiForNewSession();

  if (isMobile()) {
    sidebarEl.classList.add("collapsed");
    sidebarOverlay.classList.remove("visible");
  }
  if (!isMobile()) messageInput.focus();
}

async function handleNewProjectChat(project) {
  if (isWorkspaceLaunchInProgress()) return;
  setWorkspaceLaunchInProgress(true);
  try {
    if (!canUseSessionControl()) {
      const targetPath = project?.path || "";
      const currentPath = getCurrentWorkspacePath();
      const singleProject =
        Array.isArray(sidebar.projects) && sidebar.projects.length === 1
          ? sidebar.projects[0]
          : null;
      const isCurrentProject =
        !targetPath ||
        targetPath === currentPath ||
        (!currentPath && singleProject?.path === targetPath);
      if (isCurrentProject) {
        await newSession();
      } else {
        messageRenderer.renderError(
          "Starting a new chat in another project requires the desktop broker. Reopen the mobile QR code.",
        );
      }
      if (isMobile()) {
        sidebarEl.classList.add("collapsed");
        sidebarOverlay.classList.remove("visible");
      }
      return;
    }

    // Prefer reuse: same project + no active parallel run => in-place
    // new_session on current process. Spawn dedicated process only when
    // a parallel run is active.
    const launched = await startNewProjectChat({
      project,
      transport,
      getCurrentPort: getActivePort,
      getCurrentCwd: getCurrentWorkspacePath,
      shouldSpawnParallel: () => mobileClientMode || state.isStreaming,
      onInPlaceSessionCreated: () => {
        resetUiForNewSession().catch(() => {});
      },
      onParallelSessionCreated: mobileClientMode ? null : activateNewParallelSession,
      fetchInstances,
      navigate: navigateInWindow,
      onBeforeSwap: onBeforeInstanceSwap,
      renderError: (message) => messageRenderer.renderError(message),
    });
    if (!launched) return;

    if (isMobile()) {
      sidebarEl.classList.add("collapsed");
      sidebarOverlay.classList.remove("visible");
    }
  } finally {
    setWorkspaceLaunchInProgress(false);
  }
}

// Public entry point: serializes selections so overlapping clicks don't
// interleave their awaits and corrupt shared routing state.
function handleSessionSelect(session, project) {
  const run = sessionSelectChain.then(() => handleSessionSelectImpl(session, project));
  // Keep the chain alive even if this selection rejects.
  sessionSelectChain = run.catch(() => {});
  return run;
}

const {
  handleSessionSelectImpl,
  handleMirrorSync,
  updateMirrorLiveIndicator,
  pollInstances: sessionRoutingPollInstances,
  updateMirrorInputState,
} = setupSessionRouting({
  state,
  sidebar,
  wsClient,
  transport,
  messageRenderer,
  toolCardRenderer,
  portSessionMap,
  messageInput,
  sidebarEl,
  sidebarOverlay,
  isMobile,
  nativeAvailable,
  logSessionRoute,
  clearMessageQueue,
  getCurrentWorkspacePath,
  syncWorkspaceIndicatorFromInstances,
  setForegroundWorkspacePath,
  updateWorkspaceIndicator,
  workspacePathFromId,
  hasAnySessionsLoaded,
  renderWorkspaceWelcome,
  showTypingIndicator,
  updateCostDisplay,
  updateTokenUsage,
  updateUI,
  fetchContextWindow,
  setCurrentModelId,
  updateModelLabel,
  setCurrentThinkingLevel,
  updateThinkingBtn,
  getForegroundPort: () => foregroundPort,
  setForegroundPort: (port) => {
    foregroundPort = port;
  },
  getLiveInstances: () => liveInstances,
  setLiveInstances: (v) => {
    liveInstances = v;
  },
  getMirrorActiveSessionFile: () => mirrorActiveSessionFile,
  setMirrorActiveSessionFile: (v) => {
    mirrorActiveSessionFile = v;
  },
  getViewingActiveSession: () => viewingActiveSession,
  setViewingActiveSession: (v) => {
    viewingActiveSession = v;
  },
  getIsMirrorMode: () => isMirrorMode,
  setIsMirrorMode: (v) => {
    isMirrorMode = v;
  },
  getPendingSessionSwitchPath: () => pendingSessionSwitchPath,
  setPendingSessionSwitchPath: (v) => {
    pendingSessionSwitchPath = v;
  },
  getSessionsLoaded: () => sessionsLoaded,
  setDeferredMirrorSync: (v) => {
    deferredMirrorSync = v;
  },
  setSessionTotalCost: (n) => {
    sessionTotalCost = n;
  },
  addSessionCost: (delta) => {
    sessionTotalCost += delta;
  },
  setLastInputTokens: (n) => {
    lastInputTokens = n;
  },
  setLastUsage: (u) => {
    lastUsage = u;
  },
  setContextWindowSize: (n) => {
    contextWindowSize = n;
  },
  isFocused: () => hasFocus,
});
pollInstancesImpl = sessionRoutingPollInstances;
// ═══════════════════════════════════════
// UI helpers
// ═══════════════════════════════════════

function showTypingIndicator(show) {
  typingIndicator.classList.toggle("hidden", !show);
}

function abortCurrentRun() {
  wsClient.send({ type: "abort" });
  messageRenderer.renderError("Aborted by user");
  showTypingIndicator(false);

  // In some abort paths, backend agent_end can be delayed or missing.
  // Optimistically unlock input so users can continue immediately.
  if (state.isStreaming) {
    state.setStreaming(false);
    resetStreamingState();
    updateUI();
  }
}

function updateCostDisplay() {
  if (sessionTotalCost > 0) {
    sessionCostEl.textContent = `$${sessionTotalCost.toFixed(4)} (sub)`;
    sessionCostEl.classList.add("visible");
  } else {
    sessionCostEl.classList.remove("visible");
  }
}

function updateTokenUsage() {
  if (lastInputTokens > 0 && contextWindowSize > 0) {
    const pct = Math.round((lastInputTokens / contextWindowSize) * 100);
    tokenUsageEl.textContent = `${pct}%`;
    tokenUsageEl.classList.add("visible");
    tokenUsageEl.classList.remove("warning", "critical");
    if (pct >= 80) {
      tokenUsageEl.classList.add("critical");
    } else if (pct >= 60) {
      tokenUsageEl.classList.add("warning");
    }
    tokenUsageEl.title = `Context: ${(lastInputTokens / 1000).toFixed(1)}k / ${(contextWindowSize / 1000).toFixed(0)}k tokens`;
    if (pct >= 80) {
      showCompactButton();
    } else {
      hideCompactButton();
    }
  } else if (lastInputTokens > 0) {
    // No context window info yet, just show raw tokens
    tokenUsageEl.textContent = `${(lastInputTokens / 1000).toFixed(1)}k`;
    tokenUsageEl.classList.add("visible");
    tokenUsageEl.classList.remove("warning", "critical");
  }
}

function showCompactButton() {
  if (document.getElementById("compact-btn")) return;
  const btn = document.createElement("button");
  btn.id = "compact-btn";
  btn.className = "compact-btn";
  btn.textContent = "Compact";
  btn.title = "Context is over 80% — compact to save tokens";
  btn.addEventListener("click", () => {
    rpcCommand({ type: "compact" }, "Compacting...");
    hideCompactButton();
  });
  // Insert next to token usage in header
  tokenUsageEl.parentElement.insertBefore(btn, tokenUsageEl.nextSibling);
}

function hideCompactButton() {
  const btn = document.getElementById("compact-btn");
  if (btn) btn.remove();
}

async function fetchContextWindow() {
  // Delegate to fetchModelInfo which also updates the model button
  await fetchModelInfo();
}

function openExternalLink(url) {
  if (!url) return;
  if (nativeAvailable()) {
    transport.openExternal(url).catch((err) => {
      console.error("[browse] failed to open external link:", err);
    });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

const { refreshLanUrl, getConnectionUrls } = setupLanQr({ statusText, openExternalLink });

function updateConnectionStatus(status) {
  statusIndicator.className = `status-indicator ${status}`;

  if (status === "connected") {
    const { tailscaleUrl, lanUrl } = getConnectionUrls();
    if (tailscaleUrl) {
      statusText.textContent = "Connected • TS";
      statusText.title = tailscaleUrl;
    } else if (lanUrl) {
      statusText.textContent = "Connected • LAN";
      statusText.title = lanUrl;
    } else {
      statusText.textContent = "Connected";
      statusText.title = "";
    }
    // Fetch network link metadata on first connect
    if (!tailscaleUrl && !lanUrl) {
      void refreshLanUrl();
    }
  } else if (status === "disconnected") {
    statusText.textContent = "Disconnected";
  }
}

function updateUI() {
  const isStreaming = state.isStreaming;
  const onboarding = updateOnboardingUI();

  composerCard.classList.toggle("streaming", isStreaming);

  if (isStreaming) {
    statusIndicator.classList.add("streaming");
    statusIndicator.classList.remove("connected");
    statusText.textContent = "Working...";
  } else {
    statusIndicator.classList.remove("streaming");
    statusIndicator.classList.add("connected");
    statusText.textContent = "Connected";
  }

  messageInput.disabled = !onboarding.canType;
  sendBtn.disabled = !onboarding.canQuery;

  if (isStreaming) {
    abortBtn.classList.remove("hidden");
    sendBtn.classList.add("hidden");
  } else {
    abortBtn.classList.add("hidden");
    sendBtn.classList.remove("hidden");
    flushQueue();
  }

  // Viewing a history session while original is still streaming —
  // block input until agent_end triggers the deferred switch_session.
  if (pendingSessionSwitchPath) {
    messageInput.disabled = true;
    sendBtn.disabled = true;
    abortBtn.classList.add("hidden");
    messageInput.placeholder = "Waiting for current session to finish…";
  } else if (onboarding.canQuery) {
    messageInput.placeholder = "Type a message...";
  }
}

// ═══════════════════════════════════════
// WebSocket session switch handler
// ═══════════════════════════════════════

wsClient.addEventListener("sessionSwitch", () => {
  console.log("[App] Session switched");
});

const { loadBrowsePackages } = setupPackageBrowser({
  transport,
  nativeAvailable,
  escapeHtml,
  openExternalLink,
});

// ═══════════════════════════════════════
// Theme / Settings + Auto-updater (app-settings-panel.js)
// ═══════════════════════════════════════

const { openSettings, closeSettings, selectSettingsTab, initUpdaterUI, initOmpUpdaterUI } =
  setupSettingsPanel({
    settingsPanel,
    messagesContainer,
    transport,
    nativeAvailable,
    rpcCommand,
    formatThinkingLevelLabel,
    getCurrentThinkingLevel,
    setCurrentThinkingLevel,
    updateThinkingBtn,
    fetchModelInfo,
    updateUI,
    loadBrowsePackages,
    refreshLanUrl,
  });

setupKeyboardShortcuts({
  state,
  transport,
  messageRenderer,
  messageInput,
  sidebarEl,
  settingsPanel,
  commandPalette,
  modelDropdownMenu,
  closeSettings,
  closeCommandPalette,
  closeModelDropdown,
  abortCurrentRun,
  toggleSidebar,
  newSession,
  nativeAvailable,
});

// Native capabilities arrive asynchronously over the broker WS (the handshake
// frame lands right after connect). Re-evaluate native-gated UI once it's known
// so buttons that were hidden on first paint appear when attached to the host.
wsClient.addEventListener("capabilities", () => {
  refreshHeaderOpenAppButton();
  void loadHeaderOpenApps();
  void initUpdaterUI();
  // Re-run the OMP update check too: the startup check may have raced a slow
  // WS boot and silently failed, leaving an available update with no pill.
  void initOmpUpdaterUI();
});

setupContextViz({
  tokenUsageEl,
  contextViz: document.getElementById("context-viz"),
  contextBar: document.getElementById("context-bar"),
  contextLegend: document.getElementById("context-legend"),
  contextVizUsed: document.getElementById("context-viz-used"),
  contextVizTotal: document.getElementById("context-viz-total"),
  getUsage: () => lastUsage,
  getContextWindowSize: () => contextWindowSize,
});

setupVoiceInput({
  micBtn: document.getElementById("mic-btn"),
  messageInput,
});

// ═══════════════════════════════════════
// Initialize
// ═══════════════════════════════════════

// On mobile, collapse model bar above input
if (isMobile()) {
  sidebarEl.classList.add("collapsed");

  const mobileBar = document.getElementById("mobile-model-bar");

  // Start collapsed
  mobileBar.classList.add("collapsed");

  // Toggle via chevron
  const contextToggle = document.getElementById("mobile-context-toggle");
  contextToggle.addEventListener("click", () => {
    mobileBar.classList.toggle("collapsed");
    contextToggle.classList.toggle("flipped", !mobileBar.classList.contains("collapsed"));
  });
}

// Make the Ompcot icon in sidebar switch back to chat
document.querySelector(".mode-link:first-child")?.addEventListener("click", () => {
  closeSettings();
});

// ═══════════════════════════════════════
// Open Folder as workspace
// ═══════════════════════════════════════

async function handleOpenFolder() {
  if (isWorkspaceLaunchInProgress()) return;
  setWorkspaceLaunchInProgress(true);
  try {
    await openFolderAsWorkspace({
      transport,
      fetchInstances,
      getCurrentPort: getActivePort,
      navigate: navigateInWindow,
      onBeforeSwap: onBeforeInstanceSwap,
      renderError: (message) => messageRenderer.renderError(message),
    });
  } finally {
    setWorkspaceLaunchInProgress(false);
  }
}

openFolderBtn?.addEventListener("click", handleOpenFolder);

wsClient.connect();
dismissBootSwapOverlayWhenReady();
renderWorkspaceWelcome();
sidebar.loadSessions().then(() => {
  sessionsLoaded = true;
  updateUI();
  if (!hasAnySessionsLoaded()) {
    renderWorkspaceWelcome();
  }
  if (deferredMirrorSync) {
    const syncData = deferredMirrorSync;
    deferredMirrorSync = null;
    handleMirrorSync(syncData);
  }
  if (isMirrorMode) updateMirrorLiveIndicator();
});

// Dismiss mobile splash screen
const splash = document.getElementById("mobile-splash");
if (splash) {
  requestAnimationFrame(() => {
    splash.classList.add("hidden");
    setTimeout(() => splash.remove(), 300);
  });
}

console.log("🚀 Ompcot initialized");
