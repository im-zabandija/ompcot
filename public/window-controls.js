/**
 * Controles de ventana custom (Windows/Linux) y drag del header.
 *
 * macOS no pasa por acá: conserva TitleBarStyle::Overlay con sus traffic
 * lights; el gate de abajo corta antes de prender la clase custom-titlebar.
 */

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, [role=button]";

export async function setupWindowControls({ doc = document, tauri = window.__TAURI__ } = {}) {
  const win = tauri?.window?.getCurrentWindow?.();

  // 1+2. Drag y doble click: se instalan SIEMPRE y de forma síncrona, antes
  // de cualquier await, así macOS (que también los usa) no depende del gate.
  doc.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (!e.target.closest("[data-window-drag]")) return;
    if (e.target.closest(INTERACTIVE_SELECTOR)) return;
    win?.startDragging().catch(() => {});
  });
  doc.addEventListener("dblclick", (e) => {
    if (!e.target.closest("[data-window-drag]")) return;
    if (e.target.closest(INTERACTIVE_SELECTOR)) return;
    win?.toggleMaximize().catch(() => {});
  });

  // 3. Gate: sin Tauri (cliente móvil/navegador), macOS overlay, o ventana
  // todavía decorada -> no hay titlebar custom que mostrar.
  if (!win) return;
  if (doc.documentElement.classList.contains("macos-overlay")) return;
  // Si el IPC falla asumimos "sin decoración": Rust ya sacó la barra nativa en
  // no-macOS, así que quedarnos sin controles dejaría la ventana solo cerrable
  // desde el WM.
  if ((await win.isDecorated().catch(() => false)) !== false) return;

  // 4. Recién acá se prenden controles y handles (el CSS los muestra).
  doc.documentElement.classList.add("custom-titlebar");

  // 5. Botones minimizar / maximizar-restaurar / cerrar.
  const controls = doc.getElementById("window-controls");
  const syncMaximized = async () => {
    try {
      controls.dataset.maximized = String(await win.isMaximized());
    } catch {
      /* noop */
    }
  };
  doc.getElementById("window-minimize")?.addEventListener("click", () => {
    win.minimize().catch(() => {});
  });
  doc.getElementById("window-maximize")?.addEventListener("click", () => {
    win
      .toggleMaximize()
      .then(() => syncMaximized())
      .catch(() => {});
  });
  doc.getElementById("window-close")?.addEventListener("click", () => {
    win.close().catch(() => {});
  });
  syncMaximized();
  // Refleja los maximizados que dispara el WM por fuera del botón.
  win.onResized(() => syncMaximized()).catch(() => {});

  // 6. Resize: una ventana sin decoraciones pierde los agarres nativos; los
  // reponemos delegando cada borde/esquina a startResizeDragging.
  doc.getElementById("window-resize-handles")?.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const dir = e.target.dataset?.resize;
    if (!dir) return;
    e.preventDefault();
    win.startResizeDragging(dir).catch(() => {});
  });
}
