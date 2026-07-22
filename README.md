# Ompcot

[Español](./README.md) | [English](./README.en.md) | [中文](./README.zh.md)

Una GUI de escritorio local para el agente de coding [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi). Sin nube, sin cuenta — corre enteramente en tu máquina.

Ompcot usa el runtime `omp` instalado en tu sistema. Resuelve primero `OMP_BIN` y después `omp` desde `PATH`, así que actualizar OMP no requiere recompilar la app.

> Adaptado de [Picot](https://github.com/shixin-guo/picot) (basado en Pi, a su vez fork de Tau) para usar OMP en vez de Pi — ver [Historia del fork](#historia-del-fork) para la cadena completa. Este repo es una continuación personal, mantenida activamente.

---

## Instalación

[Descargar desde GitHub Releases](https://github.com/im-zabandija/ompcot/releases)

Instalá OMP antes de arrancar Ompcot. Usá el instalador de tu plataforma desde [omp.sh](https://omp.sh), o instalá el paquete del SDK con Bun:

```bash
bun install -g @oh-my-pi/pi-coding-agent
```

### Aviso: builds de macOS sin firmar

Ompcot hoy distribuye builds de macOS sin firma/notarización de Apple Developer ID. Comportamiento esperado de Gatekeeper:

`"Ompcot" cannot be opened because the developer cannot be verified.`

**Para permitirlo:**

1. Arrastrá `Ompcot.app` a `/Applications`
2. Click derecho → **Open**
3. Si sigue bloqueado: **System Settings → Privacy & Security → Open Anyway**

---

## Qué hace

Ompcot te da una interfaz visual completa para OMP. Abrí cualquier carpeta de proyecto, arrancá a chatear con el agente, navegá sesiones y archivos — sin necesitar terminal. Varios proyectos corren en paralelo, cada uno en su propia ventana con su propio proceso de agente aislado.

---

## Funcionalidades

### 💬 Chat

- Renderizado completo de markdown con bloques de código resaltados por sintaxis
- **Respuestas en streaming** con indicador de tipeo en vivo (impulsado por remend)
- Adjuntar imágenes — pegar, arrastrar y soltar, o botón
- **Visor de diff** inline para tool calls de edición (líneas rojo/verde)
- Tarjetas de tool calls y **bloques de pensamiento** renderizados en vivo
- Copiar cualquier mensaje con un click
- Botón scroll-to-bottom con indicador de no leídos
- **Cola de mensajes** — escribí mientras el agente trabaja; los mensajes se encolan como píldoras y se auto-envían cuando está listo

### 🗂️ Multi-sesión y Multi-agente

- **Múltiples agentes en paralelo** — cada sesión levanta su propio proceso omp headless; sin ventana de SO nueva, sin interrumpir sesiones corriendo
- Navegar y retomar cualquier sesión pasada desde la sidebar
- Búsqueda de texto completo en todo el historial de sesiones con fragmentos resaltados
- Sesiones ordenadas por fecha de creación; la sesión en vivo marcada con un punto verde
- Renombrar sesiones inline, favoritos, tags y filtrado

### 🗃️ Proyectos y Workspace

- **Multi-proyecto** — cada proyecto tiene su propia ventana, directorio de trabajo, historial de sesiones y agente
- Muestra la **rama de git actual** en el header del proyecto
- **Abrir en editor externo** — lanzá VS Code, Cursor, o cualquier app directamente desde Ompcot
- Selector de carpeta nativo para abrir cualquier proyecto sin tocar la terminal

### 📱 Acceso móvil y LAN

- **Código QR de LAN** — escaneá para abrir Ompcot en cualquier dispositivo de la misma red; cada
  URL del QR lleva un token de acceso aleatorio, único por lanzamiento
- Manejo de URLs optimizado para móvil y soporte de App Launcher (instalable como PWA en iOS/Android)
- El broker de control nativo es solo-loopback; los clientes LAN solo pueden acceder al
  endpoint de sesión OMP protegido por token que representa el código QR

### 📦 Gestor de paquetes

- Navegar, instalar y quitar paquetes de la comunidad desde la UI
- Construido sobre `omp install` — sin comandos de paquetes separados

### 💰 Dashboard de costos y uso

- Tracking de costo por sesión con métricas de tokens/costo en vivo
- Dashboard de costos completo con infobar, tendencias, y desglose por modelo
- **Visualizador de context window** — click en la píldora de tokens para ver tokens cacheados, input fresco, y espacio disponible

### 🎨 Temas y apariencia

- Seis temas incluidos: **Dusk**, Dawn, Midnight, Clean, Terracotta, Sage
- **Color de acento personalizado** — elegí cualquier color hex, aplicado por encima de cualquier tema
- **Tamaño de fuente, densidad, y ancho de sidebar** — todos ajustables y persistidos
- **Control de movimiento** — forzar animaciones reducidas/completas independiente de la config del SO
- Header y barra de input con efecto vidrio esmerilado (`backdrop-filter: blur`)
- Integración nativa con la barra de título de macOS
- **Arrastrar la ventana** desde el área del header — se siente como una app nativa

### 🎤 Entrada de voz

- Botón de micrófono en el área de input usando Web Speech API (dictado on-device)
- Transcripción en vivo hacia el textarea; pulsa en rojo mientras graba

### 🗄️ Explorador de archivos

- Sidebar derecha con árbol de archivos de carga diferida
- Navegar directorios, abrir archivos nativamente
- Arrastrar archivos al input para insertar su ruta

### ⚙️ Ajustes y control

- Selector de modelo con búsqueda/filtro y soporte de teclado
- Toggle de nivel de thinking (off / bajo / medio / alto)
- Compactación de contexto automática y manual con estado visible
- Override de locale para entrada de voz (independiente del idioma del SO)
- Notificaciones nativas del SO cuando el agente termina y la ventana no está enfocada

### 🖥️ Integración con el SO

- **Ícono en la bandeja del sistema** con menú en vivo de las instancias corriendo
- **Atajo global** (`Cmd/Ctrl+Shift+O`) para enfocar o abrir Ompcot desde cualquier lado
- **Instancia única** — relanzar enfoca la ventana existente en vez de generar un duplicado
- Tamaño y posición de ventana persistidos entre reinicios
- **Acciones rápidas en tool cards** — copiar output, expandir/colapsar todo, y re-ejecutar comandos bash directo desde el composer

---

## Capacidades de OMP integradas

Ompcot no reimplementa la lógica del agente — gestiona subprocesos de OMP y expone sus capacidades a través de una UI nativa.

- **Runtime `omp --mode rpc` gestionado** — un proceso OMP del sistema por workspace/sesión activa
- **Puente RPC en streaming** — output token por token, eventos de tool-call, y bloques de pensamiento renderizados en vivo
- **APIs de ciclo de vida de sesión** — crear, cambiar, y retomar sesiones; historial completo por proyecto
- **Broker WebSocket** — múltiples clientes UI pueden conectarse al mismo proceso omp simultáneamente
- **Compatibilidad con extensiones** — las extensiones de usuario de `~/.omp/agent/extensions/` y `.omp/extensions/` se cargan automáticamente
- **Reutilización de credenciales** — lee el `~/.omp/agent/auth.json` existente de OMP; sin login separado

---

## Cómo funciona

```
┌──────────────────────────────────────────────────────┐
│ Ompcot .app                                          │
│                                                      │
│   Tauri + OmpManager (Rust)                          │
│      ├─► spawn  omp --mode rpc  (proyecto A, :3001)  │
│      ├─► spawn  omp --mode rpc  (proyecto B, :3002)  │
│      └─► Ventana de SO por proyecto ──► WebView ──► HTTP │
│                                                      │
│   resources/                                         │
│      ├─ public/             (frontend)               │
│      └─ extensions/         (embedded-server.mjs)    │
└──────────────────────────────────────────────────────┘
                       │
                       ▼ lee / escribe
              ~/.omp/agent/
                 ├─ sessions/   (historial de chat)
                 ├─ auth.json   (API keys)
                 └─ settings.json
```

El proceso omp gestionado carga `embedded-server.mjs` al arrancar. Esa extensión posee la superficie HTTP + WebSocket con la que habla el WebView de Tauri: assets estáticos, `/api/sessions`, `/api/cost-dashboard`, puente RPC para prompts, etc. El lado Rust de Ompcot controla el ciclo de vida de procesos, asignación de puertos, y gestión de ventanas.

---

## Uso

1. Instalá OMP y asegurate de que `omp` esté en `PATH` (o seteá `OMP_BIN`)
2. Lanzá **Ompcot**
3. Click en una burbuja de proyecto o elegí una carpeta
4. Arrancá a chatear — el agente omp gestionado arranca automáticamente

Proveé credenciales de modelo en Ompcot Settings, vía `omp /login`, o escribiendo `~/.omp/agent/auth.json`.

---

## Compilar desde el código fuente

```bash
git clone https://github.com/im-zabandija/ompcot.git
cd ompcot
bun install --frozen-lockfile
bun run dev         # arranca tauri dev con hot reload
```

Para hacer un build de release:

```bash
bun run build        # corre build:extensions + tauri build
```

Después de cualquier cambio bajo `src-tauri/`:

```bash
bun run check:rust   # cargo check + clippy + fmt (rápido; sin necesidad de build completo)
```

## Historia del fork

Linaje de Ompcot: [Tau](https://github.com/deflating/tau) → [Picot](https://github.com/shixin-guo/picot) (Shixin Guo, todavía desarrollado activamente) → [zephyrq-z/ompcot](https://github.com/zephyrq-z/ompcot) (migración Pi → OMP) → [kyle-kw/ompcot](https://github.com/kyle-kw/ompcot) (fix de release de Windows) → **este repo** (continuación personal, mantenida activamente). Cambios clave en el camino:

- **Migración Pi → OMP** — referencias de runtime, rutas, y variables de entorno usan OMP
- **Runtime OMP del sistema** — resuelve `OMP_BIN` u `omp` desde `PATH`; las actualizaciones de OMP tienen efecto sin recompilar Ompcot
- **Paquetes del SDK de OMP** — `@oh-my-pi/pi-coding-agent` y paquetes relacionados

### 0.5.0

- `app.js` partido de un monolito de 3656 líneas en 11 módulos enfocados bajo `public/app-*.js`
- Mapa de arquitectura interactivo: `docs/architecture-map.html`
- Personalización visual: color de acento, tamaño de fuente, densidad, ancho de sidebar, preferencia de movimiento
- Integración nativa con el SO: instancia única, persistencia de tamaño/posición de ventana, notificaciones nativas, bandeja del sistema, atajo global (`Cmd/Ctrl+Shift+O`)
- Acciones rápidas en tool cards: copiar output, expandir/colapsar todo, re-ejecutar comandos bash
- Polling consciente de inactividad (6x menos tráfico de red sin foco)

---

## Licencia

MIT
