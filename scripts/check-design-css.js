#!/usr/bin/env bun
// Design-token linter for public/*.css — ported from picot's
// scripts/check-design-css.mjs, remapped to Ompcot's real token scale.
//
// Flags px literals on font-size/padding*/gap*/border-radius that already
// have an exact token equivalent, and rewrites them with `--fix`.
// `public/style-theme.css` is the source of the tokens, so it's skipped.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(scriptDir, "../public");
const fix = process.argv.includes("--fix");

const WATCHED_PROPS = new Set([
  "font-size",
  "padding",
  "padding-block",
  "padding-block-start",
  "padding-block-end",
  "padding-inline",
  "padding-inline-start",
  "padding-inline-end",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "gap",
  "column-gap",
  "row-gap",
  "border-radius",
]);

// padding*/gap* components
const exactTokens = new Map([
  ["2px", "--space-0-5"],
  ["4px", "--space-1"],
  ["6px", "--space-1-5"],
  ["8px", "--space-2"],
  ["10px", "--space-2-5"],
  ["12px", "--space-3"],
  ["14px", "--space-3-5"],
  ["16px", "--space-4"],
  ["20px", "--space-5"],
  ["24px", "--space-6"],
  ["32px", "--space-8"],
  ["40px", "--space-10"],
  ["48px", "--space-12"],
]);

// font-size (exact whole-value match)
const fontTokens = new Map([
  ["10px", "--font-size-2xs"],
  ["11px", "--font-size-xs"],
  ["12px", "--font-size-sm"],
  ["13px", "--font-size-md"],
  ["14px", "--font-size-lg"],
  ["16px", "--font-size-xl"],
  ["20px", "--font-size-2xl"],
  ["24px", "--font-size-3xl"],
]);

// border-radius components
const radiusTokens = new Map([
  ["4px", "--radius-xs"],
  ["6px", "--radius-sm"],
  ["10px", "--radius-md"],
  ["16px", "--radius"],
  ["24px", "--radius-lg"],
  ["100px", "--radius-pill"],
  ["999px", "--radius-pill"],
]);

const PX_LITERAL = /\d+(?:\.\d+)?px/g;
const EXEMPT_LITERALS = new Set(["0px", "960px"]);
const DECL_RE = /^(\s*)([a-z-]+)\s*:\s*([^;]+);(.*)$/;
const IGNORE_RE = /design-token-ignore:\s*(.+?)\s*(?:\*\/)?\s*$/;

/** Replace every component that has an exact token; leaves the rest as-is.
 *  Returns { text, allResolved } — allResolved is true when nothing but
 *  tokens/exempt literals remain, i.e. the declaration is now clean. */
function replaceComponents(value, map) {
  let allResolved = true;
  const text = value
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "") return part;
      const token = map.get(part);
      if (token) return `var(${token})`;
      if (EXEMPT_LITERALS.has(part) || !PX_LITERAL.test(part)) return part;
      allResolved = false;
      return part;
    })
    .join("");
  return { text, allResolved };
}

function suggest(prop, value) {
  if (prop === "font-size") {
    const trimmed = value.trim();
    const token = fontTokens.get(trimmed);
    return token
      ? { text: `var(${token})`, allResolved: true }
      : { text: value, allResolved: false };
  }
  if (prop === "border-radius") return replaceComponents(value, radiusTokens);
  return replaceComponents(value, exactTokens); // padding*/gap*
}

/** True when the declaration has nothing worth flagging: no px literal, or
 *  only the exempt ones (0px, max-content-width 960px). */
function isClean(value) {
  const literals = value.match(PX_LITERAL);
  if (!literals) return true;
  return literals.every((l) => EXEMPT_LITERALS.has(l));
}

function walkCssFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "vendor") continue;
      walkCssFiles(full, out);
    } else if (name.endsWith(".css") && full !== join(publicDir, "style-theme.css")) {
      out.push(full);
    }
  }
  return out;
}

function walkJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "vendor") continue;
      walkJsFiles(full, out);
    } else if (name.endsWith(".js") && !name.endsWith(".test.js")) {
      out.push(full);
    }
  }
  return out;
}

let errorCount = 0;
let fixCount = 0;
let warnCount = 0;

function hasIgnoreComment(lines, i) {
  for (const line of [lines[i], lines[i - 1]]) {
    if (line === undefined) continue;
    const m = line.match(IGNORE_RE);
    if (m && m[1].trim().length > 0) return true;
  }
  return false;
}

for (const file of walkCssFiles(publicDir)) {
  const rel = relative(process.cwd(), file);
  const lines = readFileSync(file, "utf8").split("\n");
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("var(")) continue;
    const m = line.match(DECL_RE);
    if (!m) continue;
    const [, indent, prop, value, trailer] = m;
    if (!WATCHED_PROPS.has(prop)) continue;
    if (isClean(value)) continue;
    if (hasIgnoreComment(lines, i)) continue;

    const { text, allResolved } = suggest(prop, value);

    if (fix) {
      if (allResolved && text !== value) {
        lines[i] = `${indent}${prop}: ${text};${trailer}`;
        changed = true;
        fixCount++;
      }
      continue;
    }

    errorCount++;
    const status = allResolved ? "fixable with --fix" : "needs a token/design-token-ignore";
    console.error(`${rel}:${i + 1}  ${prop}: ${value.trim()};  → ${text.trim()}  (${status})`);
  }

  if (fix && changed) writeFileSync(file, lines.join("\n"));
}

const INLINE_STYLE_RE =
  /\.style\.(fontSize|height|minHeight|maxHeight|padding|gap|borderRadius)\s*=\s*(["'`])((?:(?!\2).)*)\2/g;

for (const file of walkJsFiles(publicDir)) {
  const rel = relative(process.cwd(), file);
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(INLINE_STYLE_RE)) {
      const [, prop, , val] = m;
      if (val.includes("${")) continue;
      warnCount++;
      console.warn(
        `${rel}:${i + 1}  warning: static inline style .style.${prop} = "${val}" — consider a token/class`,
      );
    }
  }
}

if (fix) {
  console.log(`check-design-css: fixed ${fixCount} declaration(s).`);
  process.exit(0);
}

if (warnCount > 0)
  console.warn(`check-design-css: ${warnCount} inline-style warning(s) (non-blocking).`);

if (errorCount > 0) {
  console.error(
    `check-design-css: ${errorCount} literal(s) need a token. Run with --fix, or mark with a design-token-ignore comment.`,
  );
  process.exit(1);
}

console.log("check-design-css: clean.");
