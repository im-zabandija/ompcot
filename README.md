# Ompcot

[English](./README.md) | [Español](./docs/README.es.md) | [中文](./docs/README.zh.md)

A local desktop GUI for the [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) coding agent. No cloud, no account — runs entirely on your machine.

Ompcot uses the `omp` runtime installed on your system. It resolves `OMP_BIN` first and then `omp` from `PATH`, so upgrading OMP does not require rebuilding the app.

> Adapted from [Picot](https://github.com/shixin-guo/picot) (Pi-based, itself a fork of Tau) for OMP instead of Pi — see [Fork history](#fork-history) for the full chain. This repo is a personal, actively-maintained continuation.

---

## Install

[Download from GitHub Releases](https://github.com/im-zabandija/ompcot/releases)

Install OMP before starting Ompcot. Use the installer for your platform from [omp.sh](https://omp.sh), or install the SDK package with Bun:

```bash
bun install -g @oh-my-pi/pi-coding-agent
```

### macOS unsigned release notice

Ompcot currently ships macOS builds without Apple Developer ID signing/notarization. Expected Gatekeeper behavior:

`"Ompcot" cannot be opened because the developer cannot be verified.`

**To allow it:**

1. Drag `Ompcot.app` into `/Applications`
2. Right-click → **Open**
3. If blocked: **System Settings → Privacy & Security → Open Anyway**

---

## What it does

Ompcot gives you a full visual interface for OMP. Open any project folder, start chatting with the agent, browse sessions and files — no terminal required. Multiple projects run in parallel, each in its own window with its own isolated agent process.

---

## Features

### 💬 Chat

- Full markdown rendering with syntax-highlighted code blocks
- **Streaming responses** with live typing indicator (powered by remend)
- Image attachments — paste, drag & drop, or button
- Inline **diff viewer** for edit tool calls (red/green lines)
- Tool-call cards and **thinking blocks** rendered live
- Copy any message with one click
- Scroll-to-bottom button with unread indicator
- **Message queuing** — type while the agent is working; messages queue as pills and auto-send when ready

### 🗂️ Multi-Session & Multi-Agent

- **Multiple agents in parallel** — each session spawns its own headless omp process; no new OS window, no interruption of running sessions
- Browse and resume any past session from the sidebar
- Full-text search across all session history with highlighted snippets
- Sessions sorted by creation time; live session marked with a green dot
- Inline session rename, favourites, tags, and filtering

### 🗃️ Projects & Workspace

- **Multi-project** — each project gets its own window, working directory, session history, and agent
- Shows the **current git branch** in the project header
- **Open in external editor** — launch VS Code, Cursor, or any app directly from Ompcot
- Native folder picker to open any project without touching the terminal

### 📱 Mobile & LAN Access

- **LAN QR code** — scan to open Ompcot on any device on the same network; each
  QR URL carries a random, per-launch access token
- Mobile-optimised URL handling and App Launcher support (installable as PWA on iOS/Android)
- The native control broker is loopback-only; LAN clients can access only the
  token-protected OMP session endpoint represented by the QR code

### 📦 Package Manager

- Browse, install, and remove community packages from within the UI
- Built on top of `omp install` — no separate package commands needed

### 💰 Cost & Usage Dashboard

- Per-session cost tracking with live token/cost metrics
- Full cost dashboard with infobar, trends, and per-model breakdown
- **Context window visualiser** — click the token pill to see cached tokens, fresh input, and available space

### 🎨 Themes & Appearance

- Six built-in themes: **Dusk**, Dawn, Midnight, Clean, Terracotta, Sage
- **Custom accent color** — pick any hex color, applied on top of any theme
- **Font size, density, and sidebar width** — all adjustable and persisted
- **Motion control** — force reduced/full animations independent of OS settings
- Frosted-glass header and input bar (`backdrop-filter: blur`)
- Native macOS title bar overlay integration
- **Window dragging** from the header area — feels like a native app

### 🎤 Voice Input

- Mic button in the input area using Web Speech API (on-device dictation)
- Live transcription into the textarea; pulses red while recording

### 🗄️ File Browser

- Right sidebar with lazy-loaded file tree
- Navigate directories, open files natively
- Drag files onto the input to insert their path

### ⚙️ Settings & Control

- Model picker with search/filter and keyboard support
- Thinking level toggle (off / low / medium / high)
- Auto and manual **context compaction** with status display
- Voice input locale override (independent of OS language)
- Native OS notifications when the agent finishes while unfocused

### 🖥️ OS Integration

- **System tray icon** with a live menu of running instances
- **Global shortcut** (`Cmd/Ctrl+Shift+O`) to focus or open Ompcot from anywhere
- **Single instance** — relaunching focuses the existing window instead of spawning a duplicate
- Window size/position persisted across restarts
- **Quick actions on tool cards** — copy output, expand/collapse all, and re-run bash commands straight from the composer

---

## OMP capabilities integrated

Ompcot does not re-implement agent logic — it manages OMP subprocesses and exposes their capabilities through a native UI.

- **Managed `omp --mode rpc` runtime** — one system OMP process per active workspace/session
- **Streaming RPC bridge** — token-by-token output, tool-call events, and thinking blocks rendered live
- **Session lifecycle APIs** — create, switch, and resume sessions; full per-project history
- **WebSocket broker** — multiple UI clients can connect to the same omp process simultaneously
- **Extension compatibility** — user extensions from `~/.omp/agent/extensions/` and `.omp/extensions/` are auto-loaded
- **Credential reuse** — reads OMP's existing `~/.omp/agent/auth.json`; no separate login needed

---

## How it works

```
┌──────────────────────────────────────────────────────┐
│ Ompcot .app                                          │
│                                                      │
│   Tauri + OmpManager (Rust)                          │
│      ├─► spawn  omp --mode rpc  (project A, :3001)   │
│      ├─► spawn  omp --mode rpc  (project B, :3002)   │
│      └─► OS Window per project ──► WebView ──► HTTP  │
│                                                      │
│   resources/                                         │
│      ├─ public/             (frontend)               │
│      └─ extensions/         (embedded-server.mjs)    │
└──────────────────────────────────────────────────────┘
                       │
                       ▼ reads / writes
              ~/.omp/agent/
                 ├─ sessions/   (chat history)
                 ├─ auth.json   (API keys)
                 └─ settings.json
```

The managed omp process loads `embedded-server.mjs` at startup. That extension owns the HTTP + WebSocket surface the Tauri WebView talks to: static assets, `/api/sessions`, `/api/cost-dashboard`, RPC bridge for prompts, etc. Ompcot's Rust side controls process lifecycle, port allocation, and window management.

---

## Usage

1. Install OMP and ensure `omp` is on `PATH` (or set `OMP_BIN`)
2. Launch **Ompcot**
3. Click a project bubble or pick a folder
4. Start chatting — the managed omp agent starts automatically

Provide model credentials in Ompcot Settings, via `omp /login`, or by writing `~/.omp/agent/auth.json`.

---

## Build from source

```bash
git clone https://github.com/im-zabandija/ompcot.git
cd ompcot
bun install --frozen-lockfile
bun run dev         # start tauri dev with hot reload
```

To make a release build:

```bash
bun run build        # runs build:extensions + tauri build
```

After any changes under `src-tauri/`:

```bash
bun run check:rust   # cargo check + clippy + fmt (fast; no full build needed)
```

## Fork history

Ompcot's lineage: [Tau](https://github.com/deflating/tau) → [Picot](https://github.com/shixin-guo/picot) (Shixin Guo, still actively developed) → [zephyrq-z/ompcot](https://github.com/zephyrq-z/ompcot) (Pi → OMP migration) → [kyle-kw/ompcot](https://github.com/kyle-kw/ompcot) (Windows release fix) → **this repo** (personal continuation, actively maintained). Key changes along the way:

- **Pi → OMP migration** — runtime references, paths, and environment variables use OMP
- **System OMP runtime** — resolves `OMP_BIN` or `omp` from `PATH`; OMP upgrades take effect without rebuilding Ompcot
- **OMP SDK packages** — `@oh-my-pi/pi-coding-agent` and related packages

### 0.5.2

- Repo workflow skills: `fork-watch` (forks/upstream check), `ompcot-commit`
  (bilingual commits), `ompcot-preflight` (release audit)
- Copying an assistant message now preserves the raw markdown (backticks,
  headers, emphasis)
- Plan mode: persistent "Plan mode" badge in the composer and explicit
  feedback when clicking during a turn
- Per-model health probe: "Probar" (⚡) action in the model picker shows
  latency, stop reason and ttft without touching the session

### 0.5.1

- Sidebar sessions: delete (with confirmation) and sort by recent / oldest / name
- Redesigned session list: clearer visual hierarchy, tighter rows, and a first-message preview on the active session
- Fixed session-title parsing: the server looked for a shape OMP no longer writes, so no session ever showed its real name
- "Open folder" opened nothing under Wayland: the dialog now goes through the desktop portal and is anchored to the app window
- OMP runtime update check, installable from Settings → Updates
- Composer: slash-command menu, thinking-level dropdown, and a plan mode that restricts tools to read-only
- Official OMP logo, which doubles as the new-session button

### 0.5.0

- `app.js` split from a 3656-line monolith into 11 focused modules under `public/app-*.js`
- Interactive architecture map: `docs/architecture-map.html`
- Visual customization: accent color, font size, density, sidebar width, motion preference
- Native OS integration: single-instance, window-state persistence, native notifications, system tray, global shortcut (`Cmd/Ctrl+Shift+O`)
- Quick actions on tool cards: copy output, expand/collapse all, re-run bash commands
- Idle-aware polling (6x less network traffic while unfocused)

---

## License

MIT
