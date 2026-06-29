#!/usr/bin/env node
/**
 * Copy the omp binary from the local Homebrew installation into
 * src-tauri/resources/omp/ so the Tauri bundle can ship it.
 *
 * OMP is distributed via Homebrew (can1357/tap/omp), not GitHub releases.
 * This script finds the installed omp binary and copies it.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "src-tauri", "resources", "omp");
const OUT_BIN = path.join(OUT_DIR, "omp");
const VERSION_MARKER = path.join(OUT_DIR, ".version");
const VERSION_FILE = path.join(__dirname, "omp-version.json");

function info(msg) { console.log(`[fetch-omp] ${msg}`); }
function warn(msg) { console.warn(`[fetch-omp] WARN: ${msg}`); }
function fail(msg) { console.error(`[fetch-omp] FAIL: ${msg}`); process.exit(1); }

function loadLockedVersion() {
  const raw = fs.readFileSync(VERSION_FILE, "utf8");
  return JSON.parse(raw).version;
}

function findHomebrewOmp() {
  // Try common Homebrew paths
  const candidates = [
    "/opt/homebrew/bin/omp",       // Apple Silicon
    "/usr/local/bin/omp",          // Intel Mac
    process.env.HOME + "/.linuxbrew/bin/omp", // Linuxbrew
  ];
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  
  // Try `which omp`
  try {
    const result = execSync("which omp", { encoding: "utf8", timeout: 5000 }).trim();
    if (result && fs.existsSync(result)) {
      return result;
    }
  } catch {}
  
  return null;
}

function getBrewOmpVersion(binPath) {
  try {
    const result = execSync(`"${binPath}" --version`, { encoding: "utf8", timeout: 10000 }).trim();
    const match = result.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isUpToDate(version) {
  if (!fs.existsSync(OUT_BIN)) return false;
  if (!fs.existsSync(VERSION_MARKER)) return false;
  return fs.readFileSync(VERSION_MARKER, "utf8").trim() === version;
}

async function main() {
  const lockedVersion = loadLockedVersion();
  info(`locked version: ${lockedVersion}`);
  
  if (isUpToDate(lockedVersion)) {
    info(`omp ${lockedVersion} already up to date`);
    return;
  }
  
  const brewBin = findHomebrewOmp();
  if (!brewBin) {
    fail("Could not find omp binary. Install via: brew install can1357/tap/omp");
  }
  
  const installedVersion = getBrewOmpVersion(brewBin);
  info(`found omp at ${brewBin} (version: ${installedVersion || "unknown"})`);
  
  fs.mkdirSync(OUT_DIR, { recursive: true });
  
  // Copy binary
  fs.copyFileSync(brewBin, OUT_BIN);
  fs.chmodSync(OUT_BIN, 0o755);
  
  // Write version marker
  fs.writeFileSync(VERSION_MARKER, lockedVersion, "utf8");
  
  info(`installed omp ${lockedVersion} -> ${OUT_BIN}`);
}

main().catch((err) => {
  fail(`unexpected error: ${err.stack || err.message || err}`);
});
