/**
 * Generic promise-based confirm dialog. Reuses the `.cleanup-*` overlay styles
 * so it needs no CSS of its own.
 */

// Resolves true on confirm, false on cancel / overlay click / Escape.
export function confirmModal({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "cleanup-overlay";

    const dialog = document.createElement("div");
    dialog.className = "cleanup-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", title || "Confirm");

    const titleEl = document.createElement("div");
    titleEl.className = "cleanup-title";
    titleEl.textContent = title || "";

    const messageEl = document.createElement("div");
    messageEl.className = "cleanup-subtitle";
    messageEl.textContent = message || "";

    const actions = document.createElement("div");
    actions.className = "cleanup-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cleanup-cancel";
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = danger ? "cleanup-delete" : "cleanup-confirm";
    confirmBtn.textContent = confirmLabel;

    actions.append(cancelBtn, confirmBtn);
    dialog.append(titleEl, messageEl, actions);
    overlay.appendChild(dialog);

    // Capture phase on `document`: the app's global Escape handler
    // (app-keyboard-shortcuts.js) also listens on `document` but in the bubble
    // phase and is registered at boot, so a bubble-phase stopPropagation() here
    // would run too late to stop it. `document` is an ancestor of the focused
    // element, so capture always runs first.
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close(false);
    };
    function close(result) {
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      resolve(result);
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    cancelBtn.addEventListener("click", () => close(false));
    confirmBtn.addEventListener("click", () => close(true));

    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}
