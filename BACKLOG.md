# Ompcot — Backlog de pedidos

Lista personal de Valentín. Acá vas anotando lo que quieras que se cambie/agregue
en Ompcot, y yo lo voy sacando de acá cuando lo implemento (tachando o moviendo
a "Hecho"). No hace falta que sepas qué archivo toca — describilo en criollo,
como si se lo estuvieras pidiendo a alguien que nunca vio el código.

## Cómo anotar un pedido

Una idea por ítem, dentro de la categoría que más se parezca. Formato:

```
- [ ] Título corto de una línea
      Detalle opcional: qué querés que pase, qué está pasando ahora si es un bug,
      o cualquier ejemplo/referencia que ayude (ej: "como hace VS Code con...").
```

- **Un ítem = una idea.** Si mezclás 3 cosas en un renglón, las separo yo pero
  perdés tiempo — mejor 3 líneas.
- **No hace falta prioridad** si no te importa el orden — agrupo lo que se pueda
  hacer en paralelo y te aviso el plan antes de arrancar. Si SÍ te importa el
  orden, marcá con `[P1]`, `[P2]`, etc. al principio del título.
- Los checkboxes los voy tildando yo a medida que verifico cada cosa (test +
  check + smoke real, como venimos haciendo). Cuando cierre una tanda, muevo
  los tildados a "Hecho" con la fecha, para no perder el historial.
- Si tenés dudas técnicas (no un pedido de cambio, sino una pregunta), van en
  la sección "Preguntas" al final — esas las contesto en el chat, no las "implemento".

---

## 🐛 Bugs

<!-- Algo que está roto o se comporta distinto a lo esperado -->

## ✨ Funcionalidades nuevas

<!-- Algo que hoy no existe y querés que se pueda hacer -->

- [ ] [P2] Traducción completa al español + selector de idioma ES/EN
      No solo la UI: también archivos internos que no interactúan con el
      programa pero dan info (ej. el roadmap, heredado del fork original en
      inglés — no se entiende qué dice). Agregar opción para alternar entre
      español e inglés en la app; por ahora solo esos dos idiomas.
- [ ] [P3] Vigilar el repositorio original (upstream) por cambios relevantes
      Además de nuestro repo, tener algo que avise si el proyecto original
      tuvo cambios importantes que convenga traer al nuestro, o hacia dónde
      apunta su rumbo.
- [ ] [P2] Pegar archivos no-imagen del portapapeles directo en el chat (Ctrl+V)
      Las imágenes ya se pueden pegar así (`app-composer.js:146-181`). Falta
      cubrir el caso de archivos no-imagen del portapapeles, que hoy hay que
      ir a buscar a mano.
- [ ] [P3] Modo "chat rápido" sin crear proyecto/directorio
      Cada sección depende de un directorio, y crear uno solo para una
      consulta rápida es tedioso. Poder iniciar un chat y hablar directo,
      usando un directorio temporal/scratch creado automáticamente, para
      consultas cotidianas que no son trabajo real de proyecto.
- [ ] [P3] Visor de Markdown/HTML para planes generados
      Sección/panel dedicado para ver los planes en modo plan renderizados
      (markdown/HTML), que se abra sin perder el contexto del plan sobre el
      que se está trabajando.

## 🎨 Visual / Temas / Personalización

<!-- Colores, tipografías, animaciones, layout, densidad, lo que se vea o se sienta distinto -->

- [ ] [P3] Animación de tipeo suave en las respuestas del chat
      Hoy el streaming de texto va a los tirones. Quiero impresión suave,
      tipo efecto "cursor ninja" (visto en plugins de Kitty/Obsidian), para
      que la IA "escriba" de forma más agradable a la vista.
- [ ] [P4] Pulida general de la UI del chat inspirada en otros clientes
      Referencia: Hermes Desktop, OpenCode Desktop, etc. Cubre en conjunto
      los ítems de comandos slash, selector de thinking y modo plan de
      arriba — buscar ese nivel de terminación visual.
