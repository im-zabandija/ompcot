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

- [ ] [P1] Al cambiar de sección/proyecto quedan datos de la sección anterior
      El directorio mostrado arriba a la derecha a veces corresponde a la
      sección previa, no a la que estoy viendo ahora — parece estado que no
      se resetea al cambiar de sección.

## ✨ Funcionalidades nuevas

<!-- Algo que hoy no existe y querés que se pueda hacer -->

- [ ] [P2] Traducción completa al español + selector de idioma ES/EN
      No solo la UI: también archivos internos que no interactúan con el
      programa pero dan info (ej. el roadmap, heredado del fork original en
      inglés — no se entiende qué dice). Agregar opción para alternar entre
      español e inglés en la app; por ahora solo esos dos idiomas.
- [ ] [P2] Roadmap propio en español con nuestros pedidos e ideas
      Reemplazar/complementar el roadmap heredado del fork (en inglés) por
      uno que refleje nuestros requisitos, pedidos e ideas, para poder ver
      qué sigue y con qué urgencia.
- [ ] [P1] Repositorio propio en GitHub + apuntar el auto-update ahí
      Esto es un fork de un fork; el chequeo de actualización actual apunta
      al primer fork (que no recibe updates). Crear nuestro repo propio y
      que las llamadas de actualización apunten a ese. Mantener el nombre
      "Ompcot" (renombrar todo el código sería mucho quilombo).
- [ ] [P3] Vigilar el repositorio original (upstream) por cambios relevantes
      Además de nuestro repo, tener algo que avise si el proyecto original
      tuvo cambios importantes que convenga traer al nuestro, o hacia dónde
      apunta su rumbo.
- [ ] [P2] Chequeo de actualización de OMP (el runtime) al abrir la sección
      Al abrir una sección/la app, verificar si hay versión nueva de OMP
      disponible. Botón de actualizar en el menú de Ajustes, y un aviso
      (badge/notificación) en el menú principal.
- [ ] [P2] Pegar imagen/archivo del portapapeles directo en el chat (Ctrl+V)
      Hoy hay que ir a buscar el archivo a mano (ej. carpeta de capturas).
      Con Ctrl+V la imagen/archivo del portapapeles debería aparecer directo
      adjunto en el chat, sin salir a buscarlo.
- [ ] [P2] Limpiador de sesiones/secciones abandonadas ("zombies")
      Se acumulan secciones abandonadas ligadas a directorios viejos.
      Agregar una forma de detectarlas y limpiarlas.
- [ ] [P3] Modo "chat rápido" sin crear proyecto/directorio
      Cada sección depende de un directorio, y crear uno solo para una
      consulta rápida es tedioso. Poder iniciar un chat y hablar directo,
      usando un directorio temporal/scratch creado automáticamente, para
      consultas cotidianas que no son trabajo real de proyecto.
- [ ] [P2] Modo plan persistente (toggle, sin escribir /plan)
      Activar "modo plan" como un switch en vez de tener que escribir el
      comando slash cada vez.
- [ ] [P3] Menú de autocompletado al escribir "/"
      Al tipear "/" en el chat, que aparezca la lista de comandos
      disponibles (como en otros GUIs de chat para IA).
- [ ] [P3] Selector de thinking level como menú desplegable
      Hoy cambia con un solo click (cicla los niveles). Quiero un
      dropdown/lista para elegir explícitamente la potencia/enfoque de
      thinking.
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
