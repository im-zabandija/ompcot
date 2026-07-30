/**
 * Estela del caret ("cursor trail"): un smear que persigue el borde de escritura.
 *
 * Vive fuera del subárbol que se repinta — updateStreamingMessage reemplaza el
 * innerHTML de .message-content en cada frame, así que un nodo adentro moriría. El
 * elemento se cuelga del .message y se posiciona absoluto contra él.
 *
 * ponytail: mide con Range.getBoundingClientRect() una vez por frame, lo que fuerza
 * un layout flush. Ya hay uno por frame (scrollToBottom lee scrollHeight después de
 * escribir innerHTML), así que no agrega un reflow nuevo. Si alguna vez molesta, el
 * upgrade es cachear la medición y re-medir sólo cuando cambia el alto del bloque.
 */

const FOLLOW = 0.35; // fracción de la distancia que cierra por frame
const SETTLE_PX = 1.5; // por debajo de esto la estela se apaga
const MAX_ALPHA = 0.45;
const ALPHA_PX = 48; // distancia a la que la estela alcanza MAX_ALPHA

const trails = new WeakMap(); // messageElement -> estado

/** Paso puro del lerp, separado para poder testearlo sin layout real. */
export function nextTrailFrame(curX, targetX, follow = FOLLOW) {
  const moved = curX + (targetX - curX) * follow;
  const dist = Math.abs(targetX - moved);
  const settled = dist < SETTLE_PX;
  return { curX: settled ? targetX : moved, dist, settled };
}

function lastCharRect(root) {
  if (!root) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last = null;
  while (walker.nextNode()) last = walker.currentNode;
  const len = last?.nodeValue?.length ?? 0;
  if (!len) return null;
  // Rango sobre el ÚLTIMO CARÁCTER, no un rango colapsado: un collapsed range puede
  // devolver un rect en cero y dejaría la estela clavada en el origen.
  const range = document.createRange();
  range.setStart(last, len - 1);
  range.setEnd(last, len);
  // Optional chaining: jsdom's Range has no getBoundingClientRect at all (not just a
  // zero-rect) — degrade to null exactly like the "no layout yet" case below.
  const rect = range.getBoundingClientRect?.();
  return rect?.height ? rect : null;
}

export function updateCaretTrail(messageElement, contentRoot) {
  const rect = lastCharRect(contentRoot);
  if (!rect) return;
  const base = messageElement.getBoundingClientRect();
  const x = rect.right - base.left;
  const y = rect.top - base.top;

  let s = trails.get(messageElement);
  if (!s) {
    const el = document.createElement("span");
    el.className = "caret-trail";
    messageElement.appendChild(el);
    s = { el, curX: x, curY: y, x, y, h: rect.height, frame: 0 };
    trails.set(messageElement, s);
  }
  s.x = x;
  s.y = y;
  s.h = rect.height;
  // Corte de línea: un smear diagonal cruzando el párrafo se lee como glitch.
  if (Math.abs(s.curY - y) > 2) {
    s.curX = x;
    s.curY = y;
  }
  if (!s.frame) s.frame = requestAnimationFrame(() => stepTrail(messageElement));
}

function stepTrail(messageElement) {
  const s = trails.get(messageElement);
  if (!s) return;
  s.frame = 0;
  const { curX, dist, settled } = nextTrailFrame(s.curX, s.x);
  s.curX = curX;
  s.curY = s.y;
  if (settled) {
    s.el.style.opacity = "0";
    return;
  }
  s.el.style.transform = `translate(${Math.min(s.curX, s.x)}px, ${s.curY}px)`;
  s.el.style.width = `${dist}px`;
  s.el.style.height = `${s.h}px`;
  s.el.style.opacity = String(Math.min(MAX_ALPHA, dist / ALPHA_PX));
  s.frame = requestAnimationFrame(() => stepTrail(messageElement));
}

export function clearCaretTrail(messageElement) {
  const s = trails.get(messageElement);
  if (!s) return;
  if (s.frame) cancelAnimationFrame(s.frame);
  s.el.remove();
  trails.delete(messageElement);
}
