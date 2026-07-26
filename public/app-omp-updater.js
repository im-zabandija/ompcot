/**
 * OMP runtime update checker — distinct from Ompcot's own Tauri app auto-updater
 * (`app-updater.js`). The OMP runtime self-updates via `omp update`; this module
 * runs `omp update --check` through the broker control handler, surfaces an
 * update-available pill in the sidebar, and offers an "Update OMP" action in
 * Settings → Updates that runs `omp update --force`.
 *
 * Mirrors the structure of `app-updater.js` (a `createXxx` factory returning an
 * `initXxxUI` entrypoint) but is far simpler: there is no streamed download, no
 * version comparison, no periodic re-check. `omp update --check` is the single
 * source of truth.
 */

import { confirmModal } from "./confirm-modal.js";

export function createOmpUpdater({
  transport,
  checkBtn,
  statusRow,
  statusEl,
  sidebarPill,
  onOpenSettings,
}) {
  let busy = false;
  let updateAvailable = false;

  function setStatus(message, tone = "info") {
    if (!statusRow || !statusEl) return;
    if (!message) {
      statusRow.hidden = true;
      statusEl.textContent = "";
      statusEl.dataset.tone = "";
      return;
    }
    statusRow.hidden = false;
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  }

  function setPill(visible) {
    if (!sidebarPill) return;
    sidebarPill.classList.toggle("hidden", !visible);
  }

  // The settings button rebinds between "Check for update" (→ checkNow) and
  // "Update OMP" (→ installUpdate). `.onclick` reassignment is the single-handler
  // rebind primitive, so no listener bookkeeping is needed.
  function setCheckButton(mode) {
    if (!checkBtn) return;
    if (mode === "update") {
      checkBtn.textContent = "Update OMP";
      checkBtn.onclick = () => installUpdate();
    } else {
      checkBtn.textContent = "Check for update";
      checkBtn.onclick = () => checkNow({ silent: false });
    }
  }

  function applyCheckResult(d, { silent } = {}) {
    const ok = d?.success !== false;
    updateAvailable = Boolean(d?.updateAvailable);

    if (updateAvailable) {
      const cur = d?.currentVersion ? ` (current ${d.currentVersion})` : "";
      if (!silent) setStatus(`OMP update available${cur}.`, "ok");
      setPill(true);
      setCheckButton("update");
      return;
    }

    setPill(false);
    setCheckButton("check");

    // ponytail: `omp update --check` is the authority, but a non-zero exit or a
    // transport error gives no clean "up to date" signal — surface the raw
    // output verbatim instead of pretending everything is fine. Upgrade path:
    // omp could expose a structured `--check` JSON mode.
    if (!ok) {
      const raw = String(d?.output || d?.error || "").trim() || "unknown error";
      if (!silent) setStatus(`Check failed: ${raw}`, "warn");
      return;
    }
    if (!silent) setStatus(String(d?.output || "Already up to date.").trim(), "ok");
  }

  async function checkNow({ silent = false } = {}) {
    if (busy) return;
    busy = true;
    if (checkBtn) checkBtn.disabled = true;
    if (!silent) setStatus("Checking for OMP update...", "info");
    try {
      const r = await transport.checkOmpUpdate();
      applyCheckResult(r, { silent });
    } catch (err) {
      applyCheckResult({ success: false, output: String(err?.message || err) }, { silent });
    } finally {
      busy = false;
      if (checkBtn) checkBtn.disabled = false;
    }
  }

  async function installUpdate() {
    if (busy) return;
    const ok = await confirmModal({
      title: "Update OMP",
      message:
        "Download and install the latest omp runtime? Running agents keep the old version until the workspace is restarted.",
      confirmLabel: "Update",
    });
    if (!ok) return;
    // A second click may have opened another confirm while we awaited.
    if (busy) return;

    busy = true;
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.textContent = "Updating...";
    }
    setStatus("Updating OMP runtime...", "info");
    try {
      const d = await transport.updateOmp();
      if (d?.success) {
        // currentVersion is cached process-lifetime in Rust, so the settings
        // version row also stays stale until the whole app restarts.
        setStatus("Updated — restart Ompcot to apply.", "ok");
        setPill(false);
        updateAvailable = false;
        setCheckButton("check");
      } else {
        const raw = String(d?.output || "unknown error").trim();
        setStatus(`Update failed: ${raw}`, "warn");
      }
    } catch (err) {
      setStatus(`Update failed: ${String(err?.message || err)}`, "warn");
    } finally {
      busy = false;
      if (checkBtn) checkBtn.disabled = false;
      setCheckButton(updateAvailable ? "update" : "check");
    }
  }

  // Safe to call more than once: `busy` guards concurrent checks and the pill
  // handler uses `.onclick` assignment, so re-init never double-registers.
  function initOmpUpdaterUI() {
    if (checkBtn) setCheckButton("check");
    if (sidebarPill) sidebarPill.onclick = () => onOpenSettings?.();
    // One silent check on startup: drives the sidebar pill without disturbing
    // the settings panel (which is closed at boot).
    checkNow({ silent: true }).catch((err) => {
      console.warn("[omp-updater] startup check failed:", err);
    });
  }

  return { initOmpUpdaterUI };
}
