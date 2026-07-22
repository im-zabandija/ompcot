/**
 * Theme system — four themes: two light, two dark
 *
 * Storage note: the active theme is persisted in a cookie (not
 * localStorage). Ompcot spawns one omp process per workspace, each on
 * its own port, and every workspace window is loaded from
 * `http://localhost:<port>`. localStorage is partitioned per origin, so
 * `localhost:3001` and `localhost:3002` would each see a different
 * `ompcot-theme` value — meaning any new project window would forget
 * the user's theme and fall back to the OS default (usually dark). Cookies
 * on `localhost` are shared across ports, so a single cookie is visible
 * to every workspace window.
 */

export const themes = {
  night: {
    name: "Dusk",
    dark: true,
    colors: ["#212121", "#a0a0a0", "#777777", "#666666"],
    vars: {},
  },
  dawn: {
    name: "Dawn",
    dark: true,
    colors: ["#1a1d26", "#7a8ab0", "#6a5a80", "#5a7a9a"],
    vars: {},
  },
  midnight: {
    name: "Midnight",
    dark: true,
    colors: ["#000000", "#5a7a9a", "#4a5565", "#4a5a72"],
    vars: {},
  },
  clean: {
    name: "Clean",
    dark: false,
    colors: ["#ffffff", "#0580c4", "#007aff", "#5ac8fa"],
    vars: {},
  },
  terracotta: {
    name: "Terracotta",
    dark: false,
    colors: ["#f4f1ec", "#b06a48", "#5c2860", "#3a6a9b"],
    vars: {},
  },
  sage: {
    name: "Sage",
    dark: false,
    colors: ["#f0f2ec", "#6a7d5a", "#4a3860", "#3a6a7a"],
    vars: {},
  },
};

// TODO(rename->ompcot): cookie key kept as `ompcot-theme` for backward compat — changing it would reset all existing users' theme preference.
const THEME_COOKIE = "ompcot-theme";
const ACCENT_COOKIE = "ompcot-accent";
const FONT_SIZE_COOKIE = "ompcot-font-size";
const DENSITY_COOKIE = "ompcot-density";
const SIDEBAR_WIDTH_COOKIE = "ompcot-sidebar-width";
const MOTION_COOKIE = "ompcot-motion";
const VOICE_LOCALE_COOKIE = "ompcot-voice-locale";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10; // 10 years

