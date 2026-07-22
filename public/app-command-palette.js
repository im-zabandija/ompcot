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
export function setupCommandPalette({ statusText, messageRenderer, toolCardRenderer }) {
  const commandBtn = document.getElementById("command-btn");
  const commandPalette = document.getElementById("command-palette");
  const commandPaletteOverlay = document.getElementById("command-palette-overlay");
  const commandList = document.getElementById("command-list");

  const commands = [
    {
      icon: "🗜️",
      label: "Compact",
      desc: "Compact context to save tokens",
      action: () => rpcCommand({ type: "compact" }, "Compacting..."),
    },
    {
      icon: "📋",
      label: "Export HTML",
      desc: "Export session as HTML file",
      action: () => rpcExportHtml(),
    },
    {
      icon: "📊",
      label: "Session Stats",
      desc: "Show session statistics",
      action: () => showSessionStats(),
    },
    {
      icon: "⬇️",
      label: "Expand All Tools",
      desc: "Expand all tool cards",
      action: () => toolCardRenderer.expandAll(),
    },
    {
      icon: "⬆️",
      label: "Collapse All Tools",
      desc: "Collapse all tool cards",
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

  async function rpcCommand(cmd, statusMsg) {
    try {
      if (statusMsg) statusText.textContent = statusMsg;
      const resp = await fetch("/api/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      const data = await resp.json();
      if (data.success) {
        statusText.textContent = "Done";
        setTimeout(() => {
          statusText.textContent = "Connected";
        }, 2000);
      } else {
        statusText.textContent = data.error || "Failed";
        setTimeout(() => {
          statusText.textContent = "Connected";
        }, 3000);
      }
      return data;
    } catch (_e) {
      statusText.textContent = "Error";
      setTimeout(() => {
        statusText.textContent = "Connected";
      }, 3000);
    }
  }

  async function rpcExportHtml() {
    const data = await rpcCommand({ type: "export_html" }, "Exporting...");
    if (data?.success && data.data?.path) {
      statusText.textContent = `Exported: ${data.data.path}`;
      setTimeout(() => {
        statusText.textContent = "Connected";
      }, 4000);
    }
  }

  async function showSessionStats() {
    const data = await rpcCommand({ type: "get_session_stats" }, "Loading stats...");
    if (data?.success && data.data) {
      const s = data.data;
      const lines = [
        `📊 Session Stats`,
        `Messages: ${s.totalMessages} (${s.userMessages} user, ${s.assistantMessages} assistant)`,
        `Tool calls: ${s.toolCalls}`,
      ];
      if (s.tokens) {
        lines.push(`Context: ~${(s.tokens.input / 1000).toFixed(1)}k tokens`);
      }
      messageRenderer.renderSystemMessage(lines.join("\n"));
    }
  }

  return { commandPalette, closeCommandPalette, rpcCommand };
}
