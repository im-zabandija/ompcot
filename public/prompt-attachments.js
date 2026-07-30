/**
 * Formato de cable de los adjuntos: el composer pega las rutas como líneas al
 * final del prompt y el renderer las vuelve a separar para pintarlas como chips.
 * El texto que ve el agente nunca cambia.
 */

// Una línea de adjunto: ruta absoluta, sin espacios, de al menos dos segmentos.
// POSIX `/a/b`, Windows `C:\a`. Los dos segmentos son a propósito: dejan afuera
// los slash-commands (`/help`, `/plan`), que son mensajes válidos de una línea.
// ponytail: heurística de texto — una ruta con espacios (`/home/x/My Docs/a.md`)
// no matchea y cae a texto plano (comportamiento actual, nunca peor). Techo
// conocido; el upgrade path es mandar los adjuntos como metadata aparte, lo que
// exige cambiar el formato del .jsonl de sesión para que el historial recargado
// los siga viendo.
const ATTACHMENT_LINE = /^(?:\/[^\s/]+\/\S*|[A-Za-z]:[\\/]\S+)$/;

/** El texto final del prompt: el mensaje y, debajo, una ruta por línea. */
export function composePromptText(message, paths) {
  if (!paths?.length) return message;
  const list = paths.join("\n");
  return message ? `${message}\n\n${list}` : list;
}

/** Reverso de composePromptText: `{ text, paths }`. */
export function splitPromptAttachments(content) {
  const text = (content || "").replace(/\r\n/g, "\n").trimEnd();
  if (!text) return { text: "", paths: [] };
  const lines = text.split("\n");
  let start = lines.length;
  while (start > 0 && ATTACHMENT_LINE.test(lines[start - 1])) start--;
  if (start === lines.length) return { text, paths: [] };
  // El bloque tiene que ser todo el mensaje o venir después de una línea en
  // blanco — que es justo lo que produce composePromptText. Si no, es prosa que
  // casualmente termina en una ruta y se deja como texto.
  if (start !== 0 && lines[start - 1] !== "") return { text, paths: [] };
  return { text: lines.slice(0, start).join("\n").trimEnd(), paths: lines.slice(start) };
}

// ponytail: el evento nativo de drag&drop no dice si la ruta es un directorio; se
// infiere por "no tiene extensión". Techo conocido: Makefile / LICENSE muestran
// ícono de carpeta. Es sólo cosmético (nunca cambia lo que se envía); si molesta,
// preguntarle a /api/files antes de pintar el chip.
export const looksLikeDir = (p) => !/\.[^/.]+$/.test(p.split(/[\\/]/).pop() || "");
