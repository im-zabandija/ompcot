import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };

// Auto-discovery: scans the real source (JS calls to t("key") plus HTML
// data-i18n* attributes) for the keys actually in use, instead of a
// hand-maintained expected-keys list. This is what keeps the locale files
// from silently drifting out of sync with the code as more files migrate.
const PUBLIC_DIR = path.join(__dirname);

function discoverKeysFromJs() {
  const keys = new Set();
  // Two-pass: first grab the full argument-list text of every t(...) call
  // (tolerates non-literal first args like a ternary: t(cond ? "a" : "b")),
  // then pull every quoted literal out of that text. This over-collects
  // occasionally (a literal that isn't actually a key) but never silently
  // misses a real key the way a single anchored regex would.
  const callRe = /\bt\(([^)]*)\)/g;
  const literalRe = /["'`]([^"'`]+)["'`]/g;
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    if (!file.endsWith(".js") || file.endsWith(".test.js")) continue;
    const src = fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8");
    for (const call of src.matchAll(callRe)) {
      for (const literal of call[1].matchAll(literalRe)) keys.add(literal[1]);
    }
  }
  return keys;
}

function discoverKeysFromHtml() {
  const keys = new Set();
  const re = /data-i18n(?:-title|-aria-label|-placeholder)?="([^"]+)"/g;
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    if (!file.endsWith(".html")) continue;
    const html = fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8");
    for (const match of html.matchAll(re)) keys.add(match[1]);
  }
  return keys;
}

const usedKeys = new Set([...discoverKeysFromJs(), ...discoverKeysFromHtml()]);

describe("i18n key completeness", () => {
  test("discovered at least one key (sanity check the scanner itself works)", () => {
    expect(usedKeys.size).toBeGreaterThan(0);
  });

  for (const key of usedKeys) {
    test(`"${key}" exists in both es.json and en.json`, () => {
      expect(es[key], `missing in es.json: ${key}`).toBeDefined();
      expect(en[key], `missing in en.json: ${key}`).toBeDefined();
    });
  }
});

describe("i18n key orphans", () => {
  // Complements the discovery-based test above: that one catches keys used
  // in code but missing from a locale file. This one catches the opposite —
  // a key present in es.json (or en.json) that the scanner never found in
  // any t()/data-i18n* usage — which means either the key is genuinely dead,
  // or the scanner itself has a blind spot. Either way it's worth a look.
  for (const key of Object.keys(es)) {
    test(`"${key}" from es.json is used somewhere in code or HTML`, () => {
      expect(usedKeys.has(key), `"${key}" not found by the scanner`).toBe(true);
    });
  }
});

function placeholdersOf(value) {
  return new Set(Array.from(value.matchAll(/\{([^}]+)\}/g), (m) => m[1]));
}

describe("i18n placeholder parity", () => {
  for (const key of Object.keys(es)) {
    if (en[key] === undefined) continue;
    test(`"${key}" has the same placeholders in es.json and en.json`, () => {
      const esPlaceholders = placeholdersOf(es[key]);
      const enPlaceholders = placeholdersOf(en[key]);
      expect([...enPlaceholders].sort()).toEqual([...esPlaceholders].sort());
    });
  }
});
