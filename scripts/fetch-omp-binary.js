#!/usr/bin/env node
/**
 * Ompcot no longer bundles the omp binary. The app resolves omp from the
 * user's system PATH at runtime (or via the OMP_BIN env var).
 *
 * This script is kept as a no-op so existing build pipelines and
 * `bun run fetch:omp` invocations don't break.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "src-tauri", "resources", "omp");

function info(msg) { console.log(`[fetch-omp] ${msg}`); }

info("ompcot uses system omp from PATH at runtime — no binary to fetch.");
info("Make sure omp is installed: brew install omp");

// Clean up any previously bundled binary so it doesn't accidentally get
// picked up by stale resource bundling.
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
  info(`removed stale bundled binary: ${OUT_DIR}`);
}