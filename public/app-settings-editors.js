import { t } from "./i18n.js";

export function setupSettingsEditors({
  rpcCommand,
  closeSettings,
  onModelConfigurationChanged,
  clearSettingsSaveMessage,
  setSettingsSaveButtonSaving,
  showSettingsSaveError,
  showSettingsSaveSuccess,
}) {
  const apiKeysContainer = document.getElementById("settings-api-keys");

  async function loadApiKeysPanel() {
    if (!apiKeysContainer) return;
    apiKeysContainer.innerHTML = `<div class="settings-api-keys-loading">${t("settingsEditors.loadingProviders")}</div>`;
    const data = await rpcCommand({ type: "list_auth_status" });
    if (!data?.success || !Array.isArray(data.data?.providers)) {
      renderApiKeysPanelError(data?.error || t("settingsEditors.failedLoadProviders"));
      return;
    }
    renderApiKeysPanel(data.data.providers);
  }

  function renderApiKeysPanelError(message) {
    apiKeysContainer.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "settings-api-keys-empty";
    const msg = document.createElement("div");
    msg.textContent = message;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "config-editor-cancel";
    retry.textContent = t("settingsEditors.retry");
    retry.style.marginTop = "8px";
    retry.addEventListener("click", () => loadApiKeysPanel());
    wrap.appendChild(msg);
    wrap.appendChild(retry);
    apiKeysContainer.appendChild(wrap);
  }

  function renderApiKeysPanel(providers) {
    apiKeysContainer.innerHTML = "";
    if (providers.length === 0) {
      apiKeysContainer.innerHTML = `<div class="settings-api-keys-empty">${t("settingsEditors.noProvidersKnown")}</div>`;
      return;
    }
    for (const p of providers) {
      apiKeysContainer.appendChild(buildApiKeyRow(p));
    }
  }

  function buildApiKeyRow(p) {
    const row = document.createElement("div");
    row.className = "api-key-row";
    row.dataset.provider = p.provider;

    const info = document.createElement("div");
    info.className = "api-key-row-info";
    const name = document.createElement("div");
    name.className = "api-key-row-name";
    name.textContent = p.displayName || p.provider;
    const status = document.createElement("div");
    status.className = `api-key-row-status${p.configured ? " configured" : ""}`;
    status.textContent = describeAuthStatus(p);
    info.appendChild(name);
    info.appendChild(status);

    const actions = document.createElement("div");
    actions.className = "api-key-row-actions";
    const setBtn = document.createElement("button");
    setBtn.type = "button";
    setBtn.textContent = p.configured ? t("settingsEditors.update") : t("settingsEditors.setKey");
    setBtn.addEventListener("click", () => openApiKeyEditor(row, p));
    actions.appendChild(setBtn);
    if (p.configured && p.source === "stored") {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "danger";
      removeBtn.textContent = t("settingsEditors.remove");
      removeBtn.addEventListener("click", () => removeApiKey(p));
      actions.appendChild(removeBtn);
    }

    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }

  function describeAuthStatus(p) {
    if (!p.configured) return t("settingsEditors.notConfigured");
    switch (p.source) {
      case "stored":
        return t("settingsEditors.configuredStored");
      case "environment":
        return t("settingsEditors.fromEnvironment", {
          label: p.label || t("settingsEditors.envVarFallback"),
        });
      case "runtime":
        return t("settingsEditors.runtimeOverride");
      case "fallback":
        return t("settingsEditors.customProvider");
      default:
        return t("settingsEditors.configured");
    }
  }

  function openApiKeyEditor(row, p) {
    const editor = document.createElement("div");
    editor.className = "api-key-editor";

    const title = document.createElement("div");
    title.className = "api-key-row-name";
    title.textContent = t("settingsEditors.apiKeyTitle", { name: p.displayName || p.provider });
    editor.appendChild(title);

    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = t("settingsEditors.pasteApiKey");
    editor.appendChild(input);

    const err = document.createElement("div");
    err.className = "api-key-editor-error";
    err.style.display = "none";
    editor.appendChild(err);

    const actions = document.createElement("div");
    actions.className = "api-key-editor-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "config-editor-cancel";
    cancelBtn.textContent = t("common.cancel");
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-primary";
    saveBtn.textContent = t("settingsEditors.save");
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    editor.appendChild(actions);

    row.replaceWith(editor);
    requestAnimationFrame(() => input.focus());

    const cancel = () => {
      editor.replaceWith(row);
    };
    cancelBtn.addEventListener("click", cancel);

    const save = async () => {
      const key = input.value.trim();
      if (!key) {
        err.textContent = t("settingsEditors.keyEmpty");
        err.style.display = "";
        return;
      }
      saveBtn.disabled = true;
      const resp = await rpcCommand(
        { type: "set_api_key", provider: p.provider, apiKey: key },
        t("settingsEditors.savingKey", { provider: p.provider }),
      );
      if (resp?.success) {
        await onModelConfigurationChanged?.();
        loadApiKeysPanel();
      } else {
        err.textContent = resp?.error || t("settingsEditors.failedSaveKey");
        err.style.display = "";
        saveBtn.disabled = false;
      }
    };
    saveBtn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });
  }

  async function removeApiKey(p) {
    const ok = confirm(
      t("settingsEditors.removeKeyConfirm", { name: p.displayName || p.provider }),
    );
    if (!ok) return;
    const resp = await rpcCommand(
      { type: "remove_api_key", provider: p.provider },
      t("settingsEditors.removingKey", { provider: p.provider }),
    );
    if (resp?.success) {
      await onModelConfigurationChanged?.();
      loadApiKeysPanel();
    }
  }

  const btnOpenConfig = document.getElementById("btn-open-config");
  const inlineConfigPath = document.getElementById("inline-config-path");
  const inlineConfigTextarea = document.getElementById("inline-config-textarea");
  const inlineConfigError = document.getElementById("inline-config-error");
  const inlineConfigSave = document.getElementById("inline-config-save");
  const configEditorOverlay = document.getElementById("config-editor-overlay");
  const configEditorModal = document.getElementById("config-editor-modal");
  const configEditorClose = document.getElementById("config-editor-close");
  const configEditorCancel = document.getElementById("config-editor-cancel");
  const configEditorSave = document.getElementById("config-editor-save");
  const configEditorTextarea = document.getElementById("config-editor-textarea");
  const configEditorError = document.getElementById("config-editor-error");
  const configEditorPath = document.getElementById("config-editor-path");

  function openConfigEditor() {
    configEditorError.classList.add("hidden");
    configEditorTextarea.value = "";
    configEditorPath.textContent = "";
    configEditorModal.classList.remove("hidden");
    configEditorOverlay.classList.remove("hidden");

    fetch("/api/agent-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          try {
            configEditorTextarea.value = JSON.stringify(JSON.parse(data.content), null, 2);
          } catch {
            configEditorTextarea.value = data.content;
          }
          configEditorPath.textContent = data.path || "";
        } else {
          showConfigError(data.error || t("settingsEditors.failedLoadConfig"));
        }
      })
      .catch((e) => showConfigError(e.message));
  }

  function closeConfigEditor() {
    configEditorModal.classList.add("hidden");
    configEditorOverlay.classList.add("hidden");
  }

  function showConfigError(msg) {
    configEditorError.textContent = msg;
    configEditorError.classList.remove("hidden");
  }

  async function loadInlineConfigEditor() {
    if (!inlineConfigTextarea) return;
    inlineConfigError?.classList.add("hidden");
    inlineConfigTextarea.value = "";
    if (inlineConfigPath) inlineConfigPath.textContent = t("settingsEditors.loading");
    try {
      const resp = await fetch("/api/agent-config");
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || t("settingsEditors.failedLoadConfig"));
      try {
        inlineConfigTextarea.value = JSON.stringify(JSON.parse(data.content), null, 2);
      } catch {
        inlineConfigTextarea.value = data.content;
      }
      if (inlineConfigPath) inlineConfigPath.textContent = data.path || "";
    } catch (e) {
      if (inlineConfigPath) inlineConfigPath.textContent = "";
      if (inlineConfigError) {
        inlineConfigError.textContent = e.message || String(e);
        inlineConfigError.classList.remove("hidden");
      }
    }
  }

  btnOpenConfig?.addEventListener("click", () => {
    closeSettings();
    openConfigEditor();
  });

  inlineConfigSave?.addEventListener("click", async () => {
    if (!inlineConfigTextarea) return;
    clearSettingsSaveMessage(inlineConfigError);
    const content = inlineConfigTextarea.value;
    try {
      JSON.parse(content);
    } catch (e) {
      showSettingsSaveError(
        inlineConfigError,
        t("settingsEditors.invalidJson", { message: e.message }),
      );
      return;
    }
    setSettingsSaveButtonSaving(inlineConfigSave, true);
    try {
      const resp = await fetch("/api/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || t("settingsEditors.failedSaveConfig"));
      showSettingsSaveSuccess(inlineConfigError);
    } catch (e) {
      showSettingsSaveError(inlineConfigError, e.message || String(e));
    } finally {
      setSettingsSaveButtonSaving(inlineConfigSave, false);
    }
  });

  configEditorClose.addEventListener("click", closeConfigEditor);
  configEditorCancel.addEventListener("click", closeConfigEditor);
  configEditorOverlay.addEventListener("click", closeConfigEditor);

  configEditorSave.addEventListener("click", async () => {
    configEditorError.classList.add("hidden");
    const content = configEditorTextarea.value;
    try {
      JSON.parse(content);
    } catch (e) {
      showConfigError(t("settingsEditors.invalidJson", { message: e.message }));
      return;
    }
    configEditorSave.disabled = true;
    try {
      const resp = await fetch("/api/agent-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await resp.json();
      if (data.success) {
        closeConfigEditor();
      } else {
        showConfigError(data.error || t("settingsEditors.failedSaveConfig"));
      }
    } catch (e) {
      showConfigError(e.message);
    } finally {
      configEditorSave.disabled = false;
    }
  });

  const inlineModelsPath = document.getElementById("inline-models-path");
  const inlineModelsTextarea = document.getElementById("inline-models-textarea");
  const inlineModelsError = document.getElementById("inline-models-error");
  const inlineModelsSave = document.getElementById("inline-models-save");
  const inlineModelsInsertExample = document.getElementById("inline-models-insert-example");
  const modelsConfigDocsLink = document.getElementById("models-config-docs-link");

  const MODELS_JSON_EXAMPLE = `{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
`;

  function showInlineModelsError(message) {
    showSettingsSaveError(inlineModelsError, message);
  }

  function clearInlineModelsError() {
    clearSettingsSaveMessage(inlineModelsError);
  }

  async function loadInlineModelsEditor() {
    if (!inlineModelsTextarea) return;
    clearInlineModelsError();
    inlineModelsTextarea.value = "";
    if (inlineModelsPath) inlineModelsPath.textContent = t("settingsEditors.loading");
    try {
      const resp = await fetch("/api/models-config");
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || t("settingsEditors.failedLoadModels"));
      try {
        inlineModelsTextarea.value = JSON.stringify(JSON.parse(data.content), null, 2);
      } catch {
        inlineModelsTextarea.value = data.content;
      }
      if (inlineModelsPath) inlineModelsPath.textContent = data.path || "";
    } catch (e) {
      if (inlineModelsPath) inlineModelsPath.textContent = "";
      showInlineModelsError(e.message || String(e));
    }
  }

  inlineModelsSave?.addEventListener("click", async () => {
    if (!inlineModelsTextarea) return;
    clearInlineModelsError();
    const content = inlineModelsTextarea.value;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      showInlineModelsError(t("settingsEditors.invalidJson", { message: e.message }));
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      showInlineModelsError(t("settingsEditors.modelsMustBeObject"));
      return;
    }
    if (
      "providers" in parsed &&
      (typeof parsed.providers !== "object" || Array.isArray(parsed.providers))
    ) {
      showInlineModelsError(t("settingsEditors.providersMustBeObject"));
      return;
    }
    setSettingsSaveButtonSaving(inlineModelsSave, true);
    try {
      const resp = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || t("settingsEditors.failedSaveModels"));
      showSettingsSaveSuccess(inlineModelsError);
      await onModelConfigurationChanged?.();
    } catch (e) {
      showInlineModelsError(e.message || String(e));
    } finally {
      setSettingsSaveButtonSaving(inlineModelsSave, false);
    }
  });

  inlineModelsInsertExample?.addEventListener("click", () => {
    if (!inlineModelsTextarea) return;
    const current = inlineModelsTextarea.value.trim();
    if (current && current !== "{}" && current !== '{\n  "providers": {}\n}') {
      if (!confirm(t("settingsEditors.replaceExampleConfirm"))) return;
    }
    inlineModelsTextarea.value = MODELS_JSON_EXAMPLE;
    clearInlineModelsError();
  });

  modelsConfigDocsLink?.addEventListener("click", (e) => {
    e.preventDefault();
    const url =
      "https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/docs/models.md";
    fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: url }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("open failed");
      })
      .catch(() => {
        window.open(url, "_blank");
      });
  });

  return {
    loadApiKeysPanel,
    loadInlineConfigEditor,
    loadInlineModelsEditor,
  };
}
