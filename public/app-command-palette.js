import { t } from "./i18n.js";

/**
 * Command palette (⌘K) — the floating list of session-scoped commands
 * (Compact / Export HTML / Session Stats / Expand-all / Collapse-all)
 * plus the two RPC helpers everything else in app.js reuses:
 * `rpcCommand` and `rpcExportHtml`.
 *
 * `rpcCommand` is the shared "fire a JSON RPC + update the status pill"
 * helper — the model picker, thinking-level cycle, session switch, and
 * settings panel all call it, so it's returned here for app.js to
 * thread on to other setup calls.
 *
 * `commandPalette` / `closeCommandPalette` are also returned because
 * the keyboard-shortcuts section needs to know if the palette is open
 * (Esc closes it) — passed as deps to that module rather than reached
 * for directly.
 */
export function setupCommandPalette({ statusText, updateUI, messageRenderer, toolCardRenderer }) {
  const commandBtn = document.getElementById("command-btn");
  const commandPalette = document.getElementById("command-palette");
  const commandPaletteOverlay = document.getElementById("command-palette-overlay");
  const commandList = document.getElementById("command-list");

  const commands = [
    {
      icon: "🗜️",
      label: t("app.compactButton"),
      desc: t("commandPalette.compactDesc"),
      action: () => rpcCommand({ type: "compact" }, t("app.compacting")),
    },
    {
      icon: "📋",
      label: t("commandPalette.exportHtmlLabel"),
      desc: t("commandPalette.exportHtmlDesc"),
      action: () => rpcExportHtml(),
    },
    {
      icon: "📊",
      label: t("commandPalette.sessionStatsLabel"),
      desc: t("commandPalette.sessionStatsDesc"),
      action: () => showSessionStats(),
    },
    {
      icon: "⬇️",
      label: t("commandPalette.expandAllLabel"),
      desc: t("commandPalette.expandAllDesc"),
      action: () => toolCardRenderer.expandAll(),
    },
    {
      icon: "⬆️",
      label: t("commandPalette.collapseAllLabel"),
      desc: t("commandPalette.collapseAllDesc"),
      action: () => toolCardRenderer.collapseAll(),
    },
  ];

  function openCommandPalette() {
    commandList.innerHTML = "";
    commands.forEach((cmd) => {
      const el = document.createElement("div");
      el.className = "command-item";
      el.innerHTML = `
        <div class="command-icon">${cmd.icon}</div>
        <div>
          <div class="command-label">${cmd.label}</div>
          <div class="command-desc">${cmd.desc}</div>
        </div>
      `;
      el.addEventListener("click", () => {
        closeCommandPalette();
        cmd.action();
      });
      commandList.appendChild(el);
    });
    commandPalette.classList.remove("hidden");
    commandPaletteOverlay.classList.remove("hidden");
  }

  function closeCommandPalette() {
    commandPalette.classList.add("hidden");
    commandPaletteOverlay.classList.add("hidden");
  }

  commandBtn.addEventListener("click", openCommandPalette);
  commandPaletteOverlay.addEventListener("click", closeCommandPalette);

  // Reset via updateUI so an in-flight turn stays labeled as working.
  async function rpcCommand(cmd, statusMsg, { signal, timeoutMs } = {}) {
    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const signals = [signal, controller?.signal].filter(Boolean);
    try {
      if (statusMsg) statusText.textContent = statusMsg;
      const resp = await fetch("/api/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      });
      const data = await resp.json();
      if (data.success) {
        statusText.textContent = t("commandPalette.done");
        setTimeout(() => updateUI(), 2000);
      } else {
        statusText.textContent = data.error || t("commandPalette.failed");
        setTimeout(() => updateUI(), 3000);
      }
      return data;
    } catch (_e) {
      statusText.textContent = t("commandPalette.error");
      setTimeout(() => updateUI(), 3000);
    } finally {
      clearTimeout(timer);
    }
  }

  async function rpcExportHtml() {
    const data = await rpcCommand({ type: "export_html" }, t("commandPalette.exporting"));
    if (data?.success && data.data?.path) {
      statusText.textContent = t("commandPalette.exported", { path: data.data.path });
      setTimeout(() => updateUI(), 4000);
    }
  }

  async function showSessionStats() {
    const data = await rpcCommand({ type: "get_session_stats" }, t("commandPalette.loadingStats"));
    if (data?.success && data.data) {
      const s = data.data;
      const lines = [
        t("commandPalette.statsTitle"),
        t("commandPalette.statsMessages", {
          total: s.totalMessages,
          user: s.userMessages,
          assistant: s.assistantMessages,
        }),
        t("commandPalette.statsToolCalls", { count: s.toolCalls }),
      ];
      if (s.tokens) {
        lines.push(
          t("commandPalette.statsContext", { tokens: (s.tokens.input / 1000).toFixed(1) }),
        );
      }
      messageRenderer.renderSystemMessage(lines.join("\n"));
    }
  }

  return { commandPalette, closeCommandPalette, rpcCommand };
}
