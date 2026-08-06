import { describe, expect, test, vi } from "vitest";
import { setupRpcEvents } from "./app-rpc-events.js";

function makeDeps(overrides = {}) {
  const messageRenderer = {
    clear: vi.fn(),
    renderSystemMessage: vi.fn(),
    renderError: vi.fn(),
    renderUserMessage: vi.fn(),
    renderAssistantMessage: vi.fn(() => document.createElement("div")),
    updateStreamingMessage: vi.fn(),
    updateStreamingThinking: vi.fn(),
    finalizeStreamingMessage: vi.fn(),
  };
  const toolCardRenderer = {
    clear: vi.fn(),
    createHistoryCard: vi.fn(),
    addHistoryResult: vi.fn(),
    createToolCard: vi.fn(),
    updateToolCard: vi.fn(),
    finalizeToolCard: vi.fn(),
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
    markUnread: vi.fn(),
    loadSessions: vi.fn().mockResolvedValue([]),
  };

  return {
    state: {
      isStreaming: false,
      reset: vi.fn(),
      setStreaming: vi.fn(),
    },
    sidebar,
    messageRenderer,
    messagesContainer: document.createElement("div"),
    toolCardRenderer,
    transport: {
      spawnSessionProcess: vi.fn().mockResolvedValue(null),
      switchSession: vi.fn().mockResolvedValue(undefined),
      showNotification: vi.fn(),
    },
    dialogHandler: {
      showSelect: vi.fn(),
      showConfirm: vi.fn(),
      showInput: vi.fn(),
      showEditor: vi.fn(),
      showNotification: vi.fn(),
    },
    originalTitle: "Ompcot",
    updateUI: vi.fn(),
    updateCostDisplay: vi.fn(),
    updateTokenUsage: vi.fn(),
    showTypingIndicator: vi.fn(),
    showNewMessageBadge: vi.fn(),
    hideCompactButton: vi.fn(),
    syncWorkspaceIndicatorFromInstances: vi.fn(),
    pollInstances: vi.fn().mockResolvedValue(undefined),
    isFocused: () => false,
    getForegroundPort: () => 47821,
    setForegroundPort: vi.fn(),
    getLiveInstances: () => [],
    getMirrorActiveSessionFile: () => null,
    getPendingSessionSwitchPath: () => null,
    setPendingSessionSwitchPath: vi.fn(),
    getPendingNewSessionRefresh: () => false,
    setPendingNewSessionRefresh: vi.fn(),
    getPendingNewSessionPreviousFile: () => null,
    setPendingNewSessionPreviousFile: vi.fn(),
    getLastSentMessage: () => null,
    setLastSentMessage: vi.fn(),
    addSessionCost: vi.fn(),
    setLastInputTokens: vi.fn(),
    setLastUsage: vi.fn(),
    bumpUnread: vi.fn(),
    onPlanModeChanged: vi.fn(),
    ...overrides,
  };
}

describe("app rpc events — agent_end isTerminal contract", () => {
  test("foreground agent_end with isTerminal:false keeps the streaming state (run resumes)", () => {
    const deps = makeDeps();
    const { handleRPCEvent } = setupRpcEvents(deps);

    handleRPCEvent({ type: "agent_end", isTerminal: false });

    expect(deps.state.setStreaming).not.toHaveBeenCalled();
    expect(deps.showTypingIndicator).not.toHaveBeenCalled();
  });

  test("foreground agent_end with isTerminal:true returns to idle", () => {
    const deps = makeDeps();
    const { handleRPCEvent } = setupRpcEvents(deps);

    handleRPCEvent({ type: "agent_end", isTerminal: true });

    expect(deps.state.setStreaming).toHaveBeenCalledWith(false);
    expect(deps.showTypingIndicator).toHaveBeenCalledWith(false);
  });

  test("foreground agent_end without isTerminal is treated as terminal (old-runtime compatibility)", () => {
    const deps = makeDeps();
    const { handleRPCEvent } = setupRpcEvents(deps);

    handleRPCEvent({ type: "agent_end" });

    expect(deps.state.setStreaming).toHaveBeenCalledWith(false);
    expect(deps.showTypingIndicator).toHaveBeenCalledWith(false);
  });

  test("background agent_end with isTerminal:false keeps the sidebar streaming flag", () => {
    const deps = makeDeps();
    const { handleRPCEvent } = setupRpcEvents(deps);
    const event = {
      type: "agent_end",
      isTerminal: false,
      __broker: { sessionId: "/x/s.jsonl", sourcePort: 47999 },
    };

    handleRPCEvent(event);

    expect(deps.sidebar.setStreaming).not.toHaveBeenCalled();
    expect(deps.sidebar.markUnread).not.toHaveBeenCalled();
    expect(deps.sidebar.loadSessions).not.toHaveBeenCalled();
    expect(deps.pollInstances).not.toHaveBeenCalled();
  });

  test("background agent_end without isTerminal turns off the sidebar streaming flag", () => {
    const deps = makeDeps();
    const { handleRPCEvent } = setupRpcEvents(deps);
    const event = {
      type: "agent_end",
      __broker: { sessionId: "/x/s.jsonl", sourcePort: 47999 },
    };

    handleRPCEvent(event);

    expect(deps.sidebar.setStreaming).toHaveBeenCalledWith("/x/s.jsonl", false);
    expect(deps.sidebar.markUnread).toHaveBeenCalledWith("/x/s.jsonl");
  });
});
