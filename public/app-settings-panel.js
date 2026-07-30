import { createOmpUpdater } from "./app-omp-updater.js";
import { setupSettingsEditors } from "./app-settings-editors.js";
import { setupSettingsToggles } from "./app-settings-toggles.js";
import { createAppUpdater } from "./app-updater.js";
import {
  clearSettingsSaveMessage,
  setSettingsSaveButtonSaving,
  showSettingsSaveError,
  showSettingsSaveSuccess,
} from "./settings-save-status.js";
import {
  applyAccentOverride,
  applyDensity,
  applyFontSize,
  applyMotion,
  applySidebarWidth,
  applyTheme,
  applyTypingFx,
  clearAccentOverride,
  getAccentOverride,
  getCurrentTheme,
  getDensity,
  getFontSize,
  getMotion,
  getSidebarWidth,
  getTypingFx,
  getVoiceLocale,
  setVoiceLocale,
  themes,
} from "./themes.js";

/**
 * Settings panel — open/close/tab select, theme grid builder, the
 * auto-updater hookup, and the wiring of setupSettingsToggles /
 * setupSettingsEditors.
 *
 * `settingsPanel` is owned by app.js because other sections (keyboard
 * shortcuts, model picker) also check its visibility. The thinking level
 * is owned by the model-picker section, so it's threaded through as
 * getter/setter. Returns `initUpdaterUI`/`initOmpUpdaterUI` so app.js can
 * re-init the updater UIs when broker capabilities arrive.
 */
