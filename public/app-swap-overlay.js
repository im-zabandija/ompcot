/**
 * Instance-swap overlay — shown during full-page navigations between omp
 * instances (`+ New Session`, `start new chat`, `Open Project`, `Open
 * Folder`) so the 1-2s spawn latency + WebView reload reads as one smooth
 * transition instead of a freeze + white flash. To make this look like a
 * single smooth transition we:
 *
 *   1. Open a fullscreen spinner overlay BEFORE awaiting openWorkspace.
 *   2. Persist a sessionStorage flag so the new page boots into the
 *      same overlay (see <head> bootstrap script in index.html).
 *   3. After the new page's WebSocket first connects, fade out.
 */
export function setupSwapOverlay({ wsClient }) {
  // Returns a `dismiss` function that rolls back the overlay if the
  // swap fails before navigation (e.g. openWorkspace rejects).
  function showSwapOverlay(label) {
    try {
      sessionStorage.setItem("ompcot:swapping-instance", "1");
    } catch {}
    document.body.classList.add("swapping-instance");
    const overlay = document.getElementById("instance-swap-overlay");
    if (overlay) overlay.setAttribute("data-visible", "true");
    const labelEl = document.getElementById("instance-swap-overlay-label");
    if (labelEl && typeof label === "string" && label) labelEl.textContent = label;
    return hideSwapOverlay;
  }

  function hideSwapOverlay() {
    try {
      sessionStorage.removeItem("ompcot:swapping-instance");
    } catch {}
    document.body.classList.remove("swapping-instance");
    const overlay = document.getElementById("instance-swap-overlay");
    if (overlay) overlay.setAttribute("data-visible", "false");
  }

  // Returned to workspace-actions.js — they call this BEFORE openWorkspace
  // (so the overlay covers spawn latency) and the returned dismiss is only
  // invoked on error (success path lets the overlay persist across the
  // navigation boundary).
  const onBeforeInstanceSwap = (label) => showSwapOverlay(label);

  // If the page booted into the overlay (because we just navigated from
  // a previous instance), fade it out as soon as the WebSocket reaches
  // the new omp. The post-connect wait avoids a brief flash of empty
  // chat UI before /api/sessions and get_state finish populating things.
  function dismissBootSwapOverlayWhenReady() {
    if (!document.body.classList.contains("swapping-instance")) return;
    const fade = () => {
      requestAnimationFrame(() => {
        const overlay = document.getElementById("instance-swap-overlay");
        if (overlay) overlay.setAttribute("data-visible", "false");
        document.body.classList.remove("swapping-instance");
        try {
          sessionStorage.removeItem("ompcot:swapping-instance");
        } catch {}
      });
    };
    const alreadyOpen = wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN;
    if (alreadyOpen) {
      fade();
    } else {
      const onConnect = () => {
        wsClient.removeEventListener("connected", onConnect);
        fade();
      };
      wsClient.addEventListener("connected", onConnect);
    }
    setTimeout(() => {
      if (document.body.classList.contains("swapping-instance")) hideSwapOverlay();
    }, 5000);
  }

  return { onBeforeInstanceSwap, dismissBootSwapOverlayWhenReady };
}
