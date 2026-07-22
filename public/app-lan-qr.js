/**
 * LAN QR modal — the "phone-in" flow where a Tailscale/LAN URL is
 * discovered via `/api/health`, exposed as a QR the user can scan
 * from their phone, and reflected in the status pill ("Connected •
 * TS" or "• LAN").
 *
 * `tailscaleUrl` / `lanUrl` / `lanUrls` are only written here (during
 * `refreshLanUrl`), so they live inside the module as private state.
 * The WebSocket status handler (still in app.js) reads them through
 * `getConnectionUrls()` to decorate the "connected" pill without
 * having to duplicate the fetch.
 */
export function setupLanQr({ statusText, openExternalLink }) {
  let tailscaleUrl = "";
  let lanUrl = "";
  let lanUrls = [];

  const lanQrBtn = document.getElementById("lan-qr-btn");
  const lanQrModal = document.getElementById("lan-qr-modal");
  const lanQrModalBackdrop = document.getElementById("lan-qr-modal-backdrop");
  const lanQrModalClose = document.getElementById("lan-qr-modal-close");
  const lanQrLoading = document.getElementById("lan-qr-loading");
  const lanQrImage = document.getElementById("lan-qr-image");
  const lanQrOpenLink = document.getElementById("lan-qr-open-link");
  let lanQrUrl = "";

  function updateLanQrButton(url = "") {
    if (!lanQrBtn) return;
    if (url) {
      lanQrBtn.classList.remove("hidden");
    } else {
      lanQrBtn.classList.add("hidden");
    }
  }

  async function openLanQrModal() {
    if (!lanQrModal) return;
    lanQrModal.classList.remove("hidden");
    if (lanQrLoading) lanQrLoading.style.display = "";
    if (lanQrImage) lanQrImage.classList.add("hidden");
    if (lanQrOpenLink) lanQrOpenLink.classList.add("hidden");
    lanQrUrl = "";
    try {
      const res = await fetch("/api/lan-qr");
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json();
      if (lanQrImage) {
        lanQrImage.src = data.dataUrl;
        lanQrImage.classList.remove("hidden");
      }
      if (typeof data.url === "string" && data.url) {
        lanQrUrl = data.url;
        if (lanQrOpenLink) lanQrOpenLink.classList.remove("hidden");
      }
      if (lanQrLoading) lanQrLoading.style.display = "none";
    } catch {
      if (lanQrLoading) lanQrLoading.textContent = "QR code unavailable";
    }
  }

  function closeLanQrModal() {
    if (lanQrModal) lanQrModal.classList.add("hidden");
  }

  if (lanQrBtn) lanQrBtn.addEventListener("click", openLanQrModal);
  if (lanQrModalBackdrop) lanQrModalBackdrop.addEventListener("click", closeLanQrModal);
  if (lanQrModalClose) lanQrModalClose.addEventListener("click", closeLanQrModal);
  if (lanQrOpenLink)
    lanQrOpenLink.addEventListener("click", () => {
      if (lanQrUrl) openExternalLink(lanQrUrl);
    });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lanQrModal && !lanQrModal.classList.contains("hidden")) {
      closeLanQrModal();
    }
  });

  async function refreshLanUrl() {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      tailscaleUrl = typeof data?.tailscaleUrl === "string" ? data.tailscaleUrl : tailscaleUrl;
      lanUrls = Array.isArray(data?.lanUrls)
        ? data.lanUrls.filter((value) => typeof value === "string" && value.trim())
        : [];
      lanUrl = typeof data?.lanUrl === "string" ? data.lanUrl : "";
      if (!lanUrl && lanUrls.length > 0) lanUrl = lanUrls[0];
      if (tailscaleUrl) {
        statusText.textContent = "Connected • TS";
        statusText.title = tailscaleUrl;
      } else if (lanUrl) {
        statusText.textContent = "Connected • LAN";
        statusText.title = lanUrl;
      }
      updateLanQrButton(lanUrl);
    } catch {
      updateLanQrButton("");
    }
  }

  return {
    refreshLanUrl,
    getConnectionUrls: () => ({ tailscaleUrl, lanUrl }),
  };
}
