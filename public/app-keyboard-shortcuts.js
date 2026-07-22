/**
 * Global keyboard shortcuts (Escape to close overlays / abort / collapse
 * mobile sidebar; "/" to focus composer; Cmd/Ctrl+N for a new chat;
 * Cmd+Alt+I for the webview inspector).
 *
 * Everything here reads state or delegates to functions owned by other
 * modules — no state of its own. The setters/getters that reference
 * exports from later-run setups (e.g. `closeSettings`, which comes
 * from the settings panel wired below this) are passed as thunks so
 * the temporal-dead-zone bindings resolve lazily at keydown time.
 */
export function setupKeyboardShortcuts({
  state,
  transport,
  messageRenderer,
  messageInput,
  sidebarEl,
  settingsPanel,
  commandPalette,
  modelDropdownMenu,
  closeSettings,
  closeCommandPalette,
  closeModelDropdown,
  abortCurrentRun,
  toggleSidebar,
  newSession,
  nativeAvailable,
}) {
  function isInInput() {
    const tag = document.activeElement?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;
  }

  document.addEventListener("keydown", (e) => {
    // Escape — Abort streaming, or close sidebar on mobile
    if (e.key === "Escape") {
      // Close palettes/panels first
      if (!settingsPanel.classList.contains("hidden")) {
        closeSettings();
        return;
      }
      if (!commandPalette.classList.contains("hidden")) {
        closeCommandPalette();
        return;
      }
      if (!modelDropdownMenu.classList.contains("hidden")) {
        closeModelDropdown();
        return;
      }

      if (state.isStreaming) {
        abortCurrentRun();
      } else if (!sidebarEl.classList.contains("collapsed") && window.innerWidth <= 768) {
        toggleSidebar();
      }
    }

    // / — Focus message input (when not already in an input)
    if (e.key === "/" && !isInInput()) {
      e.preventDefault();
      messageInput.focus();
    }

    // Cmd+N (macOS) / Ctrl+N (Windows/Linux) — Start a new chat session in
    // the current workspace. Mirrors the header "+ New Session" button.
    // We intentionally do NOT gate on isInInput() so the shortcut works
    // even while the user is typing in the composer. Shift/Alt are excluded
    // so we don't shadow Cmd+Shift+N (reserved for future "new window").
    if ((e.key === "n" || e.key === "N") && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      newSession().catch((err) => {
        messageRenderer.renderError(`Failed to start new session: ${err}`);
      });
    }

    // Cmd+Option+I (macOS) / Ctrl+Alt+I (Windows/Linux) — Open webview inspector.
    if ((e.key === "i" || e.key === "I") && (e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (nativeAvailable()) {
        transport.openDevtools().catch((err) => {
          messageRenderer.renderError(`Failed to open inspector: ${err}`);
        });
      }
    }
  });
}
