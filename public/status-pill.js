/**
 * Texto y tooltip de la pill de estado del header.
 *
 * Dos funciones de app.js la pintan — `updateConnectionStatus` (al conectar /
 * desconectar) y `updateUI` (en cada frontera de turno) — y sólo la primera
 * conocía el sufijo `• TS` / `• LAN`. Cualquier `updateUI()` idle lo borraba y
 * encima dejaba el `title` viejo apuntando a una URL que el texto ya no
 * anunciaba; simétricamente, una reconexión del WS a mitad de turno pisaba
 * "Working..." con "Connected". Decidir el texto en un único lugar puro es lo
 * que evita que las dos se vuelvan a desincronizar.
 *
 * El `title` es la URL de conexión disponible y no depende del turno: es el
 * link para compartir, no un estado del agente.
 */
export function statusPillText({ isStreaming = false, tailscaleUrl = "", lanUrl = "" } = {}) {
  const title = tailscaleUrl || lanUrl || "";
  if (isStreaming) return { text: "Working...", title };
  if (tailscaleUrl) return { text: "Connected • TS", title };
  if (lanUrl) return { text: "Connected • LAN", title };
  return { text: "Connected", title };
}
