import { getOnboardingState } from "./onboarding-state.js";
import { getPinnedModels, getRecentModels, pushRecentModel, togglePinnedModel } from "./themes.js";

/**
 * Canonical thinking levels (from RPC `get_state`).
 */
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * Clave única de un modelo. Los `id` colisionan entre proveedores
 * (`claude-opus-5` existe en `anthropic` y en `opencode-zen`, 53 colisiones
 * en total), así que todo lo que indexe modelos tiene que usar esto y no `id`.
 */
export const modelKey = (m) => `${m.provider}/${m.id}`;

/**
 * Fijados primero (todos), y recientes hasta completar `limit` filas.
 * `pinnedIds`/`recentIds` son claves `provider/id`.
 */
export function topModels(pinnedIds, recentIds, available, limit = 3) {
  const byKey = new Map(available.map((m) => [modelKey(m), m]));
  const pinned = pinnedIds.map((k) => byKey.get(k)).filter(Boolean);
  const seen = new Set(pinned.map(modelKey));
  const recent = [];
  for (const key of recentIds) {
    if (pinned.length + recent.length >= limit) break;
    if (seen.has(key)) continue;
    const m = byKey.get(key);
    if (!m) continue; // el modelo ya no está disponible: se ignora, no se rompe
    seen.add(key);
    recent.push(m);
  }
  return [...pinned, ...recent];
}

