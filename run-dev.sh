#!/usr/bin/env bash
# Levanta Ompcot en modo dev con la receta de Linux/WebKitGTK del AGENTS.md:
#  - bundlea el embedded server y fuerza ese .mjs (evita el fallo "Cannot find
#    package 'dijkstrajs'" del loader TS en debug),
#  - desactiva el DMABUF renderer de WebKit (evita el crash loop en hosts sin
#    GPU passthrough real).
# Uso: ./run-dev.sh   (o doble-click al acceso directo "Ompcot (dev)")
set -uo pipefail

# Lanzado desde el menú de apps, el entorno NO sourcea ~/.bashrc, así que bun
# (~/.bun/bin) y omp (~/.local/bin) no están en PATH. Los agrego a mano.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.npm-global/bin:$PATH"

# Mantiene la terminal abierta para poder leer el error (si no, se cierra sola).
pause() { echo; read -r -p "Presioná Enter para cerrar... "; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR" || { echo "error: no pude entrar a $REPO_DIR" >&2; pause; exit 1; }

# Runtime OMP: hace falta 'omp' en PATH o OMP_BIN apuntando al binario.
if [[ -z "${OMP_BIN:-}" ]] && ! command -v omp >/dev/null 2>&1; then
  echo "error: no encuentro 'omp' en PATH ni OMP_BIN. Instalá el runtime OMP o exportá OMP_BIN." >&2
  pause; exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "error: falta 'bun' en PATH." >&2
  pause; exit 1
fi

echo "==> bundleando embedded server..."
if ! bun run build:extensions; then
  echo "error: fallo build:extensions" >&2
  pause; exit 1
fi

export OMCOT_EXTENSION="$REPO_DIR/extensions/dist/embedded-server.mjs"
export WEBKIT_DISABLE_DMABUF_RENDERER=1
# Si aún así WebKit crashea en un host sin GPU real, descomentá estos dos:
# export WEBKIT_DISABLE_COMPOSITING_MODE=1
# export LIBGL_ALWAYS_SOFTWARE=1

# Ompcot usa el plugin single-instance: si ya hay una corriendo, este lanzamiento
# sólo le da foco a la ventana vieja y sale enseguida. Sin aviso parece que "no
# se aplicaron los cambios", cuando en realidad nunca llegó a levantar el build
# nuevo.
viejos="$(pgrep -f 'target/(debug|release)/ompcot' || true)"
if [[ -n "$viejos" ]]; then
  echo "==> OJO: ya hay Ompcot corriendo (pid: $(echo "$viejos" | tr '\n' ' '))."
  echo "    single-instance haría que esto sólo enfoque esa ventana y salga,"
  echo "    así que seguirías viendo el build VIEJO."
  read -r -p "    ¿Cierro la instancia vieja y sigo? [S/n] " resp
  if [[ "${resp:-s}" =~ ^[SsYy]$|^$ ]]; then
    pkill -f 'target/(debug|release)/ompcot' || true
    # El kill_all() de Ompcot sólo corre en RunEvent::Exit, no con un SIGTERM
    # externo, así que sus omp hijos quedarían huérfanos ocupando el puerto.
    pkill -f 'omp .*--mode rpc' || true
    sleep 2
    echo "    listo, instancia vieja cerrada."
  else
    echo "    ok, no toco nada. Cerrá la ventana vieja y volvé a intentar."
    pause; exit 1
  fi
fi

echo "==> levantando Ompcot (tauri dev)... la primera vez compila el Rust, aguantá."
bun run dev
status=$?

echo
echo "Ompcot terminó (exit=$status)."
pause
exit "$status"