export function setupSettingsPanel({
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
}) {
  const settingsBtn = document.getElementById("settings-btn");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsClose = document.getElementById("settings-close");
  const settingsNavItems = Array.from(document.querySelectorAll(".settings-nav-item"));
  const settingsTabs = Array.from(document.querySelectorAll(".settings-tab"));
  const themeGrid = document.getElementById("theme-grid");

  const toggleAutoCompact = document.getElementById("toggle-auto-compact");
  const btnThinkingLevel = document.getElementById("btn-thinking-level");
  const toggleShowThinking = document.getElementById("toggle-show-thinking");
  const toggleAuth = document.getElementById("toggle-auth");
  const authSection = document.getElementById("settings-auth-section");
  const piVersionValue = document.getElementById("setting-omp-version-value");
  let piVersionCache = null;
  let piVersionInflight = null;
  let loadInlineConfigEditor = async () => {};
  let loadInlineModelsEditor = async () => {};
  let loadApiKeysPanel = async () => {};

  function selectSettingsTab(tabKey = "general") {
    const targetTabKey = tabKey === "auth" ? "configuration" : tabKey;
    settingsNavItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.settingsTab === targetTabKey);
    });
    settingsTabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.settingsPanel === targetTabKey);
    });
    if (targetTabKey === "configuration") {
      loadApiKeysPanel();
      loadInlineConfigEditor();
      loadInlineModelsEditor();
    }
    if (targetTabKey === "extensions") {
      loadBrowsePackages();
    }
  }

  function formatOMPVersionError(err, fallback = "unknown error") {
    const raw = String(err?.message || err?.error || err || fallback).trim();
    if (!raw) return fallback;
    return raw.length > 56 ? `${raw.slice(0, 56)}...` : raw;
  }

  async function loadOMPVersion() {
    if (!piVersionValue) return;
    if (piVersionCache) {
      piVersionValue.textContent = piVersionCache;
      return;
    }
    if (piVersionInflight) {
      return;
    }
    piVersionInflight = (async () => {
      try {
        if (nativeAvailable()) {
          const version = await transport.getOMPVersion();
          if (version) {
            piVersionCache = version;
            piVersionValue.textContent = piVersionCache;
          } else {
            piVersionValue.textContent = "Unavailable (empty version)";
          }
        } else {
          const data = await rpcCommand({ type: "get_omp_version" });
          if (data?.success && data.data?.version) {
            piVersionCache = data.data.version;
            piVersionValue.textContent = piVersionCache;
          } else {
            const reason = formatOMPVersionError(data?.error, "version missing in response");
            console.error("[settings] failed to load omp version:", data);
            piVersionValue.textContent = `Unavailable (${reason})`;
          }
        }
      } catch (err) {
        const reason = formatOMPVersionError(err);
        console.error("[settings] failed to load omp version:", err);
        piVersionValue.textContent = `Unavailable (${reason})`;
      } finally {
        piVersionInflight = null;
      }
    })();
  }

  const sidebarUpdateBtn = document.getElementById("sidebar-update-btn");
  const updater = createAppUpdater({
    transport,
    appVersionValue: document.getElementById("setting-app-version-value"),
    updaterSection: document.getElementById("setting-updater-section"),
    checkUpdatesBtn: document.getElementById("btn-check-updates"),
    updateStatusRow: document.getElementById("setting-update-status-row"),
    updateStatusEl: document.getElementById("setting-update-status"),
    updateInstallRow: document.getElementById("setting-update-install-row"),
    updateInstallLabel: document.getElementById("setting-update-install-label"),
    installUpdateBtn: document.getElementById("btn-install-update"),
    sidebarUpdateBtn,
    onOpenSettings: async () => {
      await openSettings();
      selectSettingsTab("general");
    },
  });
  void updater.initUpdaterUI();
  const ompUpdater = createOmpUpdater({
    transport,
    checkBtn: document.getElementById("btn-omp-update"),
    statusRow: document.getElementById("setting-omp-update-status-row"),
    statusEl: document.getElementById("setting-omp-update-status"),
    sidebarPill: document.getElementById("sidebar-omp-update-btn"),
    onOpenSettings: async () => {
      await openSettings();
      selectSettingsTab("general");
      document.getElementById("btn-omp-update")?.focus();
    },
  });
  void ompUpdater.initOmpUpdaterUI();

  function buildThemeGrid() {
    themeGrid.innerHTML = "";
    const current = getCurrentTheme();

    for (const [id, theme] of Object.entries(themes)) {
      const btn = document.createElement("button");
      btn.className = `theme-swatch${current === id ? " active" : ""}`;
      const dots = (theme.colors || [])
        .map((c) => `<span class="swatch-dot" style="background:${c}"></span>`)
        .join("");
      btn.innerHTML = `<span class="swatch-colors">${dots}</span>`;
      btn.addEventListener("click", () => {
        applyTheme(id);
        themeGrid.querySelectorAll(".theme-swatch").forEach((s) => {
          s.classList.remove("active");
        });
        btn.classList.add("active");
      });
      themeGrid.appendChild(btn);
    }
  }

  function setupAppearanceControls() {
    const accentInput = document.getElementById("setting-accent-color");
    const accentReset = document.getElementById("setting-accent-reset");
    const fontGroup = document.getElementById("setting-font-size");
    const densityToggle = document.getElementById("setting-density-toggle");
    const sidebarSlider = document.getElementById("setting-sidebar-width");
    const motionGroup = document.getElementById("setting-motion");
    const voiceLocale = document.getElementById("setting-voice-locale");

    function markActive(group, value, attr) {
      for (const btn of group.querySelectorAll("button")) {
        btn.classList.toggle("active", btn.dataset[attr] === value);
      }
    }

    // Accent — reflect persisted value, apply on input.
    const accent = getAccentOverride();
    if (accent) accentInput.value = accent;
    accentInput.addEventListener("input", () => applyAccentOverride(accentInput.value));
    accentReset.addEventListener("click", () => clearAccentOverride());

    // Font size — 3 buttons, default medium when unset.
    markActive(fontGroup, getFontSize() || "medium", "fontSize");
    fontGroup.addEventListener("click", (e) => {
      const size = e.target.dataset?.fontSize;
      if (!size) return;
      applyFontSize(size);
      markActive(fontGroup, size, "fontSize");
    });

    // Density — toggle (on = compact).
    const setDensityToggle = () => {
      densityToggle.className = `settings-toggle${getDensity() === "compact" ? " on" : ""}`;
    };
    setDensityToggle();
    densityToggle.addEventListener("click", () => {
      applyDensity(getDensity() === "compact" ? "comfortable" : "compact");
      setDensityToggle();
    });

    // Efectos de tipeo — tres toggles sobre una sola preferencia multi-token.
    const typingFxToggles = [
      ["caret", document.getElementById("setting-typing-fx-caret")],
      ["tail", document.getElementById("setting-typing-fx-tail")],
      ["trail", document.getElementById("setting-typing-fx-trail")],
    ];
    const paintTypingFx = () => {
      const on = getTypingFx();
      for (const [token, btn] of typingFxToggles) {
        btn.className = `settings-toggle${on.includes(token) ? " on" : ""}`;
      }
    };
    paintTypingFx();
    for (const [token, btn] of typingFxToggles) {
      btn.addEventListener("click", () => {
        const on = getTypingFx();
        applyTypingFx(on.includes(token) ? on.filter((t) => t !== token) : [...on, token]);
        paintTypingFx();
      });
    }

    // Sidebar width — slider, default 272 when unset.
    sidebarSlider.value = String(getSidebarWidth() ?? 272);
    sidebarSlider.addEventListener("input", () => applySidebarWidth(sidebarSlider.value));

    // Motion — 3 buttons, default auto when unset.
    markActive(motionGroup, getMotion() || "auto", "motion");
    motionGroup.addEventListener("click", (e) => {
      const mode = e.target.dataset?.motion;
      if (!mode) return;
      applyMotion(mode);
      markActive(motionGroup, mode, "motion");
    });

    // Voice input locale — cross-port cookie override.
    voiceLocale.value = getVoiceLocale() || "";
    voiceLocale.addEventListener("change", () => setVoiceLocale(voiceLocale.value));
  }
  setupAppearanceControls();

  async function openSettings() {
    settingsPanel.classList.remove("hidden");
    messagesContainer.style.display = "none";
    document.querySelector(".input-area").style.display = "none";
    document.querySelector(".mode-link:first-child")?.classList.remove("active");
    selectSettingsTab("general");
    buildThemeGrid();
    if (piVersionValue) {
      piVersionValue.textContent = piVersionCache || "Loading...";
    }
    setTimeout(() => {
      if (!settingsPanel.classList.contains("hidden")) loadOMPVersion();
    }, 300);
    void refreshLanUrl();
    // Fetch current state for toggles
    try {
      const resp = await fetch("/api/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "get_state" }),
      });
      const data = await resp.json();
      if (data.success && data.data) {
        const s = data.data;
        // Auto-compaction toggle
        toggleAutoCompact.className = `settings-toggle${s.autoCompactionEnabled ? " on" : ""}`;
        // Thinking level
        btnThinkingLevel.textContent = formatThinkingLevelLabel(s.thinkingLevel);
        setCurrentThinkingLevel(s.thinkingLevel || "off");
        updateThinkingBtn();
        // Session name
        inputSessionName.value = s.sessionName || "";
      }
    } catch (_e) {
      // Silent
    }

    // Fetch auth state
    try {
      const authData = await rpcCommand({ type: "get_auth" });
      if (authData?.success && authData.data?.configured) {
        authSection.style.display = "";
        toggleAuth.className = `settings-toggle${authData.data.enabled ? " on" : ""}`;
      } else {
        authSection.style.display = "none";
      }
    } catch {
      authSection.style.display = "none";
    }
  }

  function closeSettings() {
    settingsPanel.classList.add("hidden");
    messagesContainer.style.display = "";
    document.querySelector(".input-area").style.display = "";
    document.querySelector(".mode-link:first-child")?.classList.add("active");
  }

  async function openUpdatesFromSidebar() {
    await updater.openUpdatesFromSidebar();
  }

  settingsBtn.addEventListener("click", openSettings);
  sidebarUpdateBtn?.addEventListener("click", () => {
    openUpdatesFromSidebar().catch((err) => {
      console.warn("[updater] unable to open updates from sidebar:", err);
    });
  });
  settingsClose.addEventListener("click", closeSettings);
  settingsOverlay?.addEventListener("click", closeSettings);
  settingsNavItems.forEach((item) => {
    item.addEventListener("click", () => {
      selectSettingsTab(item.dataset.settingsTab || "general");
    });
  });

  setupSettingsToggles({
    toggleAutoCompact,
    btnThinkingLevel,
    toggleShowThinking,
    toggleAuth,
    rpcCommand,
    getCurrentThinkingLevel,
    setCurrentThinkingLevel,
    updateThinkingBtn,
  });

  ({ loadApiKeysPanel, loadInlineConfigEditor, loadInlineModelsEditor } = setupSettingsEditors({
    rpcCommand,
    closeSettings,
    onModelConfigurationChanged: async () => {
      await fetchModelInfo();
      updateUI();
    },
    clearSettingsSaveMessage,
    setSettingsSaveButtonSaving,
    showSettingsSaveError,
    showSettingsSaveSuccess,
  }));

  // Restore saved theme
  const savedTheme = getCurrentTheme();
  applyTheme(savedTheme);

  return {
    openSettings,
    closeSettings,
    selectSettingsTab,
    initUpdaterUI: () => updater.initUpdaterUI(),
    initOmpUpdaterUI: () => ompUpdater.initOmpUpdaterUI(),
  };
}
