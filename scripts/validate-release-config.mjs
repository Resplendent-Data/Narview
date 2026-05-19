import { readFile } from "node:fs/promises";
import { verifyReleaseArtifacts } from "./verify-release-artifacts.mjs";

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
assert(workflow.includes("uploadUpdaterJson: true"), "Release workflow must upload updater metadata.");
assert(workflow.includes("ubuntu-22.04"), "Release workflow must build Linux AppImage on Ubuntu 22.04.");
assert(workflow.includes("macos-latest"), "Release workflow must build macOS artifacts.");
assert(workflow.includes("aarch64-apple-darwin"), "Release workflow must build Apple Silicon macOS artifacts.");
assert(workflow.includes("x86_64-apple-darwin"), "Release workflow must build Intel macOS artifacts.");
assert(workflow.includes("TAURI_SIGNING_PRIVATE_KEY"), "Release workflow must require Tauri updater signing key.");
assert(workflow.includes("NARVIEW_UPDATER_PUBLIC_KEY"), "Release workflow must inject the updater public key.");
assert(workflow.includes("APPLE_CERTIFICATE"), "Release workflow must support macOS signing certificates.");
assert(workflow.includes("APPLE_API_KEY_PATH"), "Release workflow must support macOS notarization API keys.");
assert(workflow.includes("scripts/verify-release-artifacts.mjs"), "Release workflow must verify uploaded artifact paths.");
assert(workflow.includes("npm run test:release-config"), "Release workflow must run release dry-run checks.");
assert(workflow.includes("npm run test:smoke"), "Release workflow must run smoke tests before publishing.");

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
assert(releaseDocs.includes("TAURI_SIGNING_PRIVATE_KEY"), "Release docs must describe updater signing secrets.");
assert(releaseDocs.includes("APPLE_CERTIFICATE"), "Release docs must describe macOS signing secrets.");
assert(releaseDocs.includes("v0.1.0"), "Release docs must show the SemVer tag shape.");

verifyReleaseArtifacts({
  platform: "linux",
  artifactPaths:
    '["target/release/bundle/appimage/Narview_0.1.0_amd64.AppImage","target/release/bundle/appimage/Narview_0.1.0_amd64.AppImage.sig"]',
});

verifyReleaseArtifacts({
  platform: "macos",
  artifactPaths:
    '["target/release/bundle/dmg/Narview_0.1.0_aarch64.dmg","target/aarch64-apple-darwin/release/bundle/macos/Narview.app.tar.gz","target/aarch64-apple-darwin/release/bundle/macos/Narview.app.tar.gz.sig"]',
});

console.log("Release configuration dry-run checks passed.");
