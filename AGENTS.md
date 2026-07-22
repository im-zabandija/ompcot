# Ompcot

## Product

**Ompcot** is a local desktop GUI for the OMP coding agent. It is a Tauri app that manages a system-installed `omp` runtime.

### Architecture

Tauri wraps the web UI. A Rust `OmpManager` (`src-tauri/src/omp_manager.rs`) resolves `OMP_BIN` or `omp` from the system `PATH`, then spawns one `omp --mode rpc` subprocess per active workspace/session, each on its own port. Each workspace gets its own OS window. Workspaces are opened via the native folder picker ("Open Folder"); clicking it opens or focuses a workspace window. Multi-project, multi-agent, no terminal required.

```
Ompcot .app
  resources/
    public/                       (frontend)
    extensions/embedded-server.mjs (HTTP + WS server, runs inside omp)
  Rust OmpManager
    spawn omp --mode rpc --extension embedded-server.mjs  (project A, :3001)
    spawn omp --mode rpc --extension embedded-server.mjs  (project B, :3002)
    OS Window per project  →  WebView  →  localhost:300X
  WebSocket broker + native control handler manage lifecycle operations
```

Frontend lifecycle operations go through `public/transport.js` as
`broker_control` messages. Rust installs the native control handler in
`src-tauri/src/main.rs`; `cmd_retry_startup` is the only remaining direct Tauri
IPC command.

### Goals

- Local desktop GUI: all projects and agents visible in one app
- Multi-project: each project has its own window, isolated working directory, session history, and running agent
- Multi-agent: spawn new agents per project; switch between sessions without leaving the app
- Multi-task: a `omp --mode rpc` process can only drive **one active session at a time** (switching/forking inside one process *replaces* the active session — the old `.jsonl` is preserved on disk, but it stops being the live, running session). So every concurrently-running session structurally needs its own `omp` process. Ompcot handles this without spawning OS windows: both "+ New Session" (header) and "start new chat" (sidebar project tile) spawn a fresh **headless** omp for the target cwd and navigate the current window's WebView to it. The previously-attached omp process keeps running in the background (OmpManager retains it; reachable from the running-instances list / launcher / sidebar). Net effect: no new OS window, no interruption of the previously-running session, and you can still run multiple agents in parallel against the same project.
- Visualization: streaming chat, tool-call cards, thinking blocks, token/cost tracking per session
- Use the user's installed OMP runtime so OMP upgrades do not require rebuilding Ompcot

### Constraints

- Frontend: vanilla JS, no framework (`public/`)
- Backend: Rust (Tauri) wraps + manages process lifecycle; Node.js extension (`embedded-server.ts`) implements the HTTP + WS surface the WebView talks to
- OMP integration: always via a managed `omp --mode rpc` subprocess — never re-implement OMP runtime logic
- Session history and working directory are isolated per project/port
- The resolved system OMP version is the source of truth: Rust runs `omp --version` and forwards it through `OMCOT_OMP_VERSION`.
- User extensions under `~/.omp/agent/extensions/` and `<workspace>/.omp/extensions/` are auto-loaded by OMP.
- The native WebSocket broker is loopback-only and accepts browser connections only from loopback origins.
- Rust generates a random `OMCOT_ACCESS_TOKEN` for every app launch. All embedded `/api/*` and `/ws` requests must present it; LAN QR URLs carry it to mobile clients.

### OMP references

- Repository: `https://github.com/can1357/oh-my-pi`
- SDK package: `@oh-my-pi/pi-coding-agent`
- SDK documentation: `https://github.com/can1357/oh-my-pi/blob/main/docs/sdk.md`

---

# Agent working notes

Conventions for any coding agent working in this directory.

## Package manager

Use **Bun** exclusively. Never run `npm install` or `npm ci` — this would create a stray `package-lock.json` that drifts from `bun.lock` and confuses CI (`bun install --frozen-lockfile`).

```bash
bun install --frozen-lockfile   # install deps
bun run <script>                # run package.json scripts
```

## Common commands

```bash
bun run dev              # start tauri dev (requires omp on PATH or OMP_BIN)
bun run test             # vitest run + check-tauri-permissions
bun run test:watch       # vitest in watch mode
bun run check:rust       # cargo check + clippy + fmt (use after every Rust edit)
bun run build:extensions # compile extensions/embedded-server.ts → dist/embedded-server.mjs
bun run build            # full release build (runs prebuild: build:extensions)
```

Single test file: `bun run vitest run public/settings-save-status.test.js`

## Known dev-environment issues (Linux / sandboxed or GPU-less hosts)

`bun run dev` can fail with two infra issues unrelated to app code, both seen
running Ompcot inside a container/sandbox that shares `$DISPLAY` with the host
but has no real GPU passthrough:

