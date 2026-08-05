import { anchorHistoryToBottom } from "./history-scroll-anchor.js";
import { shouldPoll } from "./poll-gating.js";
import { findPortForSession, isCrossProjectSelection } from "./session-routing.js";

/**
 * Session selection, mirror-mode sync, and live-instance polling.
 *
 * `foregroundPort`, `liveInstances`, `mirrorActiveSessionFile`,
 * `viewingActiveSession`, `isMirrorMode`, `pendingSessionSwitchPath`,
 * `sessionsLoaded`, `deferredMirrorSync`, `sessionTotalCost`,
 * `lastInputTokens`, `lastUsage`, `contextWindowSize` are all read and/or
 * written from OTHER app.js sections too (rpc-events, composer, sidebar
 * wiring, Initialize sequence) — they stay owned by app.js and are threaded
 * through as getters/setters, matching the exact naming already used by
 * `setupRpcEvents`'s deps where the same variable is shared.
 */
export function setupSessionRouting({
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
  isSelectionCurrent,
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
  getForegroundPort,
  setForegroundPort,
  getLiveInstances,
  setLiveInstances,
  getMirrorActiveSessionFile,
  setMirrorActiveSessionFile,
  getViewingActiveSession,
  setViewingActiveSession,
  getIsMirrorMode,
  setIsMirrorMode,
  getPendingSessionSwitchPath,
  setPendingSessionSwitchPath,
  getSessionsLoaded,
  setDeferredMirrorSync,
  setSessionTotalCost,
  addSessionCost,
  setLastInputTokens,
  setLastUsage,
  setContextWindowSize,
  isFocused,
}) {
  async function handleSessionSelectImpl(session, project) {
    logSessionRoute("select:start", {
      selectedSession: session?.filePath,
      projectPath: project?.path,
      projectDir: project?.dirName,
      liveInstances: getLiveInstances(),
    });
    // Clicks encolados: si el usuario ya eligió otra sesión mientras esta
    // esperaba su turno, no hay nada que hacer — la última manda.
    if (!isSelectionCurrent(session?.filePath ?? null)) {
      logSessionRoute("select:superseded", { selectedSession: session?.filePath });
      return;
    }
    // An explicit session selection supersedes any pending deferred switch.
    // Leaving it set would (a) suppress all live rendering for the newly
    // selected session via the `pendingSessionSwitchPath` guard in
    // `handleRPCEvent`, and (b) yank the user to the stale deferred target on
    // the next `agent_end`. Clearing it here is what keeps tool-call/streaming
    // updates flowing after an A → B → A switch.
    if (getPendingSessionSwitchPath() && getPendingSessionSwitchPath() !== session.filePath) {
      logSessionRoute("select:clear-stale-deferred", {
        pendingSessionSwitchPath: getPendingSessionSwitchPath(),
        selectedSession: session?.filePath,
      });
      setPendingSessionSwitchPath(null);
    }
    sidebar.setActive(session.filePath);
    const workspacePathBeforeSelect = getCurrentWorkspacePath();
    const selectedProjectPath = typeof project?.path === "string" ? project.path : "";
    const liveInstances = getLiveInstances();
    const targetLiveInstance = liveInstances.find(
      (instance) => instance.sessionFile === session.filePath,
    );
    let foregroundPort = findPortForSession(liveInstances, session.filePath, getForegroundPort());
    setForegroundPort(foregroundPort);
    // Paint the pill with the selected session's project immediately, in every
    // case (live, non-live, same/cross project). No flicker from the 5s poll:
    // once the dedicated spawn/switch below registers a process with the right
    // cwd, syncWorkspaceIndicatorFromInstances() resolves the same value; while
    // the new port is not yet in liveInstances the lookup returns "" and falls
    // back to this seeded foregroundWorkspacePath.
    if (selectedProjectPath) {
      setForegroundWorkspacePath(selectedProjectPath);
      updateWorkspaceIndicator(selectedProjectPath);
    } else {
      syncWorkspaceIndicatorFromInstances();
    }
    if (session.filePath) {
      wsClient.setRoutingContext({
        workspaceId: `workspace:${project?.path || getCurrentWorkspacePath() || "unknown"}`,
        sessionId: session.filePath,
        sourcePort: foregroundPort,
      });
    }
    logSessionRoute("select:routed", {
      selectedSession: session.filePath,
      targetLiveInstance,
    });
    setSessionTotalCost(0);
    setLastInputTokens(0);
    updateCostDisplay();
    updateTokenUsage();

    // Native host: switch session via control command to the current omp instance
    if (nativeAvailable() && session.filePath) {
      const wasStreaming = state.isStreaming;
      clearMessageQueue();
      state.reset();
      if (sidebar.isStreaming(session.filePath)) {
        state.setStreaming(true);
        showTypingIndicator(true);
      } else {
        showTypingIndicator(false);
      }
      updateUI();
      await renderSelectedSessionHistory(session, project);

      if (targetLiveInstance) {
        logSessionRoute("select:target-live-sync", {
          selectedSession: session.filePath,
          targetPort: targetLiveInstance.port,
        });
        setMirrorActiveSessionFile(session.filePath);
        setViewingActiveSession(true);
        updateMirrorInputState();
        wsClient.send({ type: "mirror_sync_request" });
        if (isMobile()) {
          sidebarEl.classList.add("collapsed");
          sidebarOverlay.classList.remove("visible");
        }
        return;
      }

      const isCrossProject = isCrossProjectSelection(
        selectedProjectPath,
        workspacePathBeforeSelect,
      );

      // A dedicated process is needed for two distinct reasons: streaming (the
      // current process is busy) or a cross-project pick (in-place switch_session
      // would not re-root the process). Both spawn a process rooted in the
      // selected session's project.
      if ((wasStreaming || isCrossProject) && transport.spawnSessionProcess) {
        let targetPort = null;
        try {
          targetPort = await transport.spawnSessionProcess(
            session.filePath,
            selectedProjectPath || workspacePathBeforeSelect,
          );
        } catch (e) {
          console.error("[App] Failed to spawn session process, falling back:", e);
        }
        if (targetPort != null) {
          logSessionRoute("select:spawned-dedicated", {
            selectedSession: session.filePath,
            targetPort,
          });
          foregroundPort = targetPort;
          setForegroundPort(foregroundPort);
          portSessionMap.set(targetPort, session.filePath);
          wsClient.setRoutingContext({
            sessionId: session.filePath,
            sourcePort: foregroundPort,
          });
          syncWorkspaceIndicatorFromInstances();
          pollInstances().catch(() => {});
          wsClient.send({ type: "mirror_sync_request" });
          if (isMobile()) {
            sidebarEl.classList.add("collapsed");
            sidebarOverlay.classList.remove("visible");
          }
          return;
        }
      }

      if (wasStreaming && !isCrossProject) {
        // Fallback: defer the switch until the current agent run ends.
        // This preserves the old safe behavior when spawn is unavailable or
        // fails. Only valid same-project: deferring an in-place switch to
        // another project would reproduce the stale-cwd bug.
        setPendingSessionSwitchPath(session.filePath);
        updateUI();
        if (isMobile()) {
          sidebarEl.classList.add("collapsed");
          sidebarOverlay.classList.remove("visible");
        }
        return;
      }

      if (isCrossProject) {
        // Without a dedicated process there is no safe in-place option into
        // another project: switch_session would run B's session with tools
        // rooted in A.
        messageRenderer.renderError(
          `Failed to open session in its workspace: ${selectedProjectPath}`,
        );
        return;
      }

      try {
        logSessionRoute("select:switch-current-process", {
          selectedSession: session.filePath,
          targetPort: foregroundPort,
        });
        await transport.switchSession(session.filePath, foregroundPort);
        wsClient.send({ type: "mirror_sync_request" });
      } catch (e) {
        messageRenderer.renderError(`Failed to switch session: ${e}`);
      }
      if (isMobile()) {
        sidebarEl.classList.add("collapsed");
        sidebarOverlay.classList.remove("visible");
      }
      return;
    }

    await switchSession(session.filePath, session, project);

    // Close sidebar on mobile after selecting
    if (isMobile()) {
      sidebarEl.classList.add("collapsed");
      sidebarOverlay.classList.remove("visible");
    }
  }

  async function renderSelectedSessionHistory(session, project) {
    messageRenderer.clear();
    toolCardRenderer.clear();
    if (!session || !project) {
      renderWorkspaceWelcome();
      return;
    }

    messageRenderer.renderSystemMessage("Loading session…");
    const dirName = project?.dirName;
    const file = session.file;
    if (!dirName || !file) {
      logSessionRoute("history:skip-missing-path", {
        selectedSession: session?.filePath,
        dirName,
        file,
      });
      return;
    }

    try {
      const url = `/api/sessions/${dirName}/${file}`;
      logSessionRoute("history:fetch", {
        url,
        selectedSession: session.filePath,
        dirName,
        file,
      });
      const res = await fetch(url);
      logSessionRoute("history:fetch-result", {
        url,
        status: res.status,
        ok: res.ok,
      });
      const data = await res.json();
      // Una selección más nueva ya pasó por el sidebar mientras esta fetch
      // estaba en vuelo: no pintes un hilo que el usuario ya dejó atrás.
      if (!isSelectionCurrent(session.filePath)) {
        logSessionRoute("history:stale-skip", { selectedSession: session.filePath });
        return;
      }
      messageRenderer.clear();
      logSessionRoute("history:render", {
        selectedSession: session.filePath,
        entries: data.entries?.length || 0,
      });
      renderSessionHistory(data.entries || [], { searchQuery: sidebar.searchQuery });
    } catch (e) {
      console.error("[Session route] history:fetch-error", {
        selectedSession: session?.filePath,
        error: e,
      });
      messageRenderer.renderError(`Failed to load session: ${e}`);
    }
  }

  async function switchSession(sessionFile, session = null, project = null) {
    try {
      state.reset();
      messageRenderer.clear();
      toolCardRenderer.clear();

      if (sessionFile && session) {
        messageRenderer.renderSystemMessage("Loading session...");

        const dirName = project?.dirName;
        const file = session.file;
        console.log("[App] Loading history:", { dirName, file, sessionFile });

        if (dirName && file) {
          try {
            const res = await fetch(`/api/sessions/${dirName}/${file}`);
            console.log("[App] History fetch status:", res.status);
            const data = await res.json();
            console.log("[App] History entries:", data.entries?.length || 0);

            // Misma carrera que en renderSelectedSessionHistory.
            if (!isSelectionCurrent(sessionFile)) return;

            messageRenderer.clear();
            renderSessionHistory(data.entries || [], { searchQuery: sidebar.searchQuery });
          } catch (e) {
            console.error("[App] History fetch error:", e);
          }
        } else {
          console.log("[App] Skipped history load: dirName or file missing");
        }
      } else {
        renderWorkspaceWelcome();
      }

      // In mirror mode, check if this session is live on any instance
      if (getIsMirrorMode()) {
        const liveInstance = getLiveInstances().find((i) => i.sessionFile === sessionFile);
        if (liveInstance) {
          setForegroundPort(liveInstance.port);
          syncWorkspaceIndicatorFromInstances();
          setMirrorActiveSessionFile(sessionFile);
          setViewingActiveSession(true);
          wsClient.setRoutingContext({
            workspaceId: `workspace:${liveInstance.cwd || getCurrentWorkspacePath() || "unknown"}`,
            sessionId: sessionFile,
            sourcePort: getForegroundPort(),
          });
          updateMirrorInputState();
          wsClient.send({ type: "mirror_sync_request" });
          return;
        }

        // Check if this is the active session on the current instance
        setViewingActiveSession(sessionFile === getMirrorActiveSessionFile());
        updateMirrorInputState();

        if (getViewingActiveSession()) {
          // Re-request live state from the extension
          wsClient.send({ type: "mirror_sync_request" });
        }
      } else {
        const res = await fetch("/api/sessions/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionFile }),
        });

        if (!res.ok) {
          const err = await res.json();
          messageRenderer.renderError(`Failed to switch session: ${err.error}`);
        }
      }
    } catch (error) {
      console.error("[App] Failed to switch session:", error);
      messageRenderer.renderError("Failed to switch session");
    }
  }

  // ═══════════════════════════════════════
  // Mirror mode sync
  // ═══════════════════════════════════════

  function handleMirrorSync(data) {
    logSessionRoute("mirrorSync:received", {
      sessionFile: data.sessionFile,
      sessionId: data.sessionId,
      workspaceId: data.workspaceId,
      entries: data.entries?.length || 0,
      isStreaming: data.isStreaming,
    });
    if (!getSessionsLoaded()) {
      setDeferredMirrorSync(data);
      return;
    }

    // The broker broadcasts every upstream's `mirror_sync` to all UI clients,
    // including snapshots a *background* omp process emits on its own
    // `session_start` (e.g. the previously-running session that keeps streaming
    // after the user switched to an older session). Such a stray snapshot must
    // NOT hijack the foreground UI: applying it would clobber the rendered
    // history AND — critically — reset the routing context to the background
    // process's session/port, causing the user's next message to be sent into
    // that previous session instead of the one they're now viewing.
    const foregroundPort = getForegroundPort();
    const syncPort = typeof data.port === "number" ? data.port : null;
    if (syncPort !== null && typeof foregroundPort === "number" && syncPort !== foregroundPort) {
      logSessionRoute("mirrorSync:ignored-background", {
        syncPort,
        foregroundPort,
        sessionFile: data.sessionFile,
      });
      const bgFile = data.sessionFile || data.sessionId;
      if (bgFile) {
        const bgStreaming = Boolean(data.isStreaming);
        sidebar.setStreaming(bgFile, bgStreaming);
        updateMirrorLiveIndicator();
      }
      return;
    }

    console.log("[Mirror] Received state snapshot:", data.entries?.length, "entries");
    setIsMirrorMode(true);

    // Track the active session
    setMirrorActiveSessionFile(data.sessionFile || null);
    if (data.sessionFile) portSessionMap.set(foregroundPort, data.sessionFile);
    const syncWorkspacePath = workspacePathFromId(data.workspaceId);
    if (syncWorkspacePath) {
      setForegroundWorkspacePath(syncWorkspacePath);
      updateWorkspaceIndicator(syncWorkspacePath);
    }
    wsClient.setRoutingContext({
      workspaceId: data.workspaceId || `workspace:${getCurrentWorkspacePath() || "unknown"}`,
      sessionId: data.sessionId || data.sessionFile || null,
      sourcePort: data.port || foregroundPort,
    });
    setViewingActiveSession(true);
    // The snapshot's `isStreaming` comes from the omp process's instantaneous
    // `!ctx.isIdle()`, which can momentarily read false between messages / tool
    // calls of an agent run that is still actively going. The sidebar's
    // streaming set is driven by real `agent_start` / `agent_end` events and is
    // the more reliable signal for a background session we're switching into, so
    // OR the two: only treat the session as idle when both agree it is idle.
    const liveFile = data.sessionFile || getMirrorActiveSessionFile();
    const sidebarStreaming = liveFile ? sidebar.isStreaming(liveFile) : false;
    const isStreaming = Boolean(data.isStreaming) || sidebarStreaming;
    state.setStreaming(isStreaming);
    showTypingIndicator(isStreaming);
    if (liveFile) sidebar.setStreaming(liveFile, isStreaming);
    updateMirrorInputState();
    updateMirrorLiveIndicator();
    updateUI();

    // Update model display
    if (data.model) {
      setCurrentModelId(data.model.id || "", data.model.provider || "");
      updateModelLabel();
      if (data.model.contextWindow) {
        setContextWindowSize(data.model.contextWindow);
      }
    }

    // Update thinking level
    if (data.thinkingLevel) {
      setCurrentThinkingLevel(data.thinkingLevel);
      updateThinkingBtn();
    }

    // Clear and render message history
    messageRenderer.clear();
    setSessionTotalCost(0);
    setLastInputTokens(0);

    // Keep Welcome stable when there are already sessions in the sidebar and
    // the user has not explicitly selected one yet.
    if (!sidebar.activeSessionFile && hasAnySessionsLoaded()) {
      renderWorkspaceWelcome();
      updateCostDisplay();
      updateTokenUsage();
      return;
    }

    if (data.entries && data.entries.length > 0) {
      renderSessionHistory(data.entries, { searchQuery: sidebar.searchQuery });
    } else {
      renderWorkspaceWelcome();
    }

    updateCostDisplay();
    updateTokenUsage();
  }

  // Mark sessions in the sidebar with a green dot only when actively streaming
  function updateMirrorLiveIndicator() {
    document.querySelectorAll(".session-item").forEach((el) => {
      el.classList.toggle("mirror-live", sidebar.streamingFiles.has(el.dataset.filePath));
    });
  }

  // Poll for running instances to mark all live sessions
  async function pollInstances() {
    try {
      const res = await fetch("/api/instances");
      if (res.ok) {
        const data = await res.json();
        const liveInstances = data.instances || [];
        setLiveInstances(liveInstances);
        logSessionRoute("instances:poll", {
          count: liveInstances.length,
          instances: liveInstances,
        });
        updateMirrorLiveIndicator();
        syncWorkspaceIndicatorFromInstances();
        if (document.querySelector(".welcome")) {
          renderWorkspaceWelcome();
        }
      }
    } catch {}
  }

  let lastInstancesPollAt = 0;
  function maybePollInstances() {
    const now = Date.now();
    if (!shouldPoll(isFocused(), now - lastInstancesPollAt)) return;
    lastInstancesPollAt = now;
    pollInstances();
  }
  // Poll every 5 seconds while focused, every 30 seconds while unfocused
  // (see poll-gating.js) — the ticker itself always runs at 5s, the gate
  // decides whether this tick actually hits the network.
  setInterval(maybePollInstances, 5000);
  maybePollInstances();

  // Enable/disable input based on whether we're viewing the live session
  function updateMirrorInputState() {
    if (!getIsMirrorMode()) return;

    const inputArea = document.querySelector(".input-area");
    if (getViewingActiveSession()) {
      messageInput.disabled = false;
      messageInput.placeholder = "Message...";
      inputArea?.classList.remove("mirror-readonly");
    } else {
      messageInput.disabled = true;
      messageInput.placeholder = "Viewing historical session (read-only)";
      inputArea?.classList.add("mirror-readonly");
    }
  }

  // ═══════════════════════════════════════
  // Session history rendering
  // ═══════════════════════════════════════

  function renderSessionHistory(entries, { searchQuery = "" } = {}) {
    console.log(`[History] Rendering ${entries.length} entries`);
    let userCount = 0,
      assistantCount = 0,
      toolCardCount = 0,
      toolResultCount = 0;

    for (const entry of entries) {
      if (entry.type !== "message") continue;

      const msg = entry.message;
      if (!msg) continue;

      if (msg.role === "user") {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : (msg.content || [])
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("\n");
        // Extract images from content blocks
        const images = Array.isArray(msg.content)
          ? msg.content
              .filter((b) => b.type === "image")
              .map((b) => ({
                data: b.source?.data || b.data || "",
                mimeType: b.source?.media_type || b.media_type || "image/png",
              }))
          : [];
        if (content || images.length > 0) {
          userCount++;
          messageRenderer.renderUserMessage(
            { content: content || "", images: images.length > 0 ? images : undefined },
            true,
          );
        }
      } else if (msg.role === "assistant") {
        const textBlocks = (msg.content || []).filter((b) => b.type === "text");
        const thinkingBlocks = (msg.content || []).filter((b) => b.type === "thinking");
        const toolCalls = (msg.content || []).filter((b) => b.type === "toolCall");

        // Build content blocks for rendering
        const contentBlocks = [];
        for (const block of msg.content || []) {
          if (block.type === "text" || block.type === "thinking") {
            contentBlocks.push(block);
          }
        }

        const text = textBlocks.map((b) => b.text).join("\n");

        if (text || thinkingBlocks.length > 0) {
          assistantCount++;
          messageRenderer.renderAssistantMessage(
            {
              content: contentBlocks.length > 0 ? contentBlocks : text,
              usage: msg.usage,
            },
            false,
            true,
          );

          // Track cost and tokens from history
          if (msg.usage?.cost?.total) {
            addSessionCost(msg.usage.cost.total);
          }
          if (msg.usage?.input) {
            setLastInputTokens(msg.usage.input + (msg.usage.cacheRead || 0));
            setLastUsage(msg.usage);
          }
        }

        // Show tool calls as compact history cards
        for (const tc of toolCalls) {
          toolCardCount++;
          const card = toolCardRenderer.createHistoryCard({
            toolCallId: tc.id,
            toolName: tc.name,
            args: tc.arguments || {},
          });
          console.log(
            `[History] Tool card created: ${tc.name}`,
            card?.offsetHeight,
            card?.innerHTML?.substring(0, 100),
          );
        }
      } else if (msg.role === "toolResult") {
        toolResultCount++;
        toolCardRenderer.addHistoryResult(
          msg.toolCallId,
          { content: msg.content || [] },
          msg.isError,
        );
      }
    }

    console.log(
      `[History] Done: ${userCount} users, ${assistantCount} assistants, ${toolCardCount} tools, ${toolResultCount} results`,
    );
    console.log(`[History] DOM tool-card count:`, document.querySelectorAll(".tool-card").length);
    console.log(
      `[History] DOM thinking-block count:`,
      document.querySelectorAll(".thinking-block").length,
    );

    if (searchQuery) {
      messageRenderer.highlightSearchQuery(searchQuery);
    }

    updateCostDisplay();
    updateTokenUsage();
    fetchContextWindow();

    anchorHistoryToBottom(document.getElementById("messages"), {
      preserveScrollTarget: Boolean(searchQuery),
    });
  }

  return {
    handleSessionSelectImpl,
    handleMirrorSync,
    updateMirrorLiveIndicator,
    pollInstances,
    updateMirrorInputState,
  };
}
