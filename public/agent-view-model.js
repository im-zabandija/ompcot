/**
 * Wire → view normalization for agent payloads.
 *
 * The single place that knows the raw OMP shapes (`message.content[]` blocks,
 * `result.content[]`, `result.details`). Renderers consume the objects returned
 * here and never touch the wire format. Pure: no DOM, no imports, no state.
 *
 * Live events and session-history entries expose `content`/`details` at the same
 * level, so one function covers both paths — that's the point of the seam.
 */

/** @returns {string} concatenated text of a user/assistant message. */
export function messageText(message) {
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((block) => block?.type === "text")
    .map((block) => block.text || "")
    .join("\n");
}

/** @returns {string} concatenated thinking blocks, `""` when there are none. */
export function messageThinking(message) {
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((block) => block?.type === "thinking")
    .map((block) => block.thinking || "")
    .join("\n");
}

function imageBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === "image")
    .map((block) => ({
      data: block.data || block.source?.data || "",
      mimeType: block.mimeType || block.source?.media_type || block.media_type || "image/png",
    }));
}

/** @returns {Array<{data: string, mimeType: string}>} attached images. */
export function messageImages(message) {
  return imageBlocks(message?.content);
}

/** `{type:"toolCall", id, name, arguments}` block → tool card input. */
export function toolCallView(block) {
  return {
    toolCallId: block?.id,
    toolName: block?.name,
    args: block?.arguments || {},
  };
}

/**
 * Tool result envelope (live) or `role:"toolResult"` history message → view.
 * `status` vocabulary stays "pending" | "streaming" | "complete" | "error":
 * it doubles as CSS class and visible label in tool-card.js.
 */
export function toolResultView(result, { isError = false, status } = {}) {
  // `details.isError` es la única señal medida que aporta casos que `isError` no cubre:
  // 39 `eval` con Traceback que hoy salen con la card verde. Quedan afuera a propósito
  // `details.timedOut` (4 casos de `hub wait` expirado, que no son errores) y
  // `details.exitCode` (0 casos huérfanos).
  const failed = Boolean(isError || result?.details?.isError === true);
  return {
    status: status || (failed ? "error" : "complete"),
    isError: failed,
    output: toolOutput(result),
    images: imageBlocks(result?.content),
    diff:
      typeof result?.details?.diff === "string" && result.details.diff.length > 0
        ? result.details.diff
        : null,
  };
}

function toolOutput(result) {
  // Sin `content[]` no hay nada que mostrar. El fallback anterior stringificaba el
  // envelope entero, que en historial es el mensaje completo (role, timestamp, details
  // crudo con path y diff) volcado en la caja de output. Ningún emisor de OMP manda un
  // result sin `content[]`: 25.867/25.867 en el corpus de sesiones.
  if (!Array.isArray(result?.content)) return "";
  return result.content
    .filter((block) => block && block.type !== "image")
    .map((block) => (block?.type === "text" ? block.text : JSON.stringify(block)))
    .join("\n");
}
