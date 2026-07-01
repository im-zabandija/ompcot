#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const manifest = resolve(scriptDir, "../src-tauri/Cargo.toml");

function runCargo(label, args, { advisory = false } = {}) {
  console.log(`==> ${label}`);
  const result = spawnSync("cargo", ["--color", "always", ...args], {
    stdio: advisory ? "ignore" : "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(`error: failed to run cargo: ${result.error.message}`);
    process.exit(result.error.code === "ENOENT" ? 127 : 1);
  }
  if (result.status !== 0 && !advisory) {
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

runCargo("cargo check (all targets)", ["check", "--manifest-path", manifest, "--all-targets"]);
runCargo("cargo clippy (warnings as errors)", [
  "clippy",
  "--manifest-path",
  manifest,
  "--all-targets",
  "--",
  "-D",
  "warnings",
]);

if (
  !runCargo("cargo fmt --check (advisory)", ["fmt", "--manifest-path", manifest, "--check"], {
    advisory: true,
  })
) {
  console.warn(`    formatting drift detected; run 'cargo fmt --manifest-path ${manifest}' to fix`);
}

console.log("==> all rust checks passed");
