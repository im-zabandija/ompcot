/**
 * Reusable dialog shell: mounts `.ui-overlay`/`.ui-dialog` (design-system.css)
 * with the ARIA wiring dialogs need (role, aria-modal, aria-labelledby).
 * Open/close/focus-trap/Escape behavior stays with call sites for now
 * (see confirm-modal.js) — this only builds the labeled shell.
 */
let dialogIdSeq = 0;

export function createDialogShell({ title } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "ui-overlay";

  const dialog = document.createElement("div");
  dialog.className = "ui-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const titleEl = document.createElement("div");
  titleEl.id = `ui-dialog-title-${++dialogIdSeq}`;
  titleEl.textContent = title || "";
  dialog.setAttribute("aria-labelledby", titleEl.id);

  dialog.appendChild(titleEl);
  overlay.appendChild(dialog);

  return { overlay, dialog, titleEl };
}
