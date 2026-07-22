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
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
  });

  // Image attachment
  const attachBtn = document.getElementById("attach-btn");
  const imageInput = document.getElementById("image-input");
  const imagePreviews = document.getElementById("image-previews");
  let pendingImages = []; // Array of { data: base64, mimeType: string }

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

  // Paste images
  messageInput.addEventListener("paste", (e) => {
    const files = [];
    for (const item of e.clipboardData.items) {
      if (!item.type.startsWith("image/")) continue;
      files.push(item.getAsFile());
    }
    if (files.length) addImageFiles(files);
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
        <button class="image-preview-remove" data-index="${i}">✕</button>
      `;
      el.querySelector(".image-preview-remove").addEventListener("click", () => {
        pendingImages.splice(i, 1);
        renderImagePreviews();
      });
      imagePreviews.appendChild(el);
    });
  }

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
    if (!message) return;

    messageInput.value = "";
    messageInput.style.height = "auto";

    const cmd = {
      type: "prompt",
      message,
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

    if (state.isStreaming) {
      // Queue it — show as bubble above input
      messageQueue.push(cmd);
      setLastSentMessage(message);
      renderQueuedMessages();
      return;
    }

    setLastSentMessage(message);
    messageRenderer.renderUserMessage({ content: message, images: cmd.images });
    trackPromptDelivery(wsClient.send(cmd), message);
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

  abortBtn.addEventListener("click", () => {
    abortCurrentRun();
  });

  return {
    clearMessageQueue,
    flushQueue,
    escapeHtml,
    getInFlightPrompt: (requestId) => inFlightPrompts.get(requestId),
    deleteInFlightPrompt: (requestId) => inFlightPrompts.delete(requestId),
  };
}
