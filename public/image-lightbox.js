/**
 * Image lightbox - fullscreen preview for attachment thumbnails. Reuses the
 * `.cleanup-overlay` backdrop so it needs only a small CSS rule for the img.
 */

// Opens a viewer for a data-URI image. Closes on overlay click or Escape.
export function openImageLightbox(src, alt = "") {
  const overlay = document.createElement("div");
  overlay.className = "cleanup-overlay image-lightbox";

  const img = document.createElement("img");
  img.className = "image-lightbox-img";
  img.src = src;
  img.alt = alt;
  overlay.appendChild(img);

  // Capture phase on `document`: the app's global Escape handler
  // (app-keyboard-shortcuts.js) also listens on `document` but in the bubble
  // phase and aborts the running turn, so a bubble-phase stopPropagation()
  // here would run too late. Capture always runs first.
  const onKeyDown = (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  function close() {
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", onKeyDown, true);
  document.body.appendChild(overlay);
}