- [ ] [P3] Sacar la barra de título nativa (minimizar/maximizar/cerrar + nombre)
      Visualmente no combina con la app. Reemplazar por controles custom
      (minimizar/maximizar/cerrar) que aparezcan al pasar el mouse por esa
      zona, en vez de la barra nativa fija.
- [ ] Paneles responsivos
      Que los paneles (barra lateral, chat, etc.) se adapten bien al tamaño de
      la ventana en lugar de quedar fijos o cortados.

## ⚡ Optimización / Rendimiento

<!-- Algo que anda pero lento, pesado, o consume de más -->

- [ ]

## 🔧 Integración nativa (SO, ventanas, notificaciones, atajos)

<!-- Todo lo que toca el lado Rust/Tauri: bandeja, atajos globales, ventanas, notificaciones -->

- [ ]

## ❓ Preguntas / Para discutir

<!-- No es un pedido de cambio, es algo que querés entender o decidir antes de tocar código -->

-

---

## ✅ Hecho

<!-- Acá voy moviendo lo tildado arriba, con fecha, para no perder el historial -->

### 2026-07-27

- [x] **Limpiador de sesiones/secciones abandonadas ("zombies").**
      `public/session-cleanup.js` detecta secciones ligadas a directorios que
      ya no existen y las ofrece limpiar.
- [x] **Pegar imagen del portapapeles directo en el chat (Ctrl+V).**
      `app-composer.js:146-181`: handler DOM `paste` más fallback nativo
      WebKitGTK vía `transport.readClipboardImage()`. Falta la parte de
      archivos no-imagen, que queda pendiente arriba.
- [x] **Adjuntar archivo/carpeta arrastrado al chat como chip, no como ruta de texto.**
      El drop (desde la sidebar de archivos o desde el explorador del SO) ya
      no escribe la ruta cruda en el textarea: aparece como chip con ícono +
      nombre, con la ruta completa en el `title`. El drop del SO se escucha
      con `onDragDropEvent` de Tauri, que hoy interceptaba el evento antes de
      que llegara al DOM.
- [x] **Modelos fijados + recientes en el selector de modelo.**
      Sección "Pinned & recent" arriba del listado general, hasta 3 modelos.
      Pin persistente entre workspaces vía cookie (`themes.js`), porque
      `localStorage` está particionado por puerto y cada workspace corre en
      uno distinto.
- [x] **Roadmap propio en español.**
      `ROADMAP.md` reescrito entero en español, ordenado por urgencia
      (Hecho / Ahora / Después / Ideas heredadas), derivado de este backlog.

### 2026-07-26

- [x] **Eliminar sesiones desde la barra lateral.**
      Click derecho (o el botón `⋯`) sobre una sesión abre el menú contextual
      —que ya existía en el código pero nunca se había cableado— con Archivar y
      Eliminar. Confirmación previa con un modal genérico nuevo
      (`confirm-modal.js`). La sesión activa y las que están streameando no se
      pueden borrar: es el archivo que omp está escribiendo en ese momento.
- [x] **Ordenar las sesiones en la barra lateral.**
      Recientes / Más viejas / Nombre A→Z, persistido en localStorage. Empezó
      siendo un `<select>` nativo y terminó como botón de ícono con dropdown,
      igual que los de modelo y thinking: el select era ancho, desentonaba, y
      encima aplastaba al buscador hasta hacerlo desbordar sobre los botones de
      al lado, que le robaban los clicks al de "abrir carpeta".
- [x] **Ordenar el desorden de la barra lateral de sesiones.**
      Causa raíz de que se viera tosco: el nombre del proyecto y el título de
      la sesión tenían el mismo tamaño (14px), así que nada guiaba la vista. Y
      peor: **ninguna sesión mostraba su título real**. Los tres parsers del
      servidor buscaban entradas `{"type":"session_info","name":…}`, un formato
      que omp ya no escribe (0 coincidencias en disco); el título real vive en
      `{"type":"title","title":…}`. Por eso las 219 sesiones se listaban por su
      primer mensaje truncado. Ahora la lógica está en un solo helper
      (`sessionTitleFromEntry`) con tests, el proyecto pasó a separador discreto
      (11px, mayúsculas, tenue), la sesión es la protagonista (13px), las filas
      bajaron de 38px a 30px, y la sesión activa despliega el primer mensaje.
