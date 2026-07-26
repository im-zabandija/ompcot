/**
 * Slash-command autocomplete — when the composer text starts with "/", show a
 * filtered menu of omp's native slash commands floating above the composer.
 * Keyboard interception runs in the capture phase so it beats the composer's
 * bubbling Enter-to-send handler while the menu is open. Picking a command
 * inserts "/name " into the input — it never sends.
 *
 * ponytail: static mirror of omp's native slash commands (rarely change);
 * user/project custom commands and future built-ins won't appear. Upgrade
 * path: omp's RPC exposes `available_commands_update` / `get_available_commands`
 * — forward it through the embedded server and feed the menu dynamically.
 * Unknown `/x` is harmless (omp passes it to the model as text per its slash
 * pipeline).
 */
const COMMANDS = [
  { name: "plan", desc: "Toggle read-only plan mode" },
  { name: "compact", desc: "Compact the conversation context" },
  { name: "clear", desc: "Clear the conversation" },
  { name: "copy", desc: "Copy the last assistant message" },
  { name: "cost", desc: "Show token usage and cost" },
  { name: "diff", desc: "Show working-tree diff" },
  { name: "export", desc: "Export the session to HTML" },
  { name: "help", desc: "List available commands" },
  { name: "init", desc: "Generate/refresh AGENTS.md" },
  { name: "join", desc: "Join a shared collab session" },
  { name: "mcp", desc: "Manage MCP servers" },
  { name: "memory", desc: "Manage stored memory" },
  { name: "agents", desc: "Manage task agents" },
  { name: "rules", desc: "Show active rules" },
  { name: "skills", desc: "Show available skills" },
  { name: "status", desc: "Show session status" },
  { name: "retry", desc: "Retry the last turn" },
  { name: "reject", desc: "Reject the current plan" },
  { name: "title", desc: "Set the session title" },
  { name: "undo", desc: "Undo the last change" },
];

export function setupSlashMenu({ messageInput }) {
  const menu = document.createElement("div");
  menu.className = "slash-menu hidden";
  // Anchored inside the composer card (position: relative) so it floats above it.
  const anchor = messageInput.closest(".composer-card") || messageInput.parentElement;
  anchor.appendChild(menu);

  let matches = [];
  let selectedIndex = 0;

  function isOpen() {
    return !menu.classList.contains("hidden");
  }

  function hide() {
    menu.classList.add("hidden");
  }

  function render() {
    menu.innerHTML = "";
    matches.forEach((cmd, i) => {
      const row = document.createElement("div");
      row.className = `slash-menu-item${i === selectedIndex ? " selected" : ""}`;
      const name = document.createElement("span");
      name.className = "slash-menu-item-name";
      name.textContent = `/${cmd.name}`;
      const desc = document.createElement("span");
      desc.className = "slash-menu-item-desc";
      desc.textContent = cmd.desc;
      row.append(name, desc);
      // mousedown (not click) so the pick lands before the textarea blurs.
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(i);
      });
      menu.appendChild(row);
    });
    menu.children[selectedIndex]?.scrollIntoView?.({ block: "nearest" });
  }

  function update() {
    const m = messageInput.value.match(/^\/(\w*)$/);
    matches = m ? COMMANDS.filter((c) => c.name.startsWith(m[1].toLowerCase())) : [];
    if (matches.length === 0) {
      hide();
      return;
    }
    selectedIndex = 0;
    render();
    menu.classList.remove("hidden");
  }

  function pick(index) {
    const cmd = matches[index];
    if (!cmd) return;
    messageInput.value = `/${cmd.name} `;
    // Notify the composer so its autoresize listener runs on the new value.
    messageInput.dispatchEvent(new Event("input", { bubbles: true }));
    hide();
    messageInput.focus();
  }

  messageInput.addEventListener("input", update);
  messageInput.addEventListener("blur", () => hide());

  // Capture on document, not on the input: listeners registered on the same
  // target fire in registration order regardless of the capture flag, so only
  // an ancestor capture listener is guaranteed to run before the composer's
  // bubbling Enter-to-send handler.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!isOpen() || e.target !== messageInput) return;
      if (e.key === "ArrowDown") {
        selectedIndex = (selectedIndex + 1) % matches.length;
        render();
      } else if (e.key === "ArrowUp") {
        selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
        render();
      } else if (e.key === "Enter" || e.key === "Tab") {
        pick(selectedIndex);
      } else if (e.key === "Escape") {
        hide();
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  document.addEventListener("click", (e) => {
    if (e.target !== messageInput && !menu.contains(e.target)) hide();
  });

  return { hide };
}
