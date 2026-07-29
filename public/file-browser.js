/**
 * File Browser — right sidebar file tree with drag-and-drop
 */

const FILE_ICONS = {
  // Folders
  directory: "📁",
  // Code
  js: "📄",
  ts: "📄",
  jsx: "📄",
  tsx: "📄",
  py: "🐍",
  rb: "💎",
  go: "📄",
  rs: "🦀",
  // Web
  html: "🌐",
  css: "🎨",
  svg: "🎨",
  // Data
  json: "📋",
  yaml: "📋",
  yml: "📋",
  toml: "📋",
  xml: "📋",
  csv: "📋",
  // Docs
  md: "📝",
  txt: "📝",
  rst: "📝",
  // Images
  png: "🖼️",
  jpg: "🖼️",
  jpeg: "🖼️",
  gif: "🖼️",
  webp: "🖼️",
  ico: "🖼️",
  // Config
  env: "🔒",
  gitignore: "🔒",
  lock: "🔒",
  // Default
  default: "📄",
};

export function getFileIcon(name, isDirectory) {
  if (isDirectory) return FILE_ICONS.directory;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export class FileBrowser {
  constructor(container, pathEl) {
    this.container = container;
    this.pathEl = pathEl;
    this.currentPath = null;
  }

  async load(dirPath) {
    this.container.innerHTML = '<div class="file-loading">Loading…</div>';

    try {
      const url = dirPath ? `/api/files?path=${encodeURIComponent(dirPath)}` : "/api/files";
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        this.container.innerHTML = `<div class="file-loading">${data.error}</div>`;
        return;
      }

      this.currentPath = data.path;
      this.pathEl.textContent = data.path;
      this.pathEl.title = data.path;
      this.render(data.items);
    } catch (_err) {
      this.container.innerHTML = '<div class="file-loading">Failed to load</div>';
    }
  }

  getParentPath() {
    if (!this.currentPath) return null;
    const parts = this.currentPath.split("/");
    parts.pop();
    return parts.join("/") || "/";
  }

  render(items) {
    this.container.innerHTML = "";

    if (items.length === 0) {
      this.container.innerHTML = '<div class="file-loading">Empty directory</div>';
      return;
    }

    for (const item of items) {
      const el = document.createElement("div");
      el.className = `file-item${item.isDirectory ? " directory" : ""}`;
      el.draggable = true;
      el.dataset.path = item.path;
      el.dataset.name = item.name;
      el.dataset.isDirectory = item.isDirectory;

      const icon = getFileIcon(item.name, item.isDirectory);
      const size = item.isDirectory ? "" : formatSize(item.size);

      el.innerHTML = `
        <span class="file-icon">${icon}</span>
        <span class="file-name" title="${item.name}">${item.name}</span>
        ${size ? `<span class="file-size">${size}</span>` : ""}
      `;

      // Click: open directory or open file natively
      el.addEventListener("click", () => {
        if (item.isDirectory) {
          this.load(item.path);
        }
      });

      // Double-click: open file natively
      el.addEventListener("dblclick", (e) => {
        e.preventDefault();
        if (!item.isDirectory) {
          this.openNatively(item.path);
        }
      });

      // Drag start
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.path);
        e.dataTransfer.setData(
          "application/x-ompcot-path",
          JSON.stringify({ path: item.path, isDirectory: item.isDirectory }),
        );
        e.dataTransfer.effectAllowed = "copy";
        el.classList.add("dragging");
      });

      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
      });

      this.container.appendChild(el);
    }
  }

  async openNatively(filePath) {
    try {
      await fetch("/api/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
    } catch (err) {
      console.error("[FileBrowser] Failed to open:", err);
    }
  }
}
