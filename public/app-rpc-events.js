import { resolveNewSessionLiveFile } from "./new-session-refresh.js";
import { findPortForSession } from "./session-routing.js";

/**
 * RPC event handlers — every `handle*` dispatched from the WebSocket
 * "rpc" event: agent lifecycle, message stream, tool executions, auto-
 * compaction, extension UI requests, session-name updates.
 *
 * Owns the transient streaming assistant element / text / thinking
 * accumulator (the only writers are here and `abortCurrentRun`, which
 * calls back through `resetStreamingState`).
 *
 * Cross-cutting mutable state that also gets written from mirror sync
 * or the abort path (`foregroundPort`, `pendingSessionSwitchPath`,
 * `pendingNewSessionRefresh`, `pendingNewSessionPreviousFile`,
 * `sessionTotalCost`, `lastInputTokens`, `lastUsage`, `unreadCount`,
 * `lastSentMessage`) stays owned by app.js and is threaded here as
 * getter/setter deps. Session-routing extraction (next step) will
 * absorb most of these, so the setter pattern keeps the same code
 * paths callable from either side.
 */
export function setupRpcEvents({
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
  // NOTE: line ~186 below calls a bare `scrollToBottom()` that has never
  // resolved to anything (there's no top-level `scrollToBottom` — only
  // methods on messageRenderer / toolCardRenderer). It's an inherited
  // dormant bug — auto_compaction_start currently throws ReferenceError
  // when it fires. Not fixing here to keep this extraction pure.
  showNewMessageBadge,
  hideCompactButton,
  syncWorkspaceIndicatorFromInstances,
  pollInstances,
  isFocused,
  getForegroundPort,
  setForegroundPort,
  getLiveInstances,
  getMirrorActiveSessionFile,
  getPendingSessionSwitchPath,
  setPendingSessionSwitchPath,
  getPendingNewSessionRefresh,
  setPendingNewSessionRefresh,
  getPendingNewSessionPreviousFile,
  setPendingNewSessionPreviousFile,
  getLastSentMessage,
  setLastSentMessage,
  addSessionCost,
  setLastInputTokens,
  setLastUsage,
  bumpUnread,
}) {
  let currentStreamingElement = null;
  let currentStreamingText = "";
  let currentStreamingThinking = "";

  function handleRPCEvent(event) {
    const eventSessionFile = event?.__broker?.sessionId || null;
    const eventSourcePort = event?.__broker?.sourcePort ?? null;
    const foregroundPort = getForegroundPort();

    // Port-based guard: the broker broadcasts every upstream's events to all UI
    // clients, so an event from a *different* omp process (e.g. the previous
    // session that is still streaming after the user started a new parallel
    // session) must never render into the foreground UI. A brand-new session
    // has no session file yet, so the sessionId guard below can't catch this —
    // the source port is the only reliable discriminator at that moment.
    if (
      typeof eventSourcePort === "number" &&
      typeof foregroundPort === "number" &&
      eventSourcePort !== foregroundPort
    ) {
      if (eventSessionFile) handleBackgroundRPCEvent(eventSessionFile, event);
      return;
    }

    if (
      eventSessionFile &&
      sidebar.activeSessionFile &&
      eventSessionFile !== sidebar.activeSessionFile
    ) {
      handleBackgroundRPCEvent(eventSessionFile, event);
      return;
    }

    // While the user is previewing a different session, suppress all live
    // rendering so the history view isn't overwritten by streaming output.
    // agent_end still needs to fire so we can complete the deferred switch.
    if (getPendingSessionSwitchPath() && event.type !== "agent_end") return;

    switch (event.type) {
      case "agent_start":
        handleAgentStart(event);
        break;
      case "agent_end":
        handleAgentEnd(event);
        if (getPendingNewSessionRefresh()) {
          refreshSidebarForNewSession(event).catch(() => {});
        }
        break;
      case "message_start":
        handleMessageStart(event.message);
        // Refresh the sidebar as soon as the new session is persisted. OMP writes
        // the brand-new session's .jsonl on the first user message round-trip, so
        // refreshing on the user message (not just the assistant turn) makes the
        // session — with its first message as the title — show up immediately.
        if (getPendingNewSessionRefresh()) {
          refreshSidebarForNewSession(event).catch(() => {});
          pollInstances().catch(() => {});
        }
        break;
      case "message_update":
        handleMessageUpdate(event);
        break;
      case "message_end":
        handleMessageEnd(event.message);
        if (getPendingNewSessionRefresh()) {
          refreshSidebarForNewSession(event).catch(() => {});
        }
        break;
      case "tool_execution_start":
        handleToolExecutionStart(event);
        break;
      case "tool_execution_update":
        handleToolExecutionUpdate(event);
        break;
      case "tool_execution_end":
        handleToolExecutionEnd(event);
        break;
      case "auto_compaction_start":
        handleCompactionStart();
        break;
      case "auto_compaction_end":
        handleCompactionEnd(event);
        break;
      case "extension_ui_request":
        handleExtensionUIRequest(event);
        break;
      case "extension_error":
        messageRenderer.renderError(`Extension error: ${event.error}`);
        break;
      case "session_name":
        // Auto-title: update sidebar with new session name
        if (event.name) {
          const activeItem = document.querySelector(".session-item.active .session-title");
          if (activeItem) activeItem.textContent = event.name;
        }
        break;
    }
  }

  function handleBackgroundRPCEvent(sessionFile, event) {
    switch (event.type) {
      case "agent_start":
        sidebar.setStreaming(sessionFile, true);
        break;
      case "agent_end":
        sidebar.setStreaming(sessionFile, false);
        sidebar.markUnread(sessionFile);
        sidebar.loadSessions({ quiet: true }).catch(() => {});
        pollInstances().catch(() => {});
        break;
      case "message_end":
        sidebar.markUnread(sessionFile);
        break;
    }
  }

  function handleCompactionStart() {
    const el = document.createElement("div");
    el.className = "system-message compaction-message";
    el.id = "compaction-indicator";
    el.innerHTML = '<span class="compaction-spinner">⟳</span> Compacting context…';
    messagesContainer.appendChild(el);
    scrollToBottom();
  }

  function handleCompactionEnd(event) {
    const indicator = document.getElementById("compaction-indicator");
    if (indicator) {
      const summary = event.summary ? ` — ${event.summary}` : "";
      indicator.innerHTML = `✓ Context compacted${summary}`;
      indicator.classList.add("compaction-done");
    }
    // Reset token tracking — next message will update
    setLastInputTokens(0);
    updateTokenUsage();
    hideCompactButton();
  }

  /**
   * Refresh the sidebar after a brand-new session's first message round-trips.
   *
   * OMP only persists a new session's .jsonl on the first message round-trip, and
   * `/api/sessions` can briefly return *successfully* without the new file yet
   * (loadSessions' built-in retry only covers fetch failures, not "fetched but
   * the row isn't there"). So we reload, and if the freshly created session still
   * isn't in the list, retry a few times with a short backoff before giving up.
   */
  async function refreshSidebarForNewSession(event = null, attempt = 0) {
    const projects = await sidebar.loadSessions({ quiet: true }).catch(() => null);

    const liveFile = getCurrentLiveSessionFile(event);
    if (liveFile) {
      // Read the result this call actually fetched (not sidebar.projects, which a
      // concurrent load could leave stale) so we detect the new session as soon as
      // any fetch observes it on disk.
      const found = (projects || sidebar.projects).some((p) =>
        p.sessions.some((s) => s.filePath === liveFile),
      );
      if (found) {
        sidebar.setActive(liveFile);
        setPendingNewSessionRefresh(false);
        setPendingNewSessionPreviousFile(null);
        return;
      }
    }

    if (attempt < 4) {
      await pollInstances().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      return refreshSidebarForNewSession(event, attempt + 1);
    }
  }

  function getCurrentLiveSessionFile(event = null) {
    return resolveNewSessionLiveFile({
      event,
      liveInstances: getLiveInstances(),
      foregroundPort: getForegroundPort(),
      mirrorActiveSessionFile: getMirrorActiveSessionFile(),
      excludedSessionFile: getPendingNewSessionPreviousFile(),
    });
  }

  function handleAgentStart(event = null) {
    state.setStreaming(true);
    showTypingIndicator(true);
    updateUI();
    const live = getCurrentLiveSessionFile(event);
    if (live) sidebar.setStreaming(live, true);
  }

  function handleAgentEnd(event = null) {
    state.setStreaming(false);
    showTypingIndicator(false);
    currentStreamingElement = null;
    currentStreamingText = "";
    updateUI();

    // Deferred session switch: user clicked a history session while streaming.
    // Now that the agent run is done, tell omp to switch — no abort needed.
    const pendingSwitch = getPendingSessionSwitchPath();
    if (pendingSwitch) {
      setPendingSessionSwitchPath(null);
      const live = getCurrentLiveSessionFile();
      if (live) sidebar.setStreaming(live, false);
      const newPort = findPortForSession(getLiveInstances(), pendingSwitch, getForegroundPort());
      setForegroundPort(newPort);
      syncWorkspaceIndicatorFromInstances();
      transport.switchSession(pendingSwitch, newPort).catch((e) => {
        messageRenderer.renderError(`Failed to switch session: ${e}`);
      });
      return;
    }

    const live = getCurrentLiveSessionFile(event);
    if (live) {
      sidebar.setStreaming(live, false);
      // If user is not currently viewing this session in the sidebar,
      // mark it as unread so they see a blue dot when they look back.
      if (live !== sidebar.activeSessionFile) {
        sidebar.markUnread(live);
      }
    }

    // Notify via tab title if unfocused
    if (!isFocused()) {
      bumpUnread(originalTitle);
      transport.showNotification({
        title: "Ompcot",
        body: "El agente terminó de responder",
      });
    }
  }

  function handleMessageStart(message) {
    if (message.role === "assistant") {
      currentStreamingText = "";
      currentStreamingThinking = "";
      currentStreamingElement = messageRenderer.renderAssistantMessage({ content: "" }, true);
    } else if (message.role === "user") {
      // In mirror mode, user messages from TUI appear via events
      // Only render if we didn't just send this message ourselves
      const lastSent = getLastSentMessage();
      if (!lastSent || getMessageText(message) !== lastSent) {
        const content = getMessageText(message);
        if (content) {
          messageRenderer.renderUserMessage({ content });
        }
      }
      setLastSentMessage(null);
    }
  }

  function getMessageText(message) {
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }
    return "";
  }

  function getAssistantText(message) {
    if (typeof message?.content === "string") return message.content;
    if (!Array.isArray(message?.content)) return "";
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("\n");
  }

  function getAssistantThinking(message) {
    if (!Array.isArray(message?.content)) return "";
    return message.content
      .filter((block) => block.type === "thinking")
      .map((block) => block.thinking || "")
      .join("\n");
  }

  function ensureStreamingAssistantElement(message = null) {
    if (currentStreamingElement) return currentStreamingElement;
    currentStreamingText = getAssistantText(message);
    currentStreamingThinking = getAssistantThinking(message);
    currentStreamingElement = messageRenderer.renderAssistantMessage({ content: "" }, true);
    if (currentStreamingThinking) {
      messageRenderer.updateStreamingThinking(currentStreamingElement, currentStreamingThinking);
    }
    if (currentStreamingText) {
      messageRenderer.updateStreamingMessage(currentStreamingElement, currentStreamingText);
    }
    return currentStreamingElement;
  }

  function handleMessageUpdate(event) {
    const { assistantMessageEvent, message } = event;
    if (message?.role === "assistant") {
      ensureStreamingAssistantElement(message);
    }

    if (assistantMessageEvent.type === "thinking_delta") {
      currentStreamingThinking =
        getAssistantThinking(message) || currentStreamingThinking + assistantMessageEvent.delta;
      if (currentStreamingElement) {
        messageRenderer.updateStreamingThinking(currentStreamingElement, currentStreamingThinking);
      }
    } else if (assistantMessageEvent.type === "text_delta") {
      currentStreamingText =
        getAssistantText(message) || currentStreamingText + assistantMessageEvent.delta;
      if (currentStreamingElement) {
        messageRenderer.updateStreamingMessage(currentStreamingElement, currentStreamingText);
      }
    }
  }

  function handleMessageEnd(message) {
    if (message?.role === "assistant" && message?.stopReason === "error") {
      const provider = message?.provider ? String(message.provider) : "unknown";
      const model = message?.model ? String(message.model) : "unknown";
      const errorMessage = message?.errorMessage
        ? String(message.errorMessage)
        : "Model request failed";
      messageRenderer.renderError(`[${provider}/${model}] ${errorMessage}`);
    }
    if (!currentStreamingElement && message?.role === "assistant") {
      ensureStreamingAssistantElement(message);
    }
    if (currentStreamingElement) {
      // Pass usage info for cost display
      const usage = message?.usage || null;
      // Pass thinking content so finalize can render the thinking block
      messageRenderer.finalizeStreamingMessage(
        currentStreamingElement,
        usage,
        currentStreamingThinking,
      );
      currentStreamingElement = null;
      currentStreamingThinking = "";

      // Track session cost and tokens
      if (usage?.cost?.total) {
        addSessionCost(usage.cost.total);
      }
      if (usage?.input) {
        setLastInputTokens(usage.input + (usage.cacheRead || 0));
        setLastUsage(usage);
      }
      updateCostDisplay();
      updateTokenUsage();
      showNewMessageBadge();
    }
  }

  function handleToolExecutionStart(event) {
    const { toolCallId, toolName, args } = event;

    state.addToolExecution(toolCallId, {
      toolName,
      args,
      status: "pending",
    });

    toolCardRenderer.createToolCard(state.getToolExecution(toolCallId));
  }

  function handleToolExecutionUpdate(event) {
    const { toolCallId, partialResult } = event;
    const output = formatToolOutput(partialResult);

    state.updateToolExecution(toolCallId, {
      status: "streaming",
      output,
    });

    toolCardRenderer.updateToolCard(state.getToolExecution(toolCallId));
  }

  function handleToolExecutionEnd(event) {
    const { toolCallId, result, isError } = event;
    const output = formatToolOutput(result);

    state.updateToolExecution(toolCallId, {
      status: isError ? "error" : "complete",
      output,
      isError,
    });

    toolCardRenderer.finalizeToolCard(toolCallId, result, isError);
  }

  function handleExtensionUIRequest(event) {
    switch (event.method) {
      case "select":
        dialogHandler.showSelect(event);
        break;
      case "confirm":
        dialogHandler.showConfirm(event);
        break;
      case "input":
        dialogHandler.showInput(event);
        break;
      case "editor":
        dialogHandler.showEditor(event);
        break;
      case "notify":
        dialogHandler.showNotification(event);
        break;
      default:
        console.warn("[App] Unknown extension UI method:", event.method);
    }
  }

  function formatToolOutput(result) {
    if (!result) return "";

    if (result.content && Array.isArray(result.content)) {
      return result.content
        .map((block) => {
          if (block.type === "text") return block.text;
          return JSON.stringify(block);
        })
        .join("\n");
    }

    return JSON.stringify(result, null, 2);
  }

  function resetStreamingState() {
    currentStreamingElement = null;
    currentStreamingText = "";
    currentStreamingThinking = "";
  }

  return { handleRPCEvent, resetStreamingState };
}
