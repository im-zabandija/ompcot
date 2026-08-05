import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setupSessionRouting } from "./app-session-routing.js";

function makeDeps(overrides = {}) {
  const messageRenderer = {
    clear: vi.fn(),
    renderSystemMessage: vi.fn(),
    renderError: vi.fn(),
    renderUserMessage: vi.fn(),
    renderAssistantMessage: vi.fn(),
    highlightSearchQuery: vi.fn(),
  };
  const toolCardRenderer = {
    clear: vi.fn(),
    createHistoryCard: vi.fn(),
    addHistoryResult: vi.fn(),
  };
  const sidebar = {
    activeSessionFile: null,
    searchQuery: "",
    streamingFiles: new Set(),
    setActive: vi.fn((filePath) => {
      sidebar.activeSessionFile = filePath;
    }),
    isStreaming: vi.fn(() => false),
    setStreaming: vi.fn(),
  };

  return {
    state: {
      isStreaming: false,
      reset: vi.fn(),
      setStreaming: vi.fn(),
    },
    sidebar,
    wsClient: {
      setRoutingContext: vi.fn(),
      send: vi.fn(),
    },
    transport: {
      spawnSessionProcess: vi.fn().mockResolvedValue(null),
      switchSession: vi.fn().mockResolvedValue(undefined),
    },
    messageRenderer,
    toolCardRenderer,
    portSessionMap: new Map(),
    messageInput: document.createElement("input"),
    sidebarEl: document.createElement("div"),
    sidebarOverlay: document.createElement("div"),
    isMobile: () => false,
    nativeAvailable: () => true,
    logSessionRoute: vi.fn(),
    isSelectionCurrent: () => true,
    clearMessageQueue: vi.fn(),
    getCurrentWorkspacePath: () => "",
    syncWorkspaceIndicatorFromInstances: vi.fn(),
    setForegroundWorkspacePath: vi.fn(),
    updateWorkspaceIndicator: vi.fn(),
    workspacePathFromId: vi.fn(() => ""),
    hasAnySessionsLoaded: vi.fn(() => true),
    renderWorkspaceWelcome: vi.fn(),
    showTypingIndicator: vi.fn(),
    updateCostDisplay: vi.fn(),
    updateTokenUsage: vi.fn(),
    updateUI: vi.fn(),
    fetchContextWindow: vi.fn(),
    setCurrentModelId: vi.fn(),
    updateModelLabel: vi.fn(),
    setCurrentThinkingLevel: vi.fn(),
    updateThinkingBtn: vi.fn(),
    getForegroundPort: () => 47821,
    setForegroundPort: vi.fn(),
    getLiveInstances: () => [],
    setLiveInstances: vi.fn(),
    getMirrorActiveSessionFile: () => null,
    setMirrorActiveSessionFile: vi.fn(),
    getViewingActiveSession: () => false,
    setViewingActiveSession: vi.fn(),
    getIsMirrorMode: () => false,
    setIsMirrorMode: vi.fn(),
    getPendingSessionSwitchPath: () => null,
    setPendingSessionSwitchPath: vi.fn(),
    getSessionsLoaded: () => true,
    setDeferredMirrorSync: vi.fn(),
    setSessionTotalCost: vi.fn(),
    addSessionCost: vi.fn(),
    setLastInputTokens: vi.fn(),
    setLastUsage: vi.fn(),
    setContextWindowSize: vi.fn(),
    isFocused: () => false,
    ...overrides,
  };
}

const session = { filePath: "/sessions/a.jsonl", file: "a.jsonl" };
const project = { path: "/workspace", dirName: "workspace" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("app session routing history selection guards", () => {
  test("late fetch of a superseded selection never paints", async () => {
    let current = session.filePath;
    let resolveHistory;
    const history = new Promise((resolve) => {
      resolveHistory = resolve;
    });
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => history,
    });
    vi.stubGlobal("fetch", fetch);
    const deps = makeDeps({ isSelectionCurrent: (filePath) => filePath === current });
    const routing = setupSessionRouting(deps);

    const selection = routing.handleSessionSelectImpl(session, project);
    const clearCallsBeforeResponse = deps.messageRenderer.clear.mock.calls.length;
    current = "/sessions/b.jsonl";
    resolveHistory({
      entries: [{ type: "message", message: { role: "user", content: "stale" } }],
    });
    await selection;

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deps.messageRenderer.clear).toHaveBeenCalledTimes(clearCallsBeforeResponse);
    expect(deps.messageRenderer.renderUserMessage).not.toHaveBeenCalled();
    expect(deps.messageRenderer.renderAssistantMessage).not.toHaveBeenCalled();
  });

  test("the current selection still paints fetched history", async () => {
    let resolveHistory;
    const history = new Promise((resolve) => {
      resolveHistory = resolve;
    });
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => history,
    });
    vi.stubGlobal("fetch", fetch);
    const deps = makeDeps();
    const routing = setupSessionRouting(deps);

    const selection = routing.handleSessionSelectImpl(session, project);
    const clearCallsBeforeResponse = deps.messageRenderer.clear.mock.calls.length;
    resolveHistory({
      entries: [{ type: "message", message: { role: "user", content: "current" } }],
    });
    await selection;

    expect(deps.messageRenderer.clear).toHaveBeenCalledTimes(clearCallsBeforeResponse + 1);
    expect(deps.messageRenderer.renderUserMessage).toHaveBeenCalledTimes(1);
    expect(deps.messageRenderer.renderUserMessage.mock.calls[0][0].content).toBe("current");
  });

  test("a selection superseded while queued does nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const deps = makeDeps({ isSelectionCurrent: () => false });
    const routing = setupSessionRouting(deps);

    await routing.handleSessionSelectImpl(session, project);

    expect(fetch).not.toHaveBeenCalled();
    expect(deps.sidebar.setActive).not.toHaveBeenCalled();
    expect(deps.messageRenderer.clear).not.toHaveBeenCalled();
    expect(deps.messageRenderer.renderSystemMessage).not.toHaveBeenCalled();
  });
});
