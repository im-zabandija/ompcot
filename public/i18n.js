/**
 * i18n — flat-key, two-locale (es/en) translation. Español is the
 * default/fallback locale (this app is Spanish-first, see README).
 *
 * Persistence follows the same cookie pattern as themes.js's voice-locale
 * override (cross-port cookie, no localStorage — see getVoiceLocale/
 * setVoiceLocale there). `applyI18n` binds static HTML via data-i18n*
 * attributes; app.js calls it once explicitly at bootstrap so index.html
 * doesn't need per-node JS wiring.
 */
import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };

const LOCALE_COOKIE = "ompcot-locale";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10; // 10 years
const LOCALES = { es, en };
const DEFAULT_LOCALE = "es";

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
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is async and not suitable for synchronous locale persistence
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // ignore — same fallback as the read path
  }
}

export function getLocale() {
  const v = readCookie(LOCALE_COOKIE);
  return v === "en" ? "en" : DEFAULT_LOCALE;
}

export function setLocale(locale) {
  if (locale !== "es" && locale !== "en") return;
  writeCookie(LOCALE_COOKIE, locale);
  location.reload();
}

export function t(key, params) {
  const locale = getLocale();
  const value = LOCALES[locale]?.[key] ?? LOCALES[DEFAULT_LOCALE]?.[key];
  if (value === undefined) return key;
  if (!params) return value;
  let result = value;
  for (const [name, val] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${name}\\}`, "g"), val);
  }
  return result;
}

const I18N_ATTR_TARGETS = [
  ["data-i18n", "textContent"],
  ["data-i18n-title", "title"],
  ["data-i18n-aria-label", "aria-label"],
  ["data-i18n-placeholder", "placeholder"],
];

// Binds static HTML to the current locale: elements carrying data-i18n*
// attributes get their textContent/title/aria-label/placeholder replaced
// with the translated string. Call once explicitly at bootstrap (see
// app.js); a locale change reloads the page (setLocale), so no reactive
// re-binding is needed.
//
// data-i18n* is EXCLUSIVE to static HTML already present in the .html file
// on disk. Markup built dynamically in JS (e.g. via innerHTML) is never
// tagged with data-i18n — it must call t() directly instead, since these
// attributes are only scanned/applied against elements that exist in the
// DOM at applyI18n() time.
export function applyI18n(root = document) {
  for (const [attr, target] of I18N_ATTR_TARGETS) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const value = t(el.getAttribute(attr));
      if (target === "textContent") {
        const hasElementChildren = Array.from(el.childNodes).some(
          (node) => node.nodeType === Node.ELEMENT_NODE,
        );
        if (hasElementChildren) {
          console.warn(
            `[i18n] skipping data-i18n="${el.getAttribute(attr)}": element has nested markup, textContent would erase it`,
          );
          continue;
        }
        el.textContent = value;
      } else {
        el.setAttribute(target, value);
      }
    }
  }
}