1. **Extension fails to load: `Cannot find package 'dijkstrajs'`.** In debug
   builds `OmpManager` prefers the raw `extensions/embedded-server.ts` source
   (loaded by omp's own TS loader) over the bundled `.mjs` — see
   `resolve_embedded_extension_path` in `src-tauri/src/omp_manager.rs`. That
   loader can fail to resolve `dijkstrajs` (a transitive dep of `qrcode`, used
   for the LAN QR feature) even though it's present in `node_modules`. The omp
   subprocess then dies and Ompcot times out waiting for `/api/health`.
   Workaround: bundle the extension and force that path via the env var that
   `resolve_embedded_extension_path` checks first:
   ```bash
   bun run build:extensions
   OMCOT_EXTENSION="$(pwd)/extensions/dist/embedded-server.mjs" bun run dev
   ```
2. **WebKitGTK crashes in a loop** (`WebKit encountered an internal error`,
   `WebLoaderStrategy.cpp`) when the webview tries to render — typical of
   VMs/containers without a real DMABUF/EGL-capable compositor. Fix: set
   before launching:
   ```bash
   WEBKIT_DISABLE_DMABUF_RENDERER=1
   ```
   (`WEBKIT_DISABLE_COMPOSITING_MODE=1` and `LIBGL_ALWAYS_SOFTWARE=1` are
   the usual companions if that alone isn't enough.)

Combined recipe that boots Ompcot end-to-end on such a host:
```bash
cd ~/Projects/ompcot
bun run build:extensions
OMCOT_EXTENSION="$(pwd)/extensions/dist/embedded-server.mjs" \
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
bun run dev
```

**Rust toolchain on Fedora (no `rustup`):** this repo's `cargo`/`rustc` can
come from `dnf` instead of `rustup`, in which case `rustup component add
clippy` doesn't exist. Install clippy with `sudo dnf install clippy` (package
`clippy.x86_64`) — **not** `cargo install clippy` (that resolves to an unrelated
placeholder crate on crates.io, not the real linter). `cargo fmt`/`rustfmt` may
likewise be absent; per `bun run check:rust` above this is advisory-only and
does not block the script.

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for JS/TS linting and formatting.

After every frontend or extension edit, run the check before declaring the work done:

```bash
bun run check         # lint + format check (read-only, shows violations)
bun run check:fix     # auto-fix all safe issues
bun run lint          # lint only
bun run format        # format check only
bun run format:fix    # auto-fix formatting
```

### Rules

- **Always** run `bun run check` after editing any `.js` / `.ts` file under `public/` or `extensions/`.
- Only mark the task complete if `bun run check` exits 0 (or all remaining violations are intentional and documented).
- Prefer `bun run check:fix` over manual reformatting — Biome is the source of truth for style.

## Module Design

The frontend (`public/`) is vanilla JS with **no framework**. Keep it modular:

- **One concern per file.** Each module owns a single responsibility (e.g. WebSocket client, session sidebar, file browser, theme switching). Do not add unrelated logic to an existing file just because it is convenient.
- **Avoid growing `app.js`.** `app.js` is the entry point / orchestrator. New feature logic belongs in a dedicated module that `app.js` imports, not inline in `app.js` itself.
- **New file threshold.** If a feature adds more than ~50 lines of logic, extract it into its own module (e.g. `public/my-feature.js`) and import it from the appropriate entry point.
- **No shared-state side-effects at import time.** Modules should export functions/classes; side-effects that mutate global state should be triggered explicitly by the caller, not at module load.
- **Naming.** Use kebab-case filenames that match the single responsibility (`session-sidebar.js`, `file-browser.js`, `workspace-actions.js`).

## Architecture

Ompcot is a Tauri v2 app. The three main layers:

**1. Rust / Tauri (`src-tauri/`)** — process lifecycle, window management, and OS integration.
- `src-tauri/src/omp_manager.rs` — `OmpManager` spawns one `omp --mode rpc` subprocess per workspace, each on its own port. Manages port allocation, process lifecycle, and RPC message forwarding.
- `src-tauri/src/main.rs` — native `broker_control` handler wired to `OmpManager`, window management, folder picker, updater, startup, tray icon (dynamic menu of live instances), and global shortcut (`CmdOrCtrl+Shift+O` focuses/opens the main window).
- Tauri plugins beyond the defaults (dialog/fs/shell/updater/process/log): `single-instance` (must stay first in the plugin chain), `window-state` (registered first in `.setup()`, before any window is created), `notification` (`show_notification` broker command, mirrored by `transport.showNotification()`), `tray-icon` (core feature, not a plugin — enabled via the `tauri` dep's `features` array), `global-shortcut`.

**2. Frontend (`public/`)** — vanilla JS, no framework. `app.js` is the
orchestrator (~1180L): bootstrap, instance construction, the `setupXxx()`
calls below in order, high-level WebSocket listeners, and the `Initialize`
sequence at the end. Each concern beyond that lives in its own module,
following the factory pattern (`setupXxx({ ...deps }) → { ...exports }`,
see `app-workspace-header.js` for a documented example of the pattern,
including how to thread mutable app.js state through getters/setters):
- `app-swap-overlay.js` — full-page transition overlay during instance swaps.
- `app-workspace-header.js` — workspace/git-branch header pills + "open in app" menu.
- `app-settings-panel.js` — Settings panel open/close/tabs, theme grid, Appearance controls (accent/font/density/sidebar-width/motion), updater hookup.
- `app-command-palette.js` — command palette (`Ctrl/Cmd+K`), RPC command helpers, session stats.
- `app-model-picker.js` — model dropdown + thinking-level cycling.
- `app-keyboard-shortcuts.js` — global keyboard shortcut bindings.
- `app-composer.js` — textarea autoresize, image attach/paste/drop, message queue, `sendMessage`, abort.
- `app-lan-qr.js` — LAN QR sharing modal.
- `app-package-browser.js` — community package browse/search/install.
- `app-rpc-events.js` — `handleRPCEvent` and all `handleAgentStart/End`, `handleMessage*`, `handleToolExecution*` handlers; native notification on agent-end when unfocused.
- `app-session-routing.js` — session selection, mirror-mode sync, live-instance polling (`pollInstances`, gated by `poll-gating.js`), session history rendering.
- `websocket-client.js` — WebSocket client for streaming chat with OMP.
- `state.js` — shared app state.
- `transport.js` — sends lifecycle and native operations through the WebSocket broker (includes `showNotification`, `openInApp`, `listInstalledApps`).
- `message-renderer.js`, `tool-card.js`, `markdown.js` — chat message rendering; `tool-card.js` has a real LCS diff viewer and copy/expand/re-run actions on tool cards.
- `session-sidebar.js` — session history list.
- `file-browser.js` — lazy-loaded file tree sidebar.
- `dialogs.js`, `workspace-actions.js` — modal dialogs and workspace actions.
- `themes.js` — 6 built-in themes + user overrides (accent color, font size, density, sidebar width, motion preference), all persisted in cross-port cookies.
- `poll-gating.js` — pure `shouldPoll(hasFocus, msSinceLastPoll)` used by the polling ticker in `app-session-routing.js`.

**When adding a new frontend feature**, extend the closest existing module by
concern (e.g. a new Settings control → `app-settings-panel.js`; a new agent
event handler → `app-rpc-events.js`) rather than adding to `app.js`. Only
create a new `app-*.js` module when the feature doesn't fit any existing one
(see Module Design above for the ~50-line threshold).

**3. Embedded server (`extensions/`)** — TypeScript compiled to `dist/embedded-server.mjs`.
- Runs **inside** the `omp --mode rpc` process as a omp extension
- Owns the HTTP + WebSocket surface the Tauri WebView talks to: static asset serving, `/api/sessions`, `/api/cost-dashboard`, RPC bridge for prompts

## Key data flows

- User action → `transport.js` → WebSocket `broker_control` → Rust native control handler → OmpManager → `omp --mode rpc`
- Chat messages → WebSocket (websocket-client.js) → embedded-server.mjs (inside omp) → omp RPC
- Embedded API/WS requests → per-launch token validation → embedded-server.mjs; the frontend removes token and broker query parameters from the visible URL after persisting them in session storage.
- Multi-session: "+ New Session" spawns a **headless** omp process (no new OS window) and navigates the current WebView to it. The old omp process keeps running.

## OMP runtime resolution

`OmpManager` resolves the runtime in this order:

1. `OMP_BIN`, when set to an existing file.
2. `omp` (`omp.exe` on Windows) from the system `PATH`.

The app bundles the frontend and `embedded-server.mjs`, but not the OMP binary. Release and development environments must have OMP installed.

## Post-fix verification (Rust / Tauri)

After every edit under `src-tauri/` (or any Rust fix), run the lint+check script before declaring the work done. It catches compile-time errors (e.g. `E0282`, `E0061`, Tauri v1→v2 API drift, deprecated APIs) without producing a binary, so it is much faster than `tauri build`.

```bash
bun run check:rust
```

`scripts/check-rust.js` runs, in order:

1. `cargo check --all-targets` — type/borrow/API signature check (~1–5s).
2. `cargo clippy --all-targets -- -D warnings` — lints, warnings as errors.
3. `cargo fmt --check` — advisory only; prints a hint if formatting drifts, but does not fail the script.

### Rules

- **Never** run `tauri build` / `cargo build` just to verify a fix — use `bun run check:rust` instead. Per project policy, full builds are not used for verification.
- After editing any `*.rs` file under `src-tauri/`, run `bun run check:rust` and only mark the task complete if it exits 0.
- When upgrading Tauri or its plugins, run the script first to surface any deprecation warnings before touching feature code.

## Auto-updater

Ompcot includes the Tauri v2 updater plugin, but the Windows-only release
workflow currently publishes NSIS/MSI installers without updater artifacts.
`.github/workflows/release.yml` applies
`src-tauri/tauri.ci-unsigned.conf.json` so an invalid updater signing secret
cannot discard otherwise valid installers.

To restore automatic updates, generate a Tauri updater key pair, update
`plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, configure the matching
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub
Actions secrets, then remove the unsigned CI override and re-enable updater
JSON generation in the workflow.

## Tests

Vitest tests live in `public/` as `*.test.js` files (jsdom environment). The full `bun run test` also runs `scripts/check-tauri-permissions.js` to validate Tauri capability permissions.
