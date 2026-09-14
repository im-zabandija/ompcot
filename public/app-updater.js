import { t } from "./i18n.js";

export function createAppUpdater({
  transport,
  appVersionValue,
  updaterSection,
  checkUpdatesBtn,
  updateStatusRow,
  updateStatusEl,
  updateInstallRow,
  updateInstallLabel,
  installUpdateBtn,
  sidebarUpdateBtn,
  onOpenSettings,
}) {
  const APP_VERSION = (() => {
    const meta = document.querySelector('meta[name="app-version"]');
    return meta?.content?.trim() || null;
  })();

  let pendingUpdate = null;
  let updaterBusy = false;
  let updateCheckFailed = false;
  let uiInitialized = false;
  let startupCheckTimer = null;
  let periodicCheckInterval = null;
  const BETA_VERSION_RE = /-beta(?:[.-]|$)/i;
  const NUMERIC_PRERELEASE_VERSION_RE = /-\d+(?:\.\d+)*$/;
  let currentAppVersion = APP_VERSION;

  function setSidebarUpdateButton({
    visible,
    label = t("appUpdater.update"),
    tone = "ok",
    title = t("appUpdater.openInSettings"),
    disabled = false,
  }) {
    if (!sidebarUpdateBtn) return;
    sidebarUpdateBtn.classList.toggle("hidden", !visible);
    if (!visible) {
      sidebarUpdateBtn.textContent = t("appUpdater.update");
      sidebarUpdateBtn.dataset.tone = "";
      sidebarUpdateBtn.disabled = false;
      sidebarUpdateBtn.title = t("appUpdater.openInSettings");
      return;
    }
    sidebarUpdateBtn.textContent = label;
    sidebarUpdateBtn.dataset.tone = tone;
    sidebarUpdateBtn.disabled = disabled;
    sidebarUpdateBtn.title = title;
  }

  function syncSidebarUpdateButton() {
    if (updaterBusy) {
      setSidebarUpdateButton({
        visible: true,
        label: t("appUpdater.updating"),
        tone: "warn",
        title: t("appUpdater.updateInProgress"),
        disabled: true,
      });
      return;
    }
    if (pendingUpdate) {
      setSidebarUpdateButton({
        visible: true,
        label: t("appUpdater.update"),
        tone: "ok",
        title: t("appUpdater.updateAvailable", { version: pendingUpdate.version }),
      });
      return;
    }
    if (updateCheckFailed) {
      setSidebarUpdateButton({
        visible: true,
        label: t("appUpdater.retry"),
        tone: "error",
        title: t("appUpdater.checkFailedRetry"),
      });
      return;
    }
    setSidebarUpdateButton({ visible: false });
  }

  function setUpdateStatus(message, tone = "info") {
    if (!updateStatusRow || !updateStatusEl) return;
    if (!message) {
      updateStatusRow.hidden = true;
      updateStatusEl.textContent = "";
      updateStatusEl.dataset.tone = "";
      return;
    }
    updateStatusRow.hidden = false;
    updateStatusEl.textContent = message;
    updateStatusEl.dataset.tone = tone;
  }

  function showInstallButton(update) {
    if (!updateInstallRow || !updateInstallLabel || !installUpdateBtn) return;
    if (!update) {
      updateInstallRow.hidden = true;
      return;
    }
    updateInstallRow.hidden = false;
    const from = update.currentVersion
      ? t("appUpdater.fromVersion", { version: update.currentVersion })
      : "";
    updateInstallLabel.textContent = t("appUpdater.updateLabel", { version: update.version, from });
    installUpdateBtn.disabled = false;
    installUpdateBtn.textContent = t("appUpdater.downloadAndInstall");
  }

  function isIgnoredPrereleaseVersion(version) {
    return BETA_VERSION_RE.test(String(version || "").trim());
  }

  function isLocalPrereleaseBuild(version) {
    return NUMERIC_PRERELEASE_VERSION_RE.test(String(version || "").trim());
  }

  async function loadAppVersion() {
    if (!appVersionValue) return;

    if (APP_VERSION) {
      appVersionValue.textContent = APP_VERSION;
      currentAppVersion = APP_VERSION;
      return APP_VERSION;
    }

    try {
      if (transport?.capabilities?.native) {
        const v = await transport.getAppVersion();
        if (v) {
          appVersionValue.textContent = v;
          currentAppVersion = v;
          return v;
        }
      }
    } catch (err) {
      console.warn("[updater] unable to read app version:", err);
    }
    appVersionValue.textContent = t("appUpdater.unknownVersion");
    currentAppVersion = t("appUpdater.unknownVersion");
    return currentAppVersion;
  }

  function explainUpdateError(rawMessage) {
    const msg = String(rawMessage || "");
    if (/Could not fetch a valid release JSON/i.test(msg)) {
      return t("appUpdater.noManifest");
    }
    if (/pubkey|public key|signature/i.test(msg)) {
      return t("appUpdater.invalidSignature");
    }
    return msg || t("appUpdater.unknownError");
  }

  async function checkForUpdates({ silent = false } = {}) {
    if (updaterBusy) return null;

    if (isLocalPrereleaseBuild(currentAppVersion)) {
      if (!silent) {
        setUpdateStatus(t("appUpdater.preReleaseBuild", { version: currentAppVersion }), "info");
      }
      pendingUpdate = null;
      updateCheckFailed = false;
      showInstallButton(null);
      syncSidebarUpdateButton();
      return null;
    }

    if (!transport?.hasUpdater) {
      if (!silent) setUpdateStatus(t("appUpdater.desktopOnly"), "warn");
      if (updaterSection && !transport?.capabilities?.native) updaterSection.hidden = true;
      setSidebarUpdateButton({ visible: false });
      return null;
    }

    updaterBusy = true;
    syncSidebarUpdateButton();
    if (checkUpdatesBtn) {
      checkUpdatesBtn.disabled = true;
      checkUpdatesBtn.textContent = t("appUpdater.checking");
    }
    if (!silent) setUpdateStatus(t("appUpdater.checkingForUpdates"), "info");

    try {
      const update = await transport.checkForUpdate();
      if (!update) {
        pendingUpdate = null;
        updateCheckFailed = false;
        showInstallButton(null);
        setUpdateStatus(t("appUpdater.latestVersion"), "ok");
        syncSidebarUpdateButton();
        return null;
      }

      if (isIgnoredPrereleaseVersion(update.version)) {
        console.info("[updater] ignoring beta release:", update.version);
        pendingUpdate = null;
        updateCheckFailed = false;
        showInstallButton(null);
        setUpdateStatus(t("appUpdater.latestStableVersion"), "ok");
        syncSidebarUpdateButton();
        return null;
      }

      pendingUpdate = update;
      updateCheckFailed = false;
      showInstallButton(update);
      setUpdateStatus(t("appUpdater.updateAvailable", { version: update.version }), "ok");
      syncSidebarUpdateButton();
      return update;
    } catch (err) {
      const friendly = explainUpdateError(err?.message || err);
      console.warn("[updater] check failed:", err);
      if (!silent) {
        setUpdateStatus(friendly, "warn");
      }
      updateCheckFailed = true;
      syncSidebarUpdateButton();
      return null;
    } finally {
      updaterBusy = false;
      syncSidebarUpdateButton();
      if (checkUpdatesBtn) {
        checkUpdatesBtn.disabled = false;
        checkUpdatesBtn.textContent = t("appUpdater.checkNow");
      }
    }
  }

  async function installPendingUpdate() {
    if (updaterBusy || !pendingUpdate) return;
    if (!transport?.capabilities?.native) return;

    updaterBusy = true;
    syncSidebarUpdateButton();
    if (installUpdateBtn) {
      installUpdateBtn.disabled = true;
      installUpdateBtn.textContent = t("appUpdater.downloadingEllipsis");
    }
    if (checkUpdatesBtn) checkUpdatesBtn.disabled = true;

    try {
      await transport.downloadAndInstallUpdate((evt) => {
        if (evt.phase === "started") {
          setUpdateStatus(
            evt.contentLength
              ? t("appUpdater.downloadingMb", { mb: (evt.contentLength / 1_048_576).toFixed(1) })
              : t("appUpdater.downloadingEllipsis"),
            "info",
          );
        } else if (evt.phase === "progress" && evt.contentLength) {
          const pct = Math.min(100, Math.round((evt.downloaded / evt.contentLength) * 100));
          if (installUpdateBtn)
            installUpdateBtn.textContent = t("appUpdater.downloading", { percent: pct });
        } else if (evt.phase === "finished") {
          if (installUpdateBtn) installUpdateBtn.textContent = t("appUpdater.installing");
          setUpdateStatus(t("appUpdater.installing"), "info");
        }
      });

      setUpdateStatus(t("appUpdater.installedRestarting"), "ok");
      pendingUpdate = null;
      updateCheckFailed = false;
      syncSidebarUpdateButton();
      setTimeout(() => {
        transport?.relaunchApp?.().catch((err) => {
          console.error("[updater] relaunch failed:", err);
          setUpdateStatus(t("appUpdater.restartManually"), "warn");
          updateCheckFailed = true;
          syncSidebarUpdateButton();
        });
      }, 600);
    } catch (err) {
      const msg = String(err?.message || err || "unknown error");
      console.error("[updater] install failed:", err);
      setUpdateStatus(t("appUpdater.updateFailed", { message: msg }), "error");
      if (installUpdateBtn) {
        installUpdateBtn.disabled = false;
        installUpdateBtn.textContent = t("appUpdater.retry");
      }
      updateCheckFailed = true;
      syncSidebarUpdateButton();
    } finally {
      updaterBusy = false;
      syncSidebarUpdateButton();
      if (checkUpdatesBtn) checkUpdatesBtn.disabled = false;
    }
  }

  let isDevBuildCache = null;
  async function isDevBuild() {
    if (isDevBuildCache !== null) return isDevBuildCache;
    try {
      isDevBuildCache = !!(transport?.capabilities?.native && (await transport.isDev()));
    } catch {
      isDevBuildCache = false;
    }
    return isDevBuildCache;
  }

  async function initUpdaterUI() {
    if (!updaterSection) return;

    if (!transport?.hasUpdater) {
      updaterSection.hidden = true;
      syncSidebarUpdateButton();
      return;
    }
    // Capabilities can arrive asynchronously and may be re-emitted on reconnect.
    // Ensure the section becomes visible once native updater support is known.
    updaterSection.hidden = false;

    const appVersion = await loadAppVersion();

    if (await isDevBuild()) {
      setUpdateStatus(t("appUpdater.devBuild"), "info");
      if (checkUpdatesBtn) checkUpdatesBtn.disabled = true;
      syncSidebarUpdateButton();
      return;
    }

    if (isLocalPrereleaseBuild(appVersion)) {
      setUpdateStatus(t("appUpdater.preReleaseBuild", { version: appVersion }), "info");
      if (checkUpdatesBtn) checkUpdatesBtn.disabled = true;
      if (installUpdateBtn) installUpdateBtn.disabled = true;
      showInstallButton(null);
      syncSidebarUpdateButton();
      return;
    }

    if (uiInitialized) {
      syncSidebarUpdateButton();
      return;
    }
    uiInitialized = true;

    checkUpdatesBtn?.addEventListener("click", () => {
      checkForUpdates({ silent: false });
    });
    installUpdateBtn?.addEventListener("click", () => {
      installPendingUpdate();
    });

    startupCheckTimer = setTimeout(() => {
      checkForUpdates({ silent: true }).catch(() => {});
    }, 5_000);

    periodicCheckInterval = setInterval(
      () => {
        if (document.visibilityState === "visible") {
          checkForUpdates({ silent: true }).catch(() => {});
        }
      },
      6 * 60 * 60 * 1000,
    );
    // Keep references intentionally; helps future teardown work and makes
    // duplicate-initialization bugs obvious in devtools.
    void startupCheckTimer;
    void periodicCheckInterval;
    syncSidebarUpdateButton();
  }

  async function openUpdatesFromSidebar() {
    await onOpenSettings();
    updaterSection?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (pendingUpdate && installUpdateBtn && !installUpdateBtn.disabled) {
      installUpdateBtn.focus();
      return;
    }
    checkUpdatesBtn?.focus();
  }

  return {
    initUpdaterUI,
    openUpdatesFromSidebar,
  };
}
