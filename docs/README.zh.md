# Ompcot

[English](../README.md) | [Español](./README.es.md) | **中文**

本地桌面 GUI，专为 [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) 编程 Agent 打造。无需云端，无需账号，完全在本机运行。

Ompcot 启动时自动查找系统上已安装的 `omp`，无需将其打包进 .app。升级 omp 后，Ompcot 会自动使用最新版本。

> **Fork 自 [Picot](https://github.com/shixin-guo/picot)**（Picot 又是 Tau 的 fork），适配 OMP 替代 Pi。

---

## 安装

[从 GitHub Releases 下载](https://github.com/im-zabandija/ompcot/releases)

**前提条件：** 需要系统上已安装 `omp`。请使用 [omp.sh](https://omp.sh) 提供的平台安装器，或者通过 Bun 安装：

```bash
bun install -g @oh-my-pi/pi-coding-agent
```

### macOS 未签名提示

Ompcot 目前发布的 macOS 版本未经 Apple 开发者 ID 签名/公证，系统可能弹出：

`"Ompcot" 无法打开，因为无法验证开发者。`

**解决方法：**

1. 将 `Ompcot.app` 拖入 `/Applications`
2. 右键点击 → **打开**
3. 若仍被阻止：**系统设置 → 隐私与安全性 → 仍要打开**

---

## 它能做什么

Ompcot 为 OMP 提供完整的可视化界面。打开任意项目文件夹，与 Agent 对话，浏览会话和文件——无需打开终端。多个项目可以并行运行，每个项目有独立窗口和独立 Agent 进程。

---

## 功能特性

### 💬 对话

- 完整 Markdown 渲染，代码块语法高亮
- **流式响应**，实时打字效果（基于 remend）
- 图片附件支持——粘贴、拖放或按钮上传
- 编辑工具调用的**内联 Diff 视图**（红绿行对比）
- 工具调用卡片和**思考块**实时渲染
- 一键复制任意消息
- 滚动到底部按钮，含未读消息提示
- **消息队列** — Agent 工作时可继续输入，消息以气泡形式排队，完成后自动依序发送

### 🗂️ 多会话 & 多 Agent

- **多 Agent 并行** — 每个会话启动独立的 headless omp 进程，不弹新窗口，不中断已有会话
- 从侧边栏浏览并恢复任意历史会话
- 跨所有会话历史**全文搜索**，高亮匹配片段
- 会话按创建时间排序，活跃会话显示绿点
- 内联重命名、收藏、标签和筛选

### 🗃️ 项目与工作区

- **多项目** — 每个项目独立窗口、工作目录、会话历史和 Agent
- 项目头部显示**当前 Git 分支**
- **在外部编辑器中打开** — 直接从 Ompcot 启动 VS Code、Cursor 等
- 原生文件夹选择器，无需使用终端打开项目

### 📱 移动端 & 局域网访问

- **局域网二维码** — 扫码即可在同网络的任意设备上访问 Ompcot；二维码 URL
  包含每次启动时随机生成的访问令牌
- 移动端 URL 优化处理，支持 PWA 安装（iOS/Android 可添加到主屏幕）
- 原生控制 broker 仅监听回环地址；局域网客户端只能访问二维码所指向的、
  受令牌保护的 OMP 会话端点

### 📦 包管理器

- 在 UI 内浏览、安装和删除社区包
- 基于 `omp install`，无需额外命令

### 💰 费用 & 用量面板

- 每个会话实时 Token 用量和费用追踪
- 完整费用面板，含信息栏、趋势图和按模型分类
- **上下文窗口可视化** — 点击 Token 气泡查看已缓存 Token、新输入和可用空间

### 🎨 主题 & 外观

- 六款内置主题：**Dusk（默认）**、Dawn、Midnight、Clean、Terracotta、Sage
- 毛玻璃头部和输入栏（`backdrop-filter: blur`）
- macOS 原生标题栏 overlay 集成
- 支持从顶部**拖动窗口**，媲美原生 App 体验

### 🎤 语音输入

- 输入框中的麦克风按钮，调用 Web Speech API（本地语音识别）
- 实时转录到输入框，录音时红色脉冲动画

### 🗄️ 文件浏览器

- 右侧边栏懒加载文件树
- 浏览目录，原生方式打开文件
- 拖拽文件到输入框以插入路径

### ⚙️ 设置 & 控制

- 模型选择器，支持搜索/筛选和键盘操作
- 思考级别切换（关闭 / 低 / 中 / 高）
- 自动和手动**上下文压缩**，含状态显示
- 推送通知开关

---

## 集成的 OMP 能力

Ompcot 不重新实现 Agent 逻辑——它管理 OMP 子进程，并通过原生 UI 暴露其运行时能力。

- **系统 omp 运行时** — 运行时通过 `OMP_BIN` 或 `PATH` 查找 omp，升级后自动生效
- **流式 RPC 桥接** — 逐 Token 输出、工具调用事件和思考块实时渲染
- **会话生命周期 API** — 创建、切换、恢复会话，完整的按项目历史
- **WebSocket Broker** — 多个 UI 客户端可同时连接同一个 omp 进程
- **扩展兼容** — 自动加载 `~/.omp/agent/extensions/` 和 `.omp/extensions/` 中的用户扩展
- **凭证复用** — 读取 OMP 已有的 `~/.omp/agent/auth.json`，无需单独登录

---

## 工作原理

```
┌──────────────────────────────────────────────────────┐
│ Ompcot .app                                          │
│                                                      │
│   Tauri + OmpManager (Rust)                          │
│      ├─► 启动  omp --mode rpc  (项目 A, :3001)       │
│      ├─► 启动  omp --mode rpc  (项目 B, :3002)       │
│      └─► 每个项目一个 OS 窗口 ──► WebView ──► HTTP   │
│                                                      │
│   resources/                                         │
│      ├─ public/             (前端)                   │
│      └─ extensions/         (embedded-server.mjs)    │
└──────────────────────────────────────────────────────┘
                       │
                       ▼ 读取 / 写入
              ~/.omp/agent/
                 ├─ sessions/   (对话历史)
                 ├─ auth.json   (API 密钥)
                 └─ settings.json
```

Ompcot 启动时通过 PATH 查找 `omp` 二进制，然后以 `omp --mode rpc --extension embedded-server.mjs` 方式启动。该扩展负责 Tauri WebView 所通信的 HTTP + WebSocket 层。Rust 层负责进程生命周期、端口分配和窗口管理。

---

## 使用方法

1. 确保已安装 `omp` 并位于 `PATH`，或设置 `OMP_BIN`
2. 启动 **Ompcot**
3. 点击项目气泡或选择一个文件夹
4. 开始对话 — omp Agent 会自动启动

可在 Ompcot 设置中配置模型凭证，也可以使用 `omp /login` 或直接写入 `~/.omp/agent/auth.json`。

---

## 从源码构建

```bash
git clone https://github.com/im-zabandija/ompcot.git
cd ompcot
bun install --frozen-lockfile
bun run dev      # 启动 tauri dev 热重载
```

发布构建：

```bash
bun run build    # 编译扩展 + tauri build
```

修改 `src-tauri/` 下的文件后：

```bash
bun run check:rust   # cargo check + clippy + fmt（快速，无需完整构建）
```

---

## 上游关系

Ompcot 是 [Picot](https://github.com/shixin-guo/picot)（Picot 又是 Tau 的 fork）的 fork，适配 OMP。主要改动：

- **Pi → OMP 迁移** — 运行时引用、路径和环境变量均使用 OMP
- **系统 OMP 运行时** — 通过 `OMP_BIN` 或 `PATH` 查找 omp，升级 OMP 后无需重建 Ompcot
- **OMP SDK 包** — `@oh-my-pi/pi-coding-agent` 及相关包

---

## License

MIT
