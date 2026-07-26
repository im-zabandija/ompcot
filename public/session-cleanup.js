/**
 * Abandoned-session cleanup — on-demand pill + modal to purge sessions whose
 * working directory no longer exists on disk. No permanent sidebar section:
 * the pill only appears when there are orphaned projects to clean.
 */

// Collect the filePaths of every session belonging to the selected orphan
// projects. missingProjects: [{ path, dirName, sessions: [{ filePath }] }].
export function collectSelectedFilePaths(missingProjects, selectedDirNames) {
  const paths = [];
  for (const project of missingProjects) {
    if (!selectedDirNames.has(project.dirName)) continue;
    for (const session of project.sessions) {
      if (session.filePath) paths.push(session.filePath);
    }
  }
  return paths;
}

// Show/hide the trigger pill based on whether there are orphaned projects and
// keep its label in sync. (Re)wires the click to open the modal.
export function refreshCleanupPill({ pillEl, missingProjects, onOpen }) {
  if (!pillEl) return;
  const count = missingProjects.length;
  if (count === 0) {
    pillEl.classList.add("hidden");
    pillEl.onclick = null;
    return;
  }
  pillEl.textContent = `Limpiar (${count})`;
  pillEl.classList.remove("hidden");
  pillEl.onclick = onOpen;
}

function shortPathOf(fullPath) {
  const parts = (fullPath || "").split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : fullPath;
}

// Open the cleanup modal: one checkbox row per orphaned project (checked by
// default). On confirm, batch-delete the sessions of the selected projects and
// invoke onDeleted(). No-op when there's nothing orphaned.
export async function openAbandonedCleanup({ missingProjects, onDeleted }) {
  if (!missingProjects || missingProjects.length === 0) return;

  const selected = new Set(missingProjects.map((p) => p.dirName));

  const overlay = document.createElement("div");
  overlay.className = "cleanup-overlay";

  const dialog = document.createElement("div");
  dialog.className = "cleanup-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Limpiar sesiones abandonadas");

  const title = document.createElement("div");
  title.className = "cleanup-title";
  title.textContent = "Sesiones abandonadas";

  const subtitle = document.createElement("div");
  subtitle.className = "cleanup-subtitle";
  subtitle.textContent = "El directorio de trabajo de estos proyectos ya no existe.";

  const list = document.createElement("div");
  list.className = "cleanup-list";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "cleanup-delete";

  function updateDeleteLabel() {
    deleteBtn.textContent = `Eliminar seleccionadas (${selected.size})`;
    deleteBtn.disabled = selected.size === 0;
  }

  for (const project of missingProjects) {
    const row = document.createElement("label");
    row.className = "cleanup-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(project.dirName);
      else selected.delete(project.dirName);
      updateDeleteLabel();
    });

    const name = document.createElement("span");
    name.className = "cleanup-row-name";
    name.textContent = shortPathOf(project.path);
    name.title = project.path;

    const n = project.sessions.length;
    const count = document.createElement("span");
    count.className = "cleanup-row-count";
    count.textContent = `${n} sesión${n === 1 ? "" : "es"}`;

    row.append(cb, name, count);
    list.appendChild(row);
  }

  const actions = document.createElement("div");
  actions.className = "cleanup-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "cleanup-cancel";
  cancelBtn.textContent = "Cancelar";

  actions.append(cancelBtn, deleteBtn);
  dialog.append(title, subtitle, list, actions);
  overlay.appendChild(dialog);

  const onKeyDown = (e) => {
    if (e.key === "Escape") close();
  };
  function close() {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  cancelBtn.addEventListener("click", close);

  deleteBtn.addEventListener("click", async () => {
    const filePaths = collectSelectedFilePaths(missingProjects, selected);
    if (filePaths.length === 0) {
      close();
      return;
    }
    deleteBtn.disabled = true;
    try {
      const res = await fetch("/api/sessions/delete-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePaths }),
      });
      await res.json(); // errors are surfaced server-side; nothing to reconcile locally
    } catch (err) {
      console.error("[Cleanup] delete-batch failed:", err);
    }
    close();
    onDeleted?.();
  });

  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild(overlay);
  updateDeleteLabel();
}
