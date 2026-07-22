import { getOnboardingState } from "./onboarding-state.js";

/**
 * Model picker (dropdown + search) and thinking-level cycle button.
 *
 * Owns `currentModelId`, `currentThinkingLevel`, and the list of
 * `availableModels` because it's the only writer during normal
 * interaction (dropdown click, thinking-btn cycle, `fetchModelInfo`
 * refresh). Mirror-mode session sync (still in app.js today) reaches
 * in via the returned setters when it receives a state snapshot from
 * another window, and the settings panel reads/writes the thinking
 * level via the same setter it already uses.
 *
 * `openConfigurationSettings` is passed in as a callback so the empty-
 * state CTA in the model dropdown can jump the user to Settings →
 * Configuration without this module knowing about the settings panel.
 */
export function setupModelPicker({
  settingsPanel,
  composerCard,
  messageInput,
  rpcCommand,
  updateUI,
  updateTokenUsage,
  setContextWindowSize,
  hasAnySessionsLoaded,
  getCurrentWorkspacePath,
  openConfigurationSettings,
}) {
  const modelDropdown = document.getElementById("model-dropdown");
  const modelDropdownBtn = document.getElementById("model-dropdown-btn");
  const modelDropdownLabel = document.getElementById("model-dropdown-label");
  const modelDropdownMenu = document.getElementById("model-dropdown-menu");
  const thinkingBtn = document.getElementById("thinking-btn");

  let currentModelId = "";
  let availableModels = [];
  let hasLoadedAvailableModels = false;
  let didAutoOpenEmptyModelsDropdown = false;
  let currentThinkingLevel = "off";

  function formatThinkingLevelLabel(level) {
    return `Thinking: ${level || "off"}`;
  }
  function formatCompactThinkingLevelLabel(level) {
    return `Think ${level || "off"}`;
  }
  function updateThinkingBtn() {
    thinkingBtn.textContent = formatCompactThinkingLevelLabel(currentThinkingLevel);
    thinkingBtn.title = "Thinking effort controls reasoning depth. Click to cycle.";
    thinkingBtn.setAttribute(
      "aria-label",
      `Thinking effort: ${currentThinkingLevel}. Click to cycle reasoning depth.`,
    );
    thinkingBtn.classList.toggle("off", currentThinkingLevel === "off");
  }

  function currentOnboardingState() {
    return getOnboardingState({
      hasSessions: hasAnySessionsLoaded(),
      workspacePath: getCurrentWorkspacePath(),
      availableModels,
    });
  }

  function updateOnboardingUI() {
    const onboarding = currentOnboardingState();
    const needsSetup = !onboarding.canQuery;
    composerCard.classList.toggle("onboarding-disabled", needsSetup);
    if (needsSetup) {
      messageInput.placeholder = onboarding.message;
    }
    return onboarding;
  }

  async function fetchModelInfo() {
    try {
      const [modelsResp, stateResp] = await Promise.all([
        fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "get_available_models" }),
        }),
        fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "get_state" }),
        }),
      ]);
      const modelsData = await modelsResp.json();
      const stateData = await stateResp.json();

      if (modelsData.success && Array.isArray(modelsData.data?.models)) {
        availableModels = modelsData.data.models;
        hasLoadedAvailableModels = true;
        if (availableModels.length > 0) {
          didAutoOpenEmptyModelsDropdown = false;
        }
      }
      if (stateData.success && stateData.data?.model) {
        currentModelId = stateData.data.model.id || "";
        updateModelLabel();

        const model = availableModels.find((m) => m.id === currentModelId);
        if (model?.contextWindow) {
          setContextWindowSize(model.contextWindow);
          updateTokenUsage();
        }
      }
      if (stateData.success && stateData.data?.thinkingLevel) {
        currentThinkingLevel = stateData.data.thinkingLevel;
        updateThinkingBtn();
      }
    } catch (_e) {
      // ignore
    } finally {
      updateModelLabel();
      updateUI();
      maybeAutoOpenEmptyModelsDropdown();
    }
  }

  function maybeAutoOpenEmptyModelsDropdown() {
    if (
      hasLoadedAvailableModels &&
      availableModels.length === 0 &&
      !didAutoOpenEmptyModelsDropdown &&
      modelDropdownMenu.classList.contains("hidden") &&
      settingsPanel.classList.contains("hidden")
    ) {
      didAutoOpenEmptyModelsDropdown = true;
      openModelDropdown();
    }
  }

  function updateModelLabel() {
    const shortName = currentModelId.replace(/^claude-/, "").replace(/-\d{8}$/, "");
    modelDropdownLabel.textContent = shortName || "model";
  }

  function toggleModelDropdown() {
    const isOpen = !modelDropdownMenu.classList.contains("hidden");
    if (isOpen) {
      closeModelDropdown();
    } else {
      openModelDropdown();
    }
  }

  function openModelDropdown() {
    modelDropdownMenu.innerHTML = "";

    // Search input
    const search = document.createElement("input");
    search.className = "model-dropdown-search";
    search.placeholder = "Search models…";
    search.type = "text";
    modelDropdownMenu.appendChild(search);

    // Items container
    const itemsContainer = document.createElement("div");
    itemsContainer.className = "model-dropdown-items";
    modelDropdownMenu.appendChild(itemsContainer);

    function renderItems(filter) {
      itemsContainer.innerHTML = "";
      const query = (filter || "").toLowerCase();
      // Empty-state: no API keys configured anywhere. Surface this loudly
      // instead of leaving the dropdown blank — empty dropdowns look like
      // a hung load, not a setup problem.
      if (availableModels.length === 0) {
        const empty = document.createElement("div");
        empty.className = "model-dropdown-empty";
        empty.innerHTML = `
          <div style="padding:14px;color:var(--text-dim);font-size:12px;line-height:1.5">
            <div style="color:var(--text-primary);margin-bottom:6px">No models available</div>
            <div>No API keys configured. Set a key in Settings &rarr; Configuration.</div>
            <button type="button" class="btn-primary" style="margin-top:10px">Open Settings</button>
          </div>`;
        empty.querySelector("button").addEventListener("click", () => {
          closeModelDropdown();
          openConfigurationSettings().catch(() => {});
        });
        itemsContainer.appendChild(empty);
        return;
      }
      availableModels.forEach((m) => {
        const shortName = m.id.replace(/-\d{8}$/, "");
        const providerStr = m.provider || "";
        if (
          query &&
          !shortName.toLowerCase().includes(query) &&
          !providerStr.toLowerCase().includes(query)
        )
          return;

        const el = document.createElement("div");
        el.className = `model-dropdown-item${m.id === currentModelId ? " active" : ""}`;
        const ctxK = m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : "";
        const providerLabel =
          m.provider && m.provider !== "anthropic"
            ? `<span class="model-dropdown-item-provider">${m.provider}</span>`
            : "";
        el.innerHTML = `<span>${shortName}${providerLabel}</span><span class="model-dropdown-item-ctx">${ctxK}</span>`;
        el.addEventListener("click", async () => {
          closeModelDropdown();
          const display = m.id.replace(/^claude-/, "").replace(/-\d{8}$/, "");
          await rpcCommand(
            { type: "set_model", provider: m.provider, modelId: m.id },
            `Switching to ${display}...`,
          );
          currentModelId = m.id;
          updateModelLabel();
          if (m.contextWindow) {
            setContextWindowSize(m.contextWindow);
            updateTokenUsage();
          }
        });
        itemsContainer.appendChild(el);
      });
    }

    renderItems("");

    search.addEventListener("input", () => renderItems(search.value));
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModelDropdown();
        e.stopPropagation();
      }
      if (e.key === "Enter") {
        const first = itemsContainer.querySelector(".model-dropdown-item");
        if (first) first.click();
      }
    });

    modelDropdownMenu.classList.remove("hidden");
    modelDropdown.classList.add("open");
    requestAnimationFrame(() => search.focus());
  }

  function closeModelDropdown() {
    modelDropdownMenu.classList.add("hidden");
    modelDropdown.classList.remove("open");
  }

  modelDropdownBtn.addEventListener("click", toggleModelDropdown);

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!modelDropdown.contains(e.target)) {
      closeModelDropdown();
    }
  });

  // Thinking level button — cycles through levels
  thinkingBtn.addEventListener("click", async () => {
    const data = await rpcCommand({ type: "cycle_thinking_level" }, "Cycling thinking...");
    if (data?.success && data.data?.level) {
      currentThinkingLevel = data.data.level;
      updateThinkingBtn();
    }
  });

  return {
    modelDropdownMenu,
    closeModelDropdown,
    fetchModelInfo,
    formatThinkingLevelLabel,
    updateThinkingBtn,
    updateModelLabel,
    updateOnboardingUI,
    currentOnboardingState,
    getCurrentThinkingLevel: () => currentThinkingLevel,
    setCurrentThinkingLevel: (level) => {
      currentThinkingLevel = level;
    },
    setCurrentModelId: (id) => {
      currentModelId = id;
    },
  };
}
