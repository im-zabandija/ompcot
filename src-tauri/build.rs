use std::{fs, path::PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let extension_dist_dir = manifest_dir.join("..").join("extensions").join("dist");

    // Tauri validates every configured bundle resource while running the build
    // script, even for debug `cargo check` / clippy flows. The extension bundle
    // is generated, so a clean checkout may not have this directory yet.
    fs::create_dir_all(&extension_dist_dir).unwrap_or_else(|err| {
        panic!(
            "failed to create generated extension resource directory at {}: {}",
            extension_dist_dir.display(),
            err
        )
    });

    tauri_build::build();

    // Re-run if the extension source changes.
    println!("cargo:rerun-if-changed=../extensions/embedded-server.ts");
    println!("cargo:rerun-if-changed=../extensions/dist/embedded-server.mjs");
    println!("cargo:rerun-if-env-changed=OMCOT_SKIP_BIN_CHECK");

    let profile = std::env::var("PROFILE").unwrap_or_default();
    if profile != "release" {
        return;
    }

    if std::env::var("OMCOT_SKIP_BIN_CHECK").is_ok() {
        return;
    }

    let extension_bundle_path = extension_dist_dir.join("embedded-server.mjs");
    if !extension_bundle_path.is_file() {
        panic!(
            "\n\n\
             Ompcot release build aborted: embedded-server extension bundle is missing.\n\
             Expected: {}\n\n\
             Release builds ship the bundled extension instead of relying on\n\
             repo-local TypeScript sources or node_modules.\n\n\
             Fix: run `bun run build:extensions` from the repo root before building.\n\
             (Or `bun run build`, which already does this for you.)\n\n\
             To bypass this check (NOT for shipping builds), set\n\
             OMCOT_SKIP_BIN_CHECK=1.\n\n",
            extension_bundle_path.display()
        );
    }
}