function readCookie(name) {
  try {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    for (const entry of cookies) {
      const eq = entry.indexOf("=");
      if (eq === -1) continue;
      if (entry.slice(0, eq) !== name) continue;
      const raw = entry.slice(eq + 1);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  } catch {
    // document.cookie can throw in sandboxed contexts; treat as missing.
  }
  return null;
}

function writeCookie(name, value) {
  try {
    // Empty value → clear the cookie via Max-Age=0.
    if (value === "" || value == null) {
      // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is async and not suitable here
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      return;
    }
    const encoded = encodeURIComponent(value);
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is async and not suitable for synchronous appearance persistence
    document.cookie = `${name}=${encoded}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // ignore — same fallback as the read path
  }
}

// One-time migration: lift any previously saved value out of the per-origin
// localStorage and into the cross-port cookie. Old key is left in place so
// downgrades stay readable; new writes always go to the cookie.
function migrateLegacyLocalStorageValue() {
  try {
    if (readCookie(THEME_COOKIE)) return;
    const legacy = localStorage.getItem(THEME_COOKIE);
    if (legacy) writeCookie(THEME_COOKIE, legacy);
  } catch {
    // localStorage may be unavailable; nothing to migrate
  }
}

migrateLegacyLocalStorageValue();

export function applyTheme(themeId) {
  const root = document.documentElement;
  if (!themes[themeId]) themeId = "night";
  root.setAttribute("data-theme", themeId);
  writeCookie(THEME_COOKIE, themeId);
}

export function getCurrentTheme() {
  const saved = readCookie(THEME_COOKIE);
  if (saved === "dark") return "night";
  if (saved === "light") return "terracotta";
  if (saved && themes[saved]) return saved;
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "terracotta";
  return "night";
}

// Track OS theme changes only when the user hasn't picked a theme yet.
// As soon as a cookie exists (set by applyTheme) this listener becomes a
// no-op, so the user's explicit choice wins.
if (!readCookie(THEME_COOKIE)) {
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    if (!readCookie(THEME_COOKIE)) {
      const root = document.documentElement;
      root.setAttribute("data-theme", e.matches ? "terracotta" : "night");
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   Appearance overrides — accent colour, font size, density,
   sidebar width. Same cross-port cookie mechanism as the theme
   picker above; each override applies on top of any of the six
   named themes without replacing them.
   ══════════════════════════════════════════════════════════════ */

const HEX_RE = /^#[0-9a-f]{6}$/i;
const FONT_SIZE_MAP = { small: "14px", medium: "15px", large: "16px" };
const DENSITIES = new Set(["comfortable", "compact"]);
const SIDEBAR_MIN_PX = 220;
const SIDEBAR_MAX_PX = 360;
const MOTION_MODES = new Set(["auto", "reduced", "full"]);

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function shiftChannel(v, delta) {
  const n = v + delta;
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n;
}

function shiftedHex(hex, delta) {
  const { r, g, b } = hexToRgb(hex);
  const sr = shiftChannel(r, delta);
  const sg = shiftChannel(g, delta);
  const sb = shiftChannel(b, delta);
  return `#${((sr << 16) | (sg << 8) | sb).toString(16).padStart(6, "0")}`;
}

export function getAccentOverride() {
  const v = readCookie(ACCENT_COOKIE);
  return v && HEX_RE.test(v) ? v : null;
}

export function applyAccentOverride(hex) {
  if (typeof hex !== "string" || !HEX_RE.test(hex)) return false;
  const { r, g, b } = hexToRgb(hex);
  const root = document.documentElement;
  root.style.setProperty("--accent", hex);
  // Same alpha pattern as the mid-range themes (midnight/clean/terracotta/sage):
  // glow ≈ 0.15, subtle ≈ 0.08 — a solid middle ground for any custom accent.
  root.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.15)`);
  root.style.setProperty("--accent-subtle", `rgba(${r}, ${g}, ${b}, 0.08)`);
  // Text variant follows the theme's `dark` flag: lighten on dark, darken on light.
  const theme = themes[getCurrentTheme()];
  const delta = theme && theme.dark === false ? -24 : 24;
  root.style.setProperty("--accent-text", shiftedHex(hex, delta));
  writeCookie(ACCENT_COOKIE, hex);
  return true;
}

export function clearAccentOverride() {
  const root = document.documentElement;
  for (const prop of ["--accent", "--accent-glow", "--accent-subtle", "--accent-text"]) {
    root.style.removeProperty(prop);
  }
  writeCookie(ACCENT_COOKIE, "");
}

export function getFontSize() {
  const v = readCookie(FONT_SIZE_COOKIE);
  return v && FONT_SIZE_MAP[v] ? v : null;
}

export function applyFontSize(size) {
  if (!FONT_SIZE_MAP[size]) return false;
  document.documentElement.style.setProperty("--font-size-base", FONT_SIZE_MAP[size]);
  writeCookie(FONT_SIZE_COOKIE, size);
  return true;
}

export function clearFontSize() {
  document.documentElement.style.removeProperty("--font-size-base");
  writeCookie(FONT_SIZE_COOKIE, "");
}

export function getDensity() {
  const v = readCookie(DENSITY_COOKIE);
  return v && DENSITIES.has(v) ? v : null;
}

export function applyDensity(density) {
  if (!DENSITIES.has(density)) return false;
  document.documentElement.setAttribute("data-density", density);
  writeCookie(DENSITY_COOKIE, density);
  return true;
}

export function clearDensity() {
  document.documentElement.removeAttribute("data-density");
  writeCookie(DENSITY_COOKIE, "");
}

export function getSidebarWidth() {
  const raw = readCookie(SIDEBAR_WIDTH_COOKIE);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < SIDEBAR_MIN_PX || n > SIDEBAR_MAX_PX) return null;
  return n;
}

export function applySidebarWidth(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n < SIDEBAR_MIN_PX || n > SIDEBAR_MAX_PX) return false;
  const rounded = Math.round(n);
  document.documentElement.style.setProperty("--sidebar-width", `${rounded}px`);
  writeCookie(SIDEBAR_WIDTH_COOKIE, String(rounded));
  return true;
}

export function clearSidebarWidth() {
  document.documentElement.style.removeProperty("--sidebar-width");
  writeCookie(SIDEBAR_WIDTH_COOKIE, "");
}

// Motion override — independent of the OS `prefers-reduced-motion` media query.
// "auto" leaves the media query in charge (no attribute); "reduced"/"full"
// force the state via :root[data-motion="..."] (see style.css).
export function getMotion() {
  const v = readCookie(MOTION_COOKIE);
  return v && MOTION_MODES.has(v) ? v : null;
}

export function applyMotion(mode) {
  if (!MOTION_MODES.has(mode)) return false;
  const root = document.documentElement;
  if (mode === "auto") {
    root.removeAttribute("data-motion");
  } else {
    root.setAttribute("data-motion", mode);
  }
  writeCookie(MOTION_COOKIE, mode);
  return true;
}

export function clearMotion() {
  document.documentElement.removeAttribute("data-motion");
  writeCookie(MOTION_COOKIE, "");
}

// Voice-input locale override. Null means "use the OS locale" (navigator.language).
export function getVoiceLocale() {
  const v = readCookie(VOICE_LOCALE_COOKIE);
  return v || null;
}

export function setVoiceLocale(locale) {
  writeCookie(VOICE_LOCALE_COOKIE, typeof locale === "string" ? locale : "");
}

// Re-apply every persisted appearance override on module load, so a fresh
// window (or a workspace on a different port) reflects the user's choices
// without waiting for a settings panel wire-up.
export function applyPersistedAppearance() {
  const accent = getAccentOverride();
  if (accent) applyAccentOverride(accent);
  const fs = getFontSize();
  if (fs) applyFontSize(fs);
  const density = getDensity();
  if (density) applyDensity(density);
  const sidebar = getSidebarWidth();
  if (sidebar != null) applySidebarWidth(sidebar);
  const motion = getMotion();
  if (motion) applyMotion(motion);
}

applyPersistedAppearance();
