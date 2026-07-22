import { renderPackageInstallFailure } from "./package-install-status.js";

/**
 * Community package browser (pi-packages registry) — the "Extensions"
 * panel inside Settings that lists npm packages tagged for Ompcot,
 * with search / type-pill filter / installed-only toggle / sort /
 * paginated list, and install/uninstall buttons that call through to
 * the native transport.
 *
 * Everything the browser touches is private module state; only
 * `loadBrowsePackages` is exposed (the settings panel calls it when
 * the Extensions tab is opened). `escapeHtml` is threaded in from
 * the composer module because it's the same helper — no reason to
 * duplicate a 3-line DOM-escape function per module.
 */
export function setupPackageBrowser({ transport, nativeAvailable, escapeHtml, openExternalLink }) {
  const PKG_API_BASE = "https://pi-packages-aomp.shixin.workers.dev";
  const browseListEl = document.getElementById("pkg-browse-list");
  const browseSearchEl = document.getElementById("pkg-browse-search");
  const browseOMPllsEl = document.getElementById("pkg-browse-pills");
  const browseCountEl = document.getElementById("pkg-browse-count");
  let browsePaginationEl = document.getElementById("pkg-browse-pagination");
  if (!browsePaginationEl && browseListEl && browseListEl.parentNode) {
    browsePaginationEl = document.createElement("div");
    browsePaginationEl.className = "pkg-browse-pagination";
    browsePaginationEl.id = "pkg-browse-pagination";
    browsePaginationEl.hidden = true;
    browseListEl.parentNode.insertBefore(browsePaginationEl, browseListEl.nextSibling);
  }
  const browseInstalledOnlyEl = document.getElementById("pkg-browse-installed-only");
  const browseSortEl = document.getElementById("pkg-browse-sort");

  let browseAllPackages = null;
  let browseInstalledSet = new Set();
  let browseLoaded = false;
  let browseLoading = false;
  let browseActiveType = "all";
  let browseSearchQuery = "";
  let browseInstalledOnly = false;
  let browseSortMode = "downloads";
  let browseSearchTimer = null;
  let browsePage = 1;
  const BROWSE_PAGE_SIZE = 50;

  function setExtensionActionButton(button, label, loading = false) {
    if (!button) return;
    if (loading) {
      button.innerHTML =
        '<span class="settings-btn-spinner" aria-hidden="true"></span><span></span>';
      const text = button.querySelector("span:last-child");
      if (text) text.textContent = label;
      return;
    }
    button.textContent = label;
  }

  async function loadBrowsePackages(force = false) {
    if (!browseListEl) return;
    if (browseLoading) return;
    if (browseLoaded && !force) {
      renderBrowsePackages();
      return;
    }
    browseLoading = true;
    browseListEl.innerHTML =
      '<div class="settings-api-keys-loading pkg-browse-full-row">Loading packages...</div>';
    try {
      const [packages, installed] = await Promise.all([
        fetchBrowsePackages(),
        fetchInstalledSources(),
      ]);
      browseAllPackages = packages;
      browseInstalledSet = installed;
      browseLoaded = true;
      renderBrowsePackages();
    } catch (err) {
      const message = String(err?.message || err || "Failed to load packages");
      browseListEl.innerHTML = `<div class="settings-api-keys-empty pkg-browse-full-row">${escapeHtml(message)} <button type="button" class="settings-value-btn" id="pkg-browse-retry">Retry</button></div>`;
      const retry = document.getElementById("pkg-browse-retry");
      if (retry) retry.addEventListener("click", () => loadBrowsePackages(true));
    } finally {
      browseLoading = false;
    }
  }

  async function fetchBrowsePackages() {
    const pageSize = 250;
    const all = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await fetch(`${PKG_API_BASE}/packages?page=${page}&pageSize=${pageSize}`);
      if (!res.ok) throw new Error(`Registry returned ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data?.packages)) all.push(...data.packages);
      totalPages = Number(data?.totalPages) || 1;
      page += 1;
    } while (page <= totalPages);
    return all;
  }

  async function fetchInstalledSources() {
    if (!nativeAvailable()) return new Set();
    try {
      const configured = await transport.listOMPPackages();
      return new Set(Array.isArray(configured) ? configured : []);
    } catch {
      return new Set();
    }
  }

  function browseSourceFor(pkg) {
    return `npm:${pkg.name}`;
  }

  function normalizeRepoUrl(url) {
    if (!url) return null;
    return url
      .replace(/^git\+/, "")
      .replace(/^git:\/\//, "https://")
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/\.git$/, "");
  }

  const BROWSE_LINK_SVGS = {
    npm: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M0 0v24h24v-24h-24zm19.2 19.2h-2.4v-9.6h-4.8v9.6h-7.2v-14.4h14.4v14.4z"/></svg>',
    github:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  };

  function createBrowseLinkButton(kind, label, url) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pkg-browse-link";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `${BROWSE_LINK_SVGS[kind] || BROWSE_LINK_SVGS.link}<span>${escapeHtml(label)}</span>`;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openExternalLink(url);
    });
    return btn;
  }

  function buildBrowseLinks(pkg) {
    const links = pkg.links || {};
    const container = document.createElement("div");
    container.className = "pkg-browse-links";

    const npmUrl = links.npm || `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
    container.appendChild(createBrowseLinkButton("npm", "npm", npmUrl));

    const repo = normalizeRepoUrl(links.repository);
    if (repo) {
      const isGithub = /github\.com/i.test(repo);
      container.appendChild(
        createBrowseLinkButton(isGithub ? "github" : "link", isGithub ? "GitHub" : "repo", repo),
      );
    }

    const homepage = normalizeRepoUrl(links.homepage);
    if (homepage && homepage !== repo) {
      container.appendChild(createBrowseLinkButton("link", "homepage", homepage));
    }

    return container;
  }

  function browseUpdatedTime(pkg) {
    const raw = pkg.updatedAt || pkg.updated || pkg.modified || pkg.date || pkg.time || 0;
    const t = typeof raw === "number" ? raw : Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }

  function sortBrowsePackages(packages) {
    const sorted = packages.slice();
    switch (browseSortMode) {
      case "name":
        sorted.sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
        );
        break;
      case "updated":
        sorted.sort((a, b) => browseUpdatedTime(b) - browseUpdatedTime(a));
        break;
      default:
        sorted.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        break;
    }
    return sorted;
  }

  function filterBrowsePackages() {
    if (!browseAllPackages) return [];
    const query = browseSearchQuery.toLowerCase().trim();
    const filtered = browseAllPackages.filter((pkg) => {
      if (browseInstalledOnly && !browseInstalledSet.has(browseSourceFor(pkg))) return false;
      if (browseActiveType !== "all") {
        if (!Array.isArray(pkg.types) || !pkg.types.includes(browseActiveType)) return false;
      }
      if (query) {
        const inName = pkg.name.toLowerCase().includes(query);
        const inDesc = (pkg.description || "").toLowerCase().includes(query);
        const inAuthor = (pkg.author || "").toLowerCase().includes(query);
        if (!inName && !inDesc && !inAuthor) return false;
      }
      return true;
    });
    return sortBrowsePackages(filtered);
  }

  function renderBrowsePackages() {
    if (!browseListEl) return;
    const results = filterBrowsePackages();

    const totalPages = Math.max(1, Math.ceil(results.length / BROWSE_PAGE_SIZE));
    if (browsePage > totalPages) browsePage = totalPages;
    if (browsePage < 1) browsePage = 1;
    const start = (browsePage - 1) * BROWSE_PAGE_SIZE;
    const pageResults = results.slice(start, start + BROWSE_PAGE_SIZE);

    if (browseCountEl) {
      if (results.length === 0) {
        browseCountEl.textContent = `0 of ${results.length}`;
      } else {
        const rangeStart = start + 1;
        const rangeEnd = start + pageResults.length;
        browseCountEl.textContent = `${rangeStart}–${rangeEnd} of ${results.length}`;
      }
    }

    browseListEl.innerHTML = "";
    if (!results.length) {
      browseListEl.innerHTML =
        '<div class="settings-api-keys-empty pkg-browse-full-row">No packages match your filters.</div>';
      renderBrowsePagination(totalPages);
      return;
    }
    for (const pkg of pageResults) {
      browseListEl.appendChild(createBrowseRow(pkg));
    }
    renderBrowsePagination(totalPages);
  }

  function renderBrowsePagination(totalPages) {
    if (!browsePaginationEl) return;
    if (totalPages <= 1) {
      browsePaginationEl.hidden = true;
      browsePaginationEl.innerHTML = "";
      return;
    }
    browsePaginationEl.hidden = false;
    browsePaginationEl.innerHTML = "";

    const goTo = (page) => {
      browsePage = page;
      renderBrowsePackages();
      if (browseListEl) browseListEl.scrollIntoView({ block: "nearest" });
    };

    const addBtn = (label, page, { active = false, disabled = false } = {}) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `pkg-browse-page-btn${active ? " is-active" : ""}`;
      btn.textContent = label;
      btn.disabled = disabled;
      if (!disabled && !active) btn.addEventListener("click", () => goTo(page));
      browsePaginationEl.appendChild(btn);
    };

    const addEllipsis = () => {
      const span = document.createElement("span");
      span.className = "pkg-browse-page-ellipsis";
      span.textContent = "…";
      browsePaginationEl.appendChild(span);
    };

    addBtn("‹", browsePage - 1, { disabled: browsePage <= 1 });

    const pages = new Set([1, totalPages, browsePage]);
    for (let d = 1; d <= 2; d++) {
      pages.add(browsePage - d);
      pages.add(browsePage + d);
    }
    const visible = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

    let prev = 0;
    for (const p of visible) {
      if (p - prev > 1) addEllipsis();
      addBtn(String(p), p, { active: p === browsePage });
      prev = p;
    }

    addBtn("›", browsePage + 1, { disabled: browsePage >= totalPages });
  }

  function createBrowseRow(pkg) {
    const source = browseSourceFor(pkg);
    const installed = browseInstalledSet.has(source);

    const row = document.createElement("div");
    row.className = "settings-extension-row pkg-browse-row";

    const info = document.createElement("div");
    info.className = "settings-extension-info";

    const name = document.createElement("div");
    name.className = "settings-extension-name";
    name.textContent = pkg.name;
    info.appendChild(name);

    if (pkg.description) {
      const description = document.createElement("div");
      description.className = "settings-extension-description";
      description.textContent = pkg.description;
      info.appendChild(description);
    }

    const badges = document.createElement("div");
    badges.className = "pkg-browse-badges";
    for (const t of pkg.types || []) {
      const badge = document.createElement("span");
      badge.className = "pkg-browse-badge";
      badge.dataset.type = t;
      badge.textContent = t;
      badges.appendChild(badge);
    }
    const downloads = document.createElement("span");
    downloads.className = "pkg-browse-meta";
    downloads.textContent = `${(pkg.downloads || 0).toLocaleString()}/mo`;
    badges.appendChild(downloads);
    info.appendChild(badges);

    const status = document.createElement("div");
    status.className = "settings-extension-status";
    status.hidden = true;
    info.appendChild(status);

    info.appendChild(buildBrowseLinks(pkg));

    const actions = document.createElement("div");
    actions.className = "settings-extension-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-value-btn";

    const canManage = nativeAvailable();
    if (!canManage) {
      button.disabled = true;
      setExtensionActionButton(button, "Desktop only");
    } else {
      setExtensionActionButton(button, installed ? "Uninstall" : "Install");
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.classList.add("loading");
        const previous = installed ? "Uninstall" : "Install";
        setExtensionActionButton(button, installed ? "Uninstalling..." : "Installing...", true);
        status.hidden = false;
        status.classList.remove("is-error");
        status.textContent = installed ? "Removing..." : "Installing...";
        status.title = status.textContent;
        try {
          if (installed) {
            await transport.removeOMPPackage(source);
            browseInstalledSet.delete(source);
          } else {
            await transport.installOMPPackage(source);
            browseInstalledSet.add(source);
          }
          renderBrowsePackages();
        } catch (err) {
          renderPackageInstallFailure(status, err, installed ? "uninstall" : "install");
          button.disabled = false;
          button.classList.remove("loading");
          setExtensionActionButton(button, previous);
        }
      });
    }
    actions.appendChild(button);

    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }

  if (browseOMPllsEl) {
    browseOMPllsEl.addEventListener("click", (event) => {
      const pill = event.target.closest(".pkg-browse-pill");
      if (!pill) return;
      browseActiveType = pill.dataset.pkgType || "all";
      for (const p of browseOMPllsEl.querySelectorAll(".pkg-browse-pill")) {
        p.classList.toggle("active", p === pill);
      }
      browsePage = 1;
      renderBrowsePackages();
    });
  }

  if (browseSearchEl) {
    browseSearchEl.addEventListener("input", () => {
      clearTimeout(browseSearchTimer);
      browseSearchTimer = setTimeout(() => {
        browseSearchQuery = browseSearchEl.value;
        browsePage = 1;
        renderBrowsePackages();
      }, 180);
    });
  }

  if (browseInstalledOnlyEl) {
    browseInstalledOnlyEl.addEventListener("change", () => {
      browseInstalledOnly = browseInstalledOnlyEl.checked;
      browsePage = 1;
      renderBrowsePackages();
    });
  }

  if (browseSortEl) {
    browseSortEl.value = browseSortMode;
    browseSortEl.addEventListener("change", () => {
      browseSortMode = browseSortEl.value || "downloads";
      browsePage = 1;
      renderBrowsePackages();
    });
  }

  return { loadBrowsePackages };
}
