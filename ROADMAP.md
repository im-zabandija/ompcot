# Roadmap de Ompcot

Este archivo es la vista ordenada por urgencia de lo que se pide en `BACKLOG.md`.
No agregues ideas acá directamente: anotalas en `BACKLOG.md` y esta vista se
actualiza cuando se cierra una tanda de trabajo.

---

## Hecho

- Chips de adjunto en el composer: soltar un archivo/carpeta (desde la sidebar
  o desde el explorador del SO) ya no escribe la ruta cruda en el textarea,
  aparece como chip con ícono + nombre (2026-07-27).
- Modelos fijados y recientes arriba del listado en el selector de modelo,
  con pin persistente entre workspaces vía cookie (2026-07-27).
- Roadmap propio en español, este mismo archivo, derivado de `BACKLOG.md`
  (2026-07-27).
- Pegar imágenes del portapapeles directo en el chat con Ctrl+V
  (`app-composer.js:146-181`) (2026-07-27).
- Limpiador de sesiones/secciones abandonadas ("zombies"),
  `public/session-cleanup.js` (2026-07-27).
- Chequeo de actualización del runtime OMP al arrancar, con pill en la
  sidebar y botón de instalar en Settings → Updates (2026-07-26).
- Modo plan como toggle en la GUI, sin escribir `/plan` a mano (2026-07-26).
- Menú de autocompletado de slash commands y selector de thinking level como
  dropdown (2026-07-26).
- Eliminar sesiones desde la barra lateral con confirmación (2026-07-26).
- Ordenar las sesiones de la barra lateral (recientes / más viejas / A→Z)
  (2026-07-26).
- Jerarquía visual de la barra lateral de sesiones y títulos reales de sesión
  en vez del primer mensaje truncado (2026-07-26).
- Ícono de Ompcot propio reemplazando al de Pi (2026-07-26).
- Fix de "Abrir carpeta", que no hacía nada bajo Wayland (2026-07-26).
- Fix del bug donde al cambiar de sección/proyecto quedaban datos de la
  sección anterior (2026-07-25).
- Repositorio propio en GitHub y auto-update apuntando ahí (2026-07-22).

## Ahora (P2)

- Traducción completa ES/EN de la app (UI + archivos internos) con selector
  de idioma.
- Pegar archivos no-imagen del portapapeles con Ctrl+V.

## Después (P3)

- Vigilar `picot` (el original vivo), no `upstream` (congelado), por cambios
  relevantes a traer — sólo su `public/`, que es nuestro mismo linaje vanilla
  JS; su capa de extensión migró a Pi y ya no nos sirve.
- Bandeja de atención unificada: una sola vista que junte approvals,
  preguntas y confirmaciones de todas las sesiones (visto en t4-code y
  MTEnt/omp-desktop).
- Terminal PTY nativa embebida — antes "terminal embebida xterm.js", ahora con
  referencia concreta del mismo stack: Omnividente/omp-desktop (Tauri + Rust).
  Ver el ítem en `BACKLOG.md` por los dos renderers candidatos (xterm.js o
  ghostty-web).
- Chat rápido sin crear proyecto, usando un directorio scratch automático.
- Visor de Markdown/HTML para los planes generados en modo plan.
- Animación de tipeo suave en las respuestas del chat.
- Sacar la barra de título nativa y reemplazarla por controles custom.

## Cuando toque (P4 y sin prioridad)

- Pulida del chat: base de tokens y checker de diseño, resaltado de sintaxis,
  diff real del `edit`, tipografía monoespaciada unificada (P4.1-P4.4), y 13
  sub-ítems más anotados en el backlog (P4.5-P4.17).
- Stats por turno en el chat: tokens in/out, costo, tokens/segundo (visto en
  MTEnt/omp-desktop).
- Panel de "archivos que tocó el agente" con sus diffs (MTEnt, Ran1sss/OMP-IDE).
- Visor de diffs multi-archivo estilo VS Code (Vincent-Huang-2000/oh-my-pi-desktop).
- Árbol de sesiones padre/hijo navegable (BRCOO/ohmypi-craft).
- Acciones masivas sobre sesiones: multi-selección para archivar/borrar/etiquetar (BRCOO).
- Anotaciones de follow-up: seleccionar un pedazo de respuesta, anotarlo y
  mandarlo citado como siguiente mensaje (BRCOO).
- Failover automático de modelo al agotarse la cuota, manteniendo el thinking
  level (Ran1sss/OMP-IDE).
- Aprobaciones y preguntas del agente inline en el chat, en vez de modales
  aparte (patrón de Hermes One).
- Slider de esfuerzo de pensamiento (Faster↔Smarter) en vez del dropdown de 7
  niveles (picot, Hermes One, t4-code).
- Sistema de tokens de 3 capas a largo plazo (modelo de OpenCode Desktop:
  paletas crudas + capa semántica + alias).
- Paneles responsivos que se adapten bien al tamaño de la ventana.

## Ideas heredadas que seguimos queriendo

- Panel de preview de archivos: split pane contextual que muestra código,
  imágenes, HTML en vivo o Markdown renderizado según lo que edita el agente.
- Equipos de agentes integrados en la web UI, con agrupación visual y
  live-switch entre agentes.
- Visualización de forks/branches de conversación como árbol, para volver a
  cualquier punto y probar otro camino.
- Dashboard de costos: gasto en el tiempo, por modelo y por proyecto.
- Plantillas de sesión: arrancar una sesión nueva pre-cargada con contexto de
  un proyecto (CLAUDE.md, directorio de trabajo, prompt inicial).
- A/B testing multi-modelo: mandar el mismo prompt a dos modelos y comparar
  las respuestas lado a lado.
- Terminal PTY nativa embebida — promovida a P3 (ver arriba). Referencia
  concreta del mismo stack: `Omnividente/omp-desktop` (Tauri + Rust,
  `portable-pty`); renderer candidato: `xterm.js` o `ghostty-web`.
