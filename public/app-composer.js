/**
 * Composer — textarea auto-resize, image attach/paste/drop, queued
 * messages while streaming, `sendMessage`, and the abort button wire.
 *
 * Also owns the `inFlightPrompts` map that the WebSocket
 * `command_undeliverable` handler consults to recover a dropped prompt
 * back into the composer — exposed via `getInFlightPrompt` /
 * `deleteInFlightPrompt` so callers don't touch the internal Map.
 *
 * `escapeHtml` is exposed because two other sections (package browser)
 * already reuse the exact same helper — the alternative would be
 * duplicating it, and there's no dedicated string-utils module today.
 */

import { getFileIcon, resolveExistingPaths } from "./file-browser.js";
import { PLAN_MODE_CLICK_MESSAGE, planModeClickDecision } from "./plan-mode-gating.js";
import {
  composePromptText,
  looksLikeDir,
  parseFileUriList,
  pathSplitCandidates,
} from "./prompt-attachments.js";

export function base64ToFile(data, mimeType) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], "pasted-image", { type: mimeType || "image/png" });
}

export function setupComposer({
  state,
  wsClient,
  sidebar,
  messageRenderer,
  messageInput,
  composerCard,
  chatForm,
  abortBtn,
  currentOnboardingState,
  abortCurrentRun,
  pollInstances,
  setLastSentMessage,
  transport,
  rpcCommand,
  statusText,
  updateUI,
}) {
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  messageInput.addEventListener("keydown", (e) => {
    // IME composition uses Enter to confirm candidates; never send during composition.
    const isImeComposing = e.isComposing || e.keyCode === 229;
    if (isImeComposing) return;

    // Enter sends, Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  function autoResize() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
  }
  messageInput.addEventListener("input", autoResize);

  // Image attachment
  const attachBtn = document.getElementById("attach-btn");
  const imageInput = document.getElementById("image-input");
  const imagePreviews = document.getElementById("image-previews");
  let pendingImages = []; // Array of { data: base64, mimeType: string }
  const fileChipsEl = document.getElementById("file-chips");
  let pendingFiles = []; // [{ path, isDirectory }]
  let lastDomImagePasteAt = 0;
  let lastTextPasteAt = 0;

  // Max dimension — resize images larger than this to reduce token cost & avoid API limits
  const MAX_IMAGE_DIM = 2048;
  const VALID_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

  function processImageFile(file) {
    return new Promise((resolve, reject) => {
      // Validate mime type
      const mimeType = VALID_MIME_TYPES.includes(file.type) ? file.type : "image/png";

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Resize if too large
          let { width, height } = img;
          if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
            const scale = MAX_IMAGE_DIM / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Output as PNG for screenshots/diagrams, JPEG for photos
          const outputMime = mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
          const quality = outputMime === "image/jpeg" ? 0.85 : undefined;
          const dataUrl = canvas.toDataURL(outputMime, quality);
          const base64 = dataUrl.split(",")[1];

          if (!base64) {
            reject(new Error("Failed to encode image"));
            return;
          }

          resolve({ data: base64, mimeType: outputMime });
        };
        img.onerror = () => reject(new Error("Failed to decode image"));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function addImageFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const img = await processImageFile(file);
        pendingImages.push(img);
      } catch (e) {
        console.error("[Ompcot] Image processing failed:", e);
      }
    }
    renderImagePreviews();
  }

  attachBtn.addEventListener("click", () => imageInput.click());

  imageInput.addEventListener("change", () => {
    addImageFiles(imageInput.files);
    imageInput.value = "";
  });

  // Drag & drop anywhere on the composer card
  composerCard.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  composerCard.addEventListener("drop", (e) => {
    e.preventDefault();
    addImageFiles(e.dataTransfer.files);
  });

  // Paste: file paths first (text/uri-list, then bare paths), then images
  messageInput.addEventListener("paste", (e) => {
    const cd = e.clipboardData;
    const plain = cd?.getData?.("text/plain") || "";

    // Un archivo copiado en el explorador viaja como text/uri-list. Este camino
    // sirve donde clipboardData funciona (Windows/macOS/Chromium); en WebKitGTK
    // getData() devuelve vacío para todos los tipos y lo cubre el listener de
    // `beforeinput` de más abajo.
    const uris = parseFileUriList(cd?.getData?.("text/uri-list") || plain);
    if (uris.length) {
      e.preventDefault();
      lastTextPasteAt = Date.now();
      addFilePaths(uris.map((p) => ({ path: p, isDirectory: looksLikeDir(p) })));
      return;
    }

    if (pathSplitCandidates(plain).length) {
      e.preventDefault();
      lastTextPasteAt = Date.now();
      attachPastedText(plain);
      return;
    }

    // A text paste means the user wants text, not a stale clipboard image, so
    // record it; the native fallback below bows out when it fires right after.
    // ponytail: some Linux clipboard managers keep an old image "offered" even
    // after you copy text — this stops that stale image from auto-attaching.
    if (plain) lastTextPasteAt = Date.now();
    const files = [];
    for (const item of cd?.items || []) {
      if (!item.type.startsWith("image/")) continue;
      files.push(item.getAsFile());
    }
    if (files.length) {
      lastDomImagePasteAt = Date.now();
      addImageFiles(files);
    }
  });

  // WebKitGTK anuncia "text/uri-list" en clipboardData.types pero getData()
  // devuelve vacío para TODOS los tipos, así que el handler de arriba no puede
  // ver la ruta en Linux. El texto sí llega acá: beforeinput con inputType
  // "insertFromPaste" trae en `data` exactamente lo que se está por insertar.
  // ponytail: no se sabe si el motor respeta preventDefault() acá, así que va
  // con red — si el texto entra igual, el listener de `input` de abajo lo saca
  // en el mismo tick. Si algún día WebKit arregla getData(), este camino queda
  // inofensivo: el handler `paste` cancela antes y nunca llega.
  let pastedPathText = "";
  messageInput.addEventListener("beforeinput", (e) => {
    if (e.inputType !== "insertFromPaste" || !e.data) return;
    if (!parseFileUriList(e.data).length && !pathSplitCandidates(e.data).length) return;
    e.preventDefault();
    pastedPathText = e.data;
    lastTextPasteAt = Date.now();
    attachPastedText(e.data);
  });

  // Red del preventDefault de arriba: si el motor insertó el texto igual, se
  // quita acá antes de que se vea. attachPastedText lo repone en el cursor si
  // al final ninguna ruta existía, así que los dos caminos terminan igual.
  messageInput.addEventListener("input", () => {
    if (!pastedPathText) return;
    const text = pastedPathText;
    pastedPathText = "";
    const at = messageInput.value.lastIndexOf(text);
    if (at === -1) return;
    messageInput.value =
      messageInput.value.slice(0, at) + messageInput.value.slice(at + text.length);
    messageInput.setSelectionRange(at, at);
    autoResize();
  });

  // WebKitGTK (Linux) doesn't deliver clipboard images to the DOM paste
  // event; read them from the OS clipboard natively instead. On
  // Windows/macOS the DOM `paste` handler above already attached the image,
  // and read_clipboard_image_core returns null there, so this is a no-op.
  messageInput.addEventListener("keydown", async (e) => {
    const isPaste = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "v" || e.key === "V");
    if (!isPaste) return;
    if (!transport?.capabilities?.native) return;
    try {
      const img = await transport.readClipboardImage();
      if (!img?.data) return;
      if (Date.now() - lastDomImagePasteAt < 500) return; // DOM paste already handled it
      if (Date.now() - lastTextPasteAt < 500) return; // user pasted text, not an image
      addImageFiles([base64ToFile(img.data, img.mimeType)]);
    } catch (err) {
      console.error("[Ompcot] Native clipboard image read failed:", err);
    }
  });

  function renderImagePreviews() {
    imagePreviews.innerHTML = "";
    if (pendingImages.length === 0) {
      imagePreviews.classList.add("hidden");
      return;
    }
    imagePreviews.classList.remove("hidden");
    pendingImages.forEach((img, i) => {
      const el = document.createElement("div");
      el.className = "image-preview";
      el.innerHTML = `
        <img src="data:${img.mimeType};base64,${img.data}" />
        <button type="button" class="image-preview-remove" data-index="${i}">✕</button>
      `;
      el.querySelector(".image-preview-remove").addEventListener("click", () => {
        pendingImages.splice(i, 1);
        renderImagePreviews();
      });
      imagePreviews.appendChild(el);
    });
  }

  function addFilePaths(entries) {
    for (const entry of entries) {
      if (!entry?.path) continue;
      if (pendingFiles.some((f) => f.path === entry.path)) continue; // dedupe
      pendingFiles.push(entry);
    }
    renderFileChips();
  }

  // Un texto pegado no dice si `/home/x/foo` es un archivo o prosa que arranca
  // con "/", ni con qué separador vienen varios archivos. Lo único que lo
  // decide es el disco: se prueban las particiones de la más conservadora a la
  // más agresiva y gana la primera que exista. El isDirectory también sale del
  // backend, así que el ícono del chip nunca se equivoca.
  async function attachPastedText(text) {
    try {
      const uriPaths = parseFileUriList(text);
      if (uriPaths.length) {
        const found = await resolveExistingPaths(uriPaths);
        if (found.length) {
          addFilePaths(found);
          return;
        }
      }
      for (const candidate of pathSplitCandidates(text)) {
        const found = await resolveExistingPaths(candidate);
        if (found.length) {
          addFilePaths(found);
          return;
        }
      }
    } catch (err) {
      console.error("[Ompcot] pasted path lookup failed:", err);
    } finally {
      // Para cuando esto resuelve, la red del listener de `input` o ya corrió o
      // nunca va a correr (el motor respetó el preventDefault). Dejar el flag
      // vivo haría que el próximo tecleo borre el texto que se repone abajo.
      pastedPathText = "";
    }
    insertAtCursor(text);
  }

  function insertAtCursor(text) {
    const start = messageInput.selectionStart ?? messageInput.value.length;
    const end = messageInput.selectionEnd ?? start;
    messageInput.value = messageInput.value.slice(0, start) + text + messageInput.value.slice(end);
    const caret = start + text.length;
    messageInput.setSelectionRange(caret, caret);
    autoResize();
  }

  function renderFileChips() {
    fileChipsEl.innerHTML = "";
    if (pendingFiles.length === 0) {
      fileChipsEl.classList.add("hidden");
      return;
    }
    fileChipsEl.classList.remove("hidden");
    pendingFiles.forEach((f, i) => {
      const el = document.createElement("div");
      el.className = "file-chip";
      const name = f.path.split("/").pop();
      // Nombre y ruta salen del sistema de archivos: nunca por innerHTML.
      // textContent/title escapan también las comillas, cosa que un
      // escapeHtml basado en innerHTML no hace dentro de un atributo.
      el.innerHTML =
        '<span class="file-chip-icon"></span><span class="file-chip-name"></span><button type="button" class="file-chip-remove">✕</button>';
      el.querySelector(".file-chip-icon").textContent = getFileIcon(name, f.isDirectory);
      const nameEl = el.querySelector(".file-chip-name");
      nameEl.textContent = name;
      nameEl.title = f.path;
      el.querySelector(".file-chip-remove").addEventListener("click", () => {
        pendingFiles.splice(i, 1);
        renderFileChips();
      });
      fileChipsEl.appendChild(el);
    });
  }

  // Drag & drop file paths from the sidebar file browser onto the composer input
  messageInput.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    messageInput.classList.add("file-drop-hover");
  });
  messageInput.addEventListener("dragleave", () => {
    messageInput.classList.remove("file-drop-hover");
  });
  messageInput.addEventListener("drop", (e) => {
    e.preventDefault();
    messageInput.classList.remove("file-drop-hover");
    const raw = e.dataTransfer.getData("application/x-ompcot-path");
    if (raw) {
      try {
        addFilePaths([JSON.parse(raw)]);
        return;
      } catch {
        // cae al text/plain
      }
    }
    const text = e.dataTransfer.getData("text/plain");
    if (text?.startsWith("/")) addFilePaths([{ path: text, isDirectory: false }]);
  });

  // Tauri intercepta el drop del SO antes de que llegue al DOM (dragDropEnabled es
  // true por default), así que el handler HTML5 de arriba nunca lo ve en escritorio.
  // El evento nativo sí, y encima trae rutas absolutas reales.
  (async () => {
    const win = window.__TAURI__?.window?.getCurrentWindow?.();
    if (!win?.onDragDropEvent) return;
    await win.onDragDropEvent(({ payload }) => {
      if (payload.type === "enter" || payload.type === "over") {
        messageInput.classList.add("file-drop-hover");
      } else if (payload.type === "leave") {
        messageInput.classList.remove("file-drop-hover");
      } else if (payload.type === "drop") {
        messageInput.classList.remove("file-drop-hover");
        addFilePaths((payload.paths || []).map((p) => ({ path: p, isDirectory: looksLikeDir(p) })));
      }
    });
  })().catch((e) => console.error("[Ompcot] native drag-drop listen failed:", e));

  // Send message (with images)
  let messageQueue = [];

  function clearMessageQueue() {
    messageQueue = [];
    renderQueuedMessages();
  }

  // Prompts are sent fire-and-forget over the WebSocket. The broker replies with
  // `command_undeliverable` (correlated by requestId) when it cannot route the
  // command to a live omp process. We track in-flight prompt requestIds here so the
  // `commandUndeliverable` handler can tell a real dropped prompt apart from
  // background/system commands and recover the user's text. Entries self-expire:
  // the broker decides deliverability synchronously, so anything not reported
  // undeliverable within a few seconds was forwarded successfully.
  const inFlightPrompts = new Map();

  function trackPromptDelivery(requestId, message) {
    if (!requestId) return;
    const timer = setTimeout(() => inFlightPrompts.delete(requestId), 8000);
    inFlightPrompts.set(requestId, { message, timer });
  }

  function refreshSidebarAfterUserPrompt() {
    const refresh = () => {
      sidebar.loadSessions({ quiet: true }).catch(() => {});
      pollInstances().catch(() => {});
    };
    refresh();
    setTimeout(refresh, 500);
    setTimeout(refresh, 1500);
  }

  function sendMessage() {
    if (!currentOnboardingState().canQuery) return;

    const message = messageInput.value.trim();
    if (!message && pendingFiles.length === 0) return;

    messageInput.value = "";
    messageInput.style.height = "auto";

    const text = composePromptText(
      message,
      pendingFiles.map((f) => f.path),
    );

    const cmd = {
      type: "prompt",
      message: text,
    };

    if (pendingImages.length > 0) {
      cmd.images = pendingImages.map((img) => {
        console.log(
          `[Ompcot] Sending image: mimeType=${img.mimeType}, dataLen=${img.data?.length}`,
        );
        return {
          type: "image",
          data: img.data,
          mimeType: img.mimeType || "image/png",
        };
      });
      pendingImages = [];
      renderImagePreviews();
    }

    pendingFiles = [];
    renderFileChips();

    if (state.isStreaming) {
      // Queue it — show as bubble above input
      messageQueue.push(cmd);
      setLastSentMessage(text);
      renderQueuedMessages();
      return;
    }

    setLastSentMessage(text);
    messageRenderer.renderUserMessage({ content: text, images: cmd.images });
    trackPromptDelivery(wsClient.send(cmd), cmd.message);
    refreshSidebarAfterUserPrompt();
  }

  const queuedMessagesEl = document.getElementById("queued-messages");

  function renderQueuedMessages() {
    queuedMessagesEl.innerHTML = "";
    if (messageQueue.length === 0) {
      queuedMessagesEl.classList.add("hidden");
      return;
    }
    queuedMessagesEl.classList.remove("hidden");
    messageQueue.forEach((cmd, i) => {
      const el = document.createElement("div");
      el.className = "queued-msg";
      el.innerHTML = `
        <span class="queued-msg-label">Queued</span>
        <span class="queued-msg-text">${escapeHtml(cmd.message)}</span>
        <button class="queued-msg-cancel" title="Cancel">×</button>
      `;
      el.querySelector(".queued-msg-cancel").addEventListener("click", () => {
        messageQueue.splice(i, 1);
        renderQueuedMessages();
      });
      queuedMessagesEl.appendChild(el);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function flushQueue() {
    if (messageQueue.length > 0 && !state.isStreaming) {
      const cmd = messageQueue.shift();
      messageRenderer.renderUserMessage({ content: cmd.message, images: cmd.images });
      renderQueuedMessages();
      trackPromptDelivery(wsClient.send(cmd), cmd.message);
      refreshSidebarAfterUserPrompt();
    }
  }

  // Plan-mode toggle — Ompcot's own plan mode in the extension, driven over
  // RPC (restricts active tools to a read-only allowlist). The visual state
  // ALWAYS comes from the server response or the `plan_mode_changed`
  // broadcast, never from an optimistic local flip.
  const planToggleBtn = document.getElementById("plan-toggle-btn");
  const planModeBadge = document.getElementById("plan-mode-badge");
  planToggleBtn.title = "Plan mode: restrict tools to read-only";
  let planModeOn = false;
  let planModeInFlight = false;

  function setPlanModeIndicator(enabled) {
    planModeOn = enabled;
    planToggleBtn.classList.toggle("active", enabled);
    planToggleBtn.setAttribute("aria-pressed", String(enabled));
    planModeBadge.classList.toggle("hidden", !enabled);
  }

  async function syncPlanMode() {
    const resp = await rpcCommand({ type: "get_plan_mode" });
    if (resp?.success) setPlanModeIndicator(Boolean(resp.data?.enabled));
  }

  planToggleBtn.addEventListener("click", async () => {
    const decision = planModeClickDecision({
      canQuery: currentOnboardingState().canQuery,
      isStreaming: state.isStreaming,
      inFlight: planModeInFlight,
    });
    if (decision === "ignore") return;
    if (decision !== "toggle") {
      // Sin esto el click era mudo y parecía que el botón estaba roto.
      statusText.textContent = PLAN_MODE_CLICK_MESSAGE[decision];
      setTimeout(() => updateUI(), 3000);
      return;
    }
    planModeInFlight = true;
    try {
      // 12s de tope: el POST puede quedar encolado detrás del turno activo.
      const resp = await rpcCommand(
        { type: "set_plan_mode", enabled: !planModeOn },
        planModeOn ? "Saliendo de Plan mode…" : "Activando Plan mode…",
        { timeoutMs: 12000 },
      );
      // Si falla, el botón no puede quedar mintiendo: se re-sincroniza contra
      // el estado real del servidor en vez de dejar el optimista.
      if (resp?.success) setPlanModeIndicator(Boolean(resp.data?.enabled));
      else await syncPlanMode();
    } finally {
      planModeInFlight = false;
    }
  });

  abortBtn.addEventListener("click", () => {
    abortCurrentRun();
  });

  return {
    clearMessageQueue,
    flushQueue,
    escapeHtml,
    addFilePaths,
    attachPastedText,
    getInFlightPrompt: (requestId) => inFlightPrompts.get(requestId),
    deleteInFlightPrompt: (requestId) => inFlightPrompts.delete(requestId),
    setPlanModeIndicator,
    syncPlanMode,
  };
}
