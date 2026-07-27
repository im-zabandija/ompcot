#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: $0 <version>"
  echo "Example: $0 0.1.6  (or: $0 v0.1.6)"
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

RAW_VERSION="$1"
VERSION="${RAW_VERSION#v}"
TAG="v$VERSION"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid version: $RAW_VERSION"
  echo "Expected: 0.1.6 or v0.1.6 (supports prerelease/build suffixes)"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository."
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "HEAD" ]]; then
  echo "Detached HEAD is not supported for release."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit/stash your changes first."
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag already exists locally: $TAG"
  exit 1
fi

if [[ -n "$(git ls-remote --tags origin "refs/tags/$TAG")" ]]; then
  echo "Tag already exists on origin: $TAG"
  exit 1
fi

echo "Updating versions to $VERSION..."
PI_RELEASE_VERSION="$VERSION" bun run - <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.env.PI_RELEASE_VERSION;
if (!version) throw new Error("PI_RELEASE_VERSION env var not set");
const root = process.cwd();

const jsonFiles = [
  resolve(root, "src-tauri", "tauri.conf.json"),
  resolve(root, "package.json"),
];

for (const file of jsonFiles) {
  const content = JSON.parse(readFileSync(file, "utf8"));
  content.version = version;
  writeFileSync(file, JSON.stringify(content, null, 2) + "\n");
}

const cargoPath = resolve(root, "src-tauri", "Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const updated = cargo.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/,
  `$1${version}$3`,
);
if (updated === cargo) {
  throw new Error("Failed to update version in src-tauri/Cargo.toml");
}
writeFileSync(cargoPath, updated);
EOF

echo "Regenerating bun.lock..."
bun install --lockfile-only

echo "Refreshing src-tauri/Cargo.lock..."
# Cargo.lock contains an `ompcot` entry whose version tracks Cargo.toml.
# Run `cargo update -p ompcot` so the lockfile is in sync with the bumped
# Cargo.toml *before* we commit, otherwise the next local cargo invocation
# will leave a dirty Cargo.lock behind after the release commit is pushed.
# Ensure ~/.cargo/bin is on PATH (rustup default install location), since
# `bun run release` is often launched from a shell where it isn't sourced.
CARGO_BIN=""
if command -v cargo >/dev/null 2>&1; then
  CARGO_BIN="cargo"
elif [[ -x "$HOME/.cargo/bin/cargo" ]]; then
  CARGO_BIN="$HOME/.cargo/bin/cargo"
fi
if [[ -n "$CARGO_BIN" ]]; then
  ( cd src-tauri && "$CARGO_BIN" update -p ompcot --offline >/dev/null 2>&1 \
      || "$CARGO_BIN" update -p ompcot >/dev/null 2>&1 \
      || true )
else
  echo "  (cargo not found; skipping Cargo.lock refresh)"
fi

echo "Committing release version bump..."
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock package.json bun.lock
git commit -m "chore(release): $TAG"

echo "Creating tag $TAG..."
git tag "$TAG"

echo "Pushing branch ($CURRENT_BRANCH) and tag ($TAG)..."
git push origin "$CURRENT_BRANCH"
git push origin "$TAG"

echo
echo "Release pushed successfully:"
echo "  branch: $CURRENT_BRANCH"
echo "  tag:    $TAG"
echo

REMOTE_URL="$(git remote get-url origin)"
REPO_SLUG="$(echo "$REMOTE_URL" | sed -E 's#.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')"

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Verifying the Release workflow actually triggered on $TAG..."
  TRIGGERED=""
  for _ in 1 2 3 4 5 6; do
    sleep 5
    if gh run list --repo "$REPO_SLUG" --json headBranch,event --jq \
         ".[] | select(.headBranch == \"$TAG\" and .event == \"push\")" 2>/dev/null | grep -q .; then
      TRIGGERED=1
      break
    fi
  done
  if [[ -n "$TRIGGERED" ]]; then
    echo "  Release workflow started for $TAG."
  else
    echo "  WARNING: no workflow run appeared for the $TAG push after 30s."
    echo "  Forks have Actions disabled until the first run is triggered"
    echo "  manually (banner in the Actions tab, or an API dispatch)."
    echo "  Dispatching one now..."
    if gh workflow run Release --repo "$REPO_SLUG" --ref "$TAG" >/dev/null 2>&1; then
      echo "  Dispatched: https://github.com/$REPO_SLUG/actions"
    else
      echo "  Could not dispatch automatically. Trigger it by hand:"
      echo "    gh workflow run Release --repo $REPO_SLUG --ref $TAG"
    fi
  fi
else
  echo "(gh CLI not available/authenticated - check the Actions tab manually:"
  echo " https://github.com/$REPO_SLUG/actions)"
fi
