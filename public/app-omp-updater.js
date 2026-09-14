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
import { t } from "./i18n.js";

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
  let restartPending = false;

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

  // The settings button rebinds between "Check for update" (→ checkNow),
  // "Update OMP" (→ installUpdate) and "Restart Ompcot" (→ restartNow, after a
  // successful update). `.onclick` reassignment is the single-handler rebind
  // primitive, so no listener bookkeeping is needed.
  function setCheckButton(mode) {
    if (!checkBtn) return;
    if (mode === "restart") {
      checkBtn.textContent = t("ompUpdater.restartButton");
      checkBtn.onclick = () => restartNow();
      return;
    }
    if (mode === "update") {
      checkBtn.textContent = t("ompUpdater.updateButton");
      checkBtn.onclick = () => installUpdate();
    } else {
      checkBtn.textContent = t("settings.updates.checkForUpdate");
      checkBtn.onclick = () => checkNow({ silent: false });
    }
  }

  function applyCheckResult(d, { silent } = {}) {
    const ok = d?.success !== false;
    updateAvailable = Boolean(d?.updateAvailable);

    if (updateAvailable) {
      const cur = d?.currentVersion
        ? t("ompUpdater.currentVersionSuffix", { version: d.currentVersion })
        : "";
      if (!silent) setStatus(t("ompUpdater.updateAvailable", { current: cur }), "ok");
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
      const raw = String(d?.output || d?.error || "").trim() || t("common.unknownError");
      if (!silent) setStatus(t("ompUpdater.checkFailed", { error: raw }), "warn");
      return;
    }
    if (!silent) setStatus(String(d?.output || t("ompUpdater.upToDate")).trim(), "ok");
  }

  async function checkNow({ silent = false } = {}) {
    if (busy) return;
    busy = true;
    if (checkBtn) checkBtn.disabled = true;
    if (!silent) setStatus(t("ompUpdater.checking"), "info");
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
      title: t("ompUpdater.updateButton"),
      message: t("ompUpdater.updateMessage"),
      confirmLabel: t("ompUpdater.updateConfirmLabel"),
    });
    if (!ok) return;
    // A second click may have opened another confirm while we awaited.
    if (busy) return;

    busy = true;
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.textContent = t("ompUpdater.updating");
    }
    setStatus(t("ompUpdater.updatingRuntime"), "info");
    try {
      const d = await transport.updateOmp();
      if (d?.success) {
        // currentVersion is cached process-lifetime in Rust, so the settings
        // version row also stays stale until the whole app restarts.
        setStatus(t("ompUpdater.updated"), "ok");
        setPill(false);
        updateAvailable = false;
        restartPending = true;
        setCheckButton("restart");
      } else {
        const raw = String(d?.output || t("common.unknownError")).trim();
        setStatus(t("ompUpdater.updateFailed", { error: raw }), "warn");
      }
    } catch (err) {
      setStatus(t("ompUpdater.updateFailed", { error: String(err?.message || err) }), "warn");
    } finally {
      busy = false;
      if (checkBtn) checkBtn.disabled = false;
      setCheckButton(restartPending ? "restart" : updateAvailable ? "update" : "check");
    }
  }

  // app.restart() kills the omp processes of every window along with their
  // in-flight turns, so the confirm is mandatory.
  async function restartNow() {
    const ok = await confirmModal({
      title: t("ompUpdater.restartButton"),
      message: t("ompUpdater.restartMessage"),
      confirmLabel: t("ompUpdater.restartConfirmLabel"),
    });
    if (!ok) return;
    try {
      await transport.relaunchApp();
    } catch (err) {
      setStatus(t("ompUpdater.restartFailed", { error: String(err?.message || err) }), "warn");
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