- [x] **Cambiar el icono de Pi por el de OMP.**
      El SVG oficial, tomado de `omp.sh/favicon.svg` en vez de redibujarlo:
      π con gradiente `#ed4abf → #9b4dff → #5ad8e6` sobre badge `#0f0a14`.
      Actualizados `logo.svg`, `logo-dark.svg`, `favicon.svg` y los 7 PNG
      derivados. De paso el logo dejó de ser decorativo: ahora es el botón de
      nueva sesión, y en hover se atenúa y muestra un `+`.
- [x] **"Abrir carpeta" no hacía nada.**
      Tres bugs encadenados, cada uno tapando al siguiente. (1)
      `tauri-plugin-dialog` trae `default = ["gtk3"]`, y con ese backend rfd
      maneja GTK3 directo: bajo Wayland el chooser nunca mapea ventana y el
      picker resuelve "cancelado" — se cambió a `xdg-portal`, la misma vía que
      usan zenity y el resto de las apps GTK. (2) Sin pasarle la ventana padre,
      el portal no sabía a qué ventana pertenecía el diálogo y el compositor lo
      abría en el otro monitor: se agregó `set_parent`. (3) El buscador del
      header desbordaba sobre el botón y se comía el click.
- [x] **Aviso de actualización del runtime OMP.**
      Distinto del auto-updater de Ompcot: este mira el runtime `omp`
      (`omp update --check`) al arrancar, muestra una pill en el sidebar cuando
      hay versión nueva y una fila en Settings → Updates para instalarla con
      `omp update --force`. Cubre también el pedido de "chequeo al abrir la
      sección": el check corre al levantar el proceso omp, que es cuando se
      abre la sección.
- [x] **Menú de slash commands y selector de thinking.**
      Autocompletado al tipear `/` en el composer (lista curada de los comandos
      nativos), y el control de thinking pasó de botón que cicla a dropdown con
      los 7 niveles canónicos.
- [x] **Modo plan desde la GUI.**
      Ojo con este: el plan mode **nativo** de omp no es alcanzable desde una
      extensión en 17.1.3 — `/plan` sólo lo maneja el `InteractiveMode` de la
      TUI, y la `ExtensionAPI` no expone `get/setPlanModeState` (verificado
      contra el binario). El botón anterior mandaba el texto `/plan` como
      mensaje, que el modelo leía como una pregunta. Se reemplazó por un plan
      mode propio: restringe las tools activas a sólo lectura (`read`, `glob`,
      `grep`, `web_search`, `todo`, `ask`) y restaura las previas al salir. El
      botón refleja el estado real por RPC, no optimista.

### 2026-07-25

- [x] **[P1] Al cambiar de sección/proyecto quedan datos de la sección anterior.**
      Causa raíz: al elegir una sesión de otro proyecto sin proceso vivo, se
      reusaba el proceso omp del proyecto anterior con un switch in-place, y omp
      no re-rootea el proceso en el switch — el directorio (y las tools del
      agente) quedaban apuntando al proyecto viejo. Ahora una selección
      cross-proyecto abre la sesión en un proceso omp dedicado rooteado en su
      propio proyecto, y la pill del header muestra el path del proyecto
      seleccionado al instante (sin flicker con el poll). El switch dentro del
      mismo proyecto sigue siendo in-place, barato como siempre.

### 2026-07-22

- [x] **Repositorio propio en GitHub + apuntar el auto-update ahí.**
      Repo nuevo público en `github.com/im-zabandija/ompcot`, historia completa
      del fork preservada (no un squash). Remote `origin` apunta ahí; el fork
      original queda como remote `upstream` (para el ítem pendiente de
      "vigilar upstream"). `package.json`, `Cargo.toml`, `tauri.conf.json`
      (los 3 lugares donde vive el número de versión) y el endpoint del
      auto-updater actualizados a 0.5.0 + la URL nueva. README actualizado
      (historia del fork + changelog 0.5.0) en inglés y chino. Se debatió
      nombre propio vs. mantener "Ompcot" — se mantiene, cero renombres de
      código/paths/identifiers.
