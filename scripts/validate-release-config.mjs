import { readFile } from "node:fs/promises";

const files = {
  workflow: ".github/workflows/release.yml",
  packageJson: "package.json",
  cargoToml: "src-tauri/Cargo.toml",
  tauriConfig: "src-tauri/tauri.conf.json",
  releaseTemplate: "src-tauri/tauri.release.conf.template.json",
  releaseDocs: "docs/release/auto-updates.md",
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function versionFromCargo(toml) {
  const packageSection = toml.match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? "";
  return packageSection.match(/version\s*=\s*"([^"]+)"/)?.[1];
}

const [workflow, packageJsonRaw, cargoToml, tauriConfigRaw, releaseTemplateRaw, releaseDocs] = await Promise.all(
  Object.values(files).map((file) => readFile(file, "utf8")),
);

const packageJson = JSON.parse(packageJsonRaw);
const tauriConfig = JSON.parse(tauriConfigRaw);
const releaseTemplate = JSON.parse(releaseTemplateRaw);
const cargoVersion = versionFromCargo(cargoToml);

assert(packageJson.version === tauriConfig.version, "package.json and tauri.conf.json versions must match.");
assert(packageJson.version === cargoVersion, "package.json and Cargo.toml versions must match.");

assert(workflow.includes("tags:"), "Release workflow must be tag-driven.");
assert(workflow.includes("v*.*.*"), "Release workflow must listen for SemVer-shaped v*.*.* tags.");
assert(workflow.includes("^v[0-9]+\\.[0-9]+\\.[0-9]+"), "Release workflow must validate exact SemVer tags.");
assert(workflow.includes("tauri-apps/tauri-action@v0"), "Release workflow must use tauri-action.");
assert(workflow.includes("ubuntu-22.04"), "Release workflow must build Linux AppImage on Ubuntu 22.04.");
assert(workflow.includes("macos-latest"), "Release workflow must build macOS artifacts.");
assert(workflow.includes("aarch64-apple-darwin"), "Release workflow must build Apple Silicon macOS artifacts.");
assert(!workflow.includes("x86_64-apple-darwin"), "Release workflow should not build Intel macOS artifacts for v1.");
assert(workflow.includes("TAURI_SIGNING_PRIVATE_KEY"), "Release workflow must require updater signing secrets.");
assert(workflow.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD"), "Release workflow must provide the updater signing key password.");
assert(workflow.includes("includeUpdaterJson: true"), "Release workflow must upload signed updater metadata.");
assert(
  workflow.includes("--config src-tauri/tauri.release.generated.conf.json"),
  "Release workflow must build with generated updater release config.",
);
assert(
  workflow.includes("scripts/verify-release-artifacts.mjs"),
  "Release workflow must verify signed updater artifacts before finishing.",
);
assert(workflow.includes("prerelease: false"), "Release workflow must publish latest-compatible GitHub releases for the updater endpoint.");
assert(!workflow.includes("APPLE_CERTIFICATE"), "Release workflow must not require macOS signing secrets yet.");
assert(!workflow.includes("APPLE_API_KEY_PATH"), "Release workflow must not require macOS notarization secrets yet.");
assert(workflow.includes("npm run test:release-config"), "Release workflow must run release dry-run checks.");
assert(workflow.includes("npm run test:smoke"), "Release workflow must run smoke tests before publishing.");

assert(
  packageJson.dependencies?.["@tauri-apps/plugin-updater"],
  "Runtime app must depend on the Tauri updater JavaScript plugin.",
);
assert(
  packageJson.dependencies?.["@tauri-apps/plugin-process"],
  "Runtime app must depend on the Tauri process JavaScript plugin for relaunch.",
);
assert(cargoToml.includes("tauri-plugin-updater"), "Rust app must register the Tauri updater plugin.");
assert(cargoToml.includes("tauri-plugin-process"), "Rust app must register the Tauri process plugin.");

assert(releaseTemplate.bundle?.createUpdaterArtifacts === true, "Release template must enable updater artifacts.");
assert(
  releaseTemplate.bundle?.targets?.includes("appimage"),
  "Release template must include AppImage as a bundle target.",
);
assert(
  releaseTemplate.plugins?.updater?.pubkey === "${NARVIEW_UPDATER_PUBLIC_KEY}",
  "Release template must receive the updater public key from CI.",
);
assert(
  releaseTemplate.plugins?.updater?.endpoints?.includes("${NARVIEW_UPDATER_ENDPOINT}"),
  "Release template must receive the updater endpoint from CI.",
);

assert(tauriConfig.bundle?.targets?.includes("appimage"), "Default Tauri config must keep AppImage enabled.");
assert(tauriConfig.plugins?.updater?.pubkey, "Default Tauri config must include an updater public key.");
assert(
  tauriConfig.plugins?.updater?.endpoints?.includes(
    "https://github.com/Resplendent-Data/Narview/releases/latest/download/latest.json",
  ),
  "Default Tauri config must point update checks at the Narview GitHub Release latest.json.",
);
assert(releaseDocs.includes("TAURI_SIGNING_PRIVATE_KEY"), "Release docs must describe updater signing secrets.");
assert(releaseDocs.includes("GitHub's latest release endpoint ignores prereleases"), "Release docs must explain latest-compatible RC publishing.");
assert(releaseDocs.includes("v0.1.0"), "Release docs must show the SemVer tag shape.");

console.log("Release configuration dry-run checks passed.");