/**
 * Model picker (dropdown + search) and thinking-level dropdown.
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
  const thinkingDropdown = document.getElementById("thinking-dropdown");
  const thinkingDropdownLabel = document.getElementById("thinking-dropdown-label");
  const thinkingDropdownMenu = document.getElementById("thinking-dropdown-menu");

  let currentModelId = "";
  let currentModelProvider = "";
  let availableModels = [];
  let hasLoadedAvailableModels = false;
  let didAutoOpenEmptyModelsDropdown = false;
  let currentThinkingLevel = "off";
  let switchingModel = false;

  function formatThinkingLevelLabel(level) {
    return `Thinking: ${level || "off"}`;
  }
  function formatCompactThinkingLevelLabel(level) {
    return `Think ${level || "off"}`;
  }
  function updateThinkingBtn() {
    thinkingDropdownLabel.textContent = formatCompactThinkingLevelLabel(currentThinkingLevel);
    thinkingBtn.title = "Thinking effort controls reasoning depth.";
    thinkingBtn.setAttribute("aria-label", `Thinking effort: ${currentThinkingLevel}.`);
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
        currentModelProvider = stateData.data.model.provider || "";
        updateModelLabel();

        const model = availableModels.find((m) => modelKey(m) === currentKey());
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

  const currentKey = () => `${currentModelProvider}/${currentModelId}`;

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

    function sectionLabel(text) {
      const el = document.createElement("div");
      el.className = "model-dropdown-section";
      el.textContent = text;
      return el;
    }

    function createModelRow(m) {
      const shortName = m.id.replace(/-\d{8}$/, "");
      const key = modelKey(m);
      // El proveedor se muestra SIEMPRE (incluido anthropic): hay ids repetidos
      // entre proveedores y sin la etiqueta las filas son indistinguibles.
      const providerLabel = m.provider
        ? `<span class="model-dropdown-item-provider">${m.provider}</span>`
        : "";
      const ctxK = m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : "";
      const isPinned = getPinnedModels().includes(key);
      const el = document.createElement("div");
      el.className = `model-dropdown-item${key === currentKey() ? " active" : ""}`;
      el.innerHTML = `<span>${shortName}${providerLabel}</span><span class="model-dropdown-item-right"><span class="model-dropdown-item-result"></span><button type="button" class="model-dropdown-test" title="Probar este modelo">⚡</button><span class="model-dropdown-item-ctx">${ctxK}</span><button type="button" class="model-dropdown-pin${isPinned ? " pinned" : ""}" title="Pin model">${isPinned ? "★" : "☆"}</button></span>`;
      el.querySelector(".model-dropdown-pin").addEventListener("click", (e) => {
        e.stopPropagation();
        togglePinnedModel(key);
        renderItems(search.value);
      });
      el.querySelector(".model-dropdown-test").addEventListener("click", async (e) => {
        // Igual que el pin: sin esto, el click seleccionaría el modelo.
        e.stopPropagation();
        const btn = e.currentTarget;
        const result = el.querySelector(".model-dropdown-item-result");
        if (btn.disabled) return;
        btn.disabled = true;
        result.textContent = "…";
        result.title = "";
        try {
          // 25s > los 20s de corte de la extensión, para que gane siempre el
          // timeout de adentro, que es el que mata el proceso.
          const data = await rpcCommand(
            { type: "test_model", provider: m.provider, id: m.id },
            `Probando ${shortName}...`,
            { timeoutMs: 25000 },
          );
          const d = data?.data;
          if (data?.success && d?.ok) {
            result.textContent = `${(d.latencyMs / 1000).toFixed(1)}s · ${d.stopReason ?? "ok"}`;
            result.title = `ttft ${d.ttftMs ?? "?"}ms`;
          } else {
            const msg = d?.error || data?.error || "falló";
            result.textContent = "error";
            result.title = msg;
          }
        } finally {
          btn.disabled = false;
        }
      });
      el.addEventListener("click", async () => {
        if (switchingModel) return;
        switchingModel = true;
        closeModelDropdown();
        const display = m.id.replace(/^claude-/, "").replace(/-\d{8}$/, "");
        modelDropdownLabel.textContent = `Switching to ${display}…`;
        try {
          // Cap the queued POST at 12s; it can wait behind the active omp turn.
          const data = await rpcCommand(
            { type: "set_model", provider: m.provider, modelId: m.id },
            `Switching to ${display}...`,
            { timeoutMs: 12000 },
          );
          if (!data?.success) return;
          pushRecentModel(key);
          currentModelId = m.id;
          currentModelProvider = m.provider || "";
          if (m.contextWindow) {
            setContextWindowSize(m.contextWindow);
            updateTokenUsage();
          }
        } finally {
          switchingModel = false;
          updateModelLabel();
        }
      });
      return el;
    }

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
      if (!query) {
        const top = topModels(getPinnedModels(), getRecentModels(), availableModels);
        if (top.length) {
          itemsContainer.appendChild(sectionLabel("Pinned & recent"));
          for (const m of top) itemsContainer.appendChild(createModelRow(m));
          itemsContainer.appendChild(sectionLabel("All models"));
        }
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
        itemsContainer.appendChild(createModelRow(m));
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

  // Close dropdowns on outside click
  document.addEventListener("click", (e) => {
    if (!modelDropdown.contains(e.target)) {
      closeModelDropdown();
    }
    if (!thinkingDropdown.contains(e.target)) {
      closeThinkingDropdown();
    }
  });

  // Thinking level dropdown — one row per level, current highlighted
  function renderThinkingMenu() {
    thinkingDropdownMenu.innerHTML = "";
    THINKING_LEVELS.forEach((level) => {
      const el = document.createElement("div");
      el.className = `thinking-dropdown-item${level === currentThinkingLevel ? " active" : ""}`;
      el.textContent = level;
      el.addEventListener("click", async () => {
        if (level !== currentThinkingLevel) {
          const data = await rpcCommand(
            { type: "set_thinking_level", level },
            "Setting thinking...",
          );
          if (data?.success) {
            // set_thinking_level returns { success: true } with no payload —
            // adopt the clicked level optimistically.
            currentThinkingLevel = level;
            updateThinkingBtn();
          }
        }
        closeThinkingDropdown();
      });
      thinkingDropdownMenu.appendChild(el);
    });
  }

  function openThinkingDropdown() {
    renderThinkingMenu();
    thinkingDropdownMenu.classList.remove("hidden");
    thinkingDropdown.classList.add("open");
  }

  function closeThinkingDropdown() {
    thinkingDropdownMenu.classList.add("hidden");
    thinkingDropdown.classList.remove("open");
  }

  thinkingBtn.addEventListener("click", () => {
    if (thinkingDropdownMenu.classList.contains("hidden")) {
      openThinkingDropdown();
    } else {
      closeThinkingDropdown();
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
      updateThinkingBtn();
    },
    setCurrentModelId: (id, provider = "") => {
      currentModelId = id;
      currentModelProvider = provider;
    },
  };
}
