/**
 * Envuelve la palabra en curso de un render de streaming en
 * <span class="stream-tail"> para que el CSS pueda ablandar el borde de escritura.
 *
 * Se llama después de cada repintado de innerHTML: el span se recrea en cada frame,
 * así que NO lleva animación ni transición (una animación reiniciada 60 veces por
 * segundo estroboscopa, y una transición no correría nunca). El efecto lo da el
 * cambio de estado atenuada → sólida cuando la palabra se completa.
 *
 * Devuelve el span creado, o null si no había nada que marcar.
 */
export function markStreamTail(container) {
  if (!container) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let last = null;
  while (walker.nextNode()) last = walker.currentNode;
  if (!last) return null;
  // En código el degradado se lee como glitch (monoespaciado + spans de sintaxis).
  if (last.parentElement?.closest("pre, code, .code-block-wrapper")) return null;
  const text = last.nodeValue ?? "";
  const cut = text.search(/\S+$/); // inicio de la palabra en curso
  if (cut < 0) return null; // termina en whitespace: no hay palabra a medio escribir
  const span = document.createElement("span");
  span.className = "stream-tail";
  span.textContent = text.slice(cut);
  last.nodeValue = text.slice(0, cut);
  last.parentNode.insertBefore(span, last.nextSibling);
  return span;
}
