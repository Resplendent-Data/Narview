import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(desktopRoot, "../..");

const requiredFiles = {
  acceptance: resolve(repoRoot, "docs/release/v1-acceptance.md"),
  packageJson: resolve(desktopRoot, "package.json"),
  smokeTests: resolve(desktopRoot, "src/App.smoke.test.tsx"),
  privacy: resolve(desktopRoot, "src/lib/privacy-diagnostics.ts"),
  tauriConfig: resolve(desktopRoot, "src-tauri/tauri.conf.json"),
  releaseTemplate: resolve(desktopRoot, "src-tauri/tauri.release.conf.template.json"),
  releaseWorkflow: resolve(repoRoot, ".github/workflows/release.yml"),
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} must include: ${needle}`);
}

const [acceptance, packageJsonRaw, smokeTests, privacy, tauriConfigRaw, releaseTemplateRaw, releaseWorkflow] =
  await Promise.all(Object.values(requiredFiles).map((file) => readFile(file, "utf8")));

const packageJson = JSON.parse(packageJsonRaw);
const tauriConfig = JSON.parse(tauriConfigRaw);
const releaseTemplate = JSON.parse(releaseTemplateRaw);
const allDependencyNames = [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
].map((name) => name.toLowerCase());

const forbiddenRuntimeDependencies = [
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "posthog-js",
  "mixpanel-browser",
  "@sentry/browser",
  "@segment/analytics-next",
];

for (const dependency of forbiddenRuntimeDependencies) {
  assert(!allDependencyNames.includes(dependency), `Out-of-scope dependency detected: ${dependency}`);
}

const expectedEvidence = [
  "Reviewer workspace and review flow",
  "Viewed state and local review continuity",
  "File review and diff depth",
  "Pending Review workflow",
  "Keyboard, updates, and diagnostics",
  "Large Pull Request usability",
  "Release pipeline readiness",
  "Scope audit",
];

for (const evidence of expectedEvidence) {
  assertIncludes(acceptance, `| ${evidence} | Pass |`, "Acceptance checklist");
}

const expectedSmokeCoverage = [
  "renders deterministic stacks, layers, and the active diff",
  "renders freshly fetched patches even when Pull Request cache persistence fails",
  "recovers missing active-file patch content from the prepared review clone",
  "syncs stack viewed state through the GitHub viewed action",
  "keeps the review composer usable while stack viewed sync runs in the background",
  "rolls back only files that fail during stack viewed sync",
  "moves between layers from the keyboard",
  "marks the active file viewed from the header button and V hotkey",
  "collapses viewed files by default and lets users expand them",
  "filters All Files and toggles focus mode",
  "opens the pull request in GitHub with the O shortcut",
  "shows the current app version and checks for updates from the footer",
  "opens a rich pull request picker with P and switches pull requests",
  "opens symbol references and definitions from highlighted code",
  "adds a line comment to the pending review and submits it",
  "submits an approval without draft review comments",
  "reconnects to an existing pending review draft on load",
  "shows inline GitHub errors when adding a draft comment fails",
  "keeps external GitHub navigation wired through the opener plugin",
];

for (const testName of expectedSmokeCoverage) {
  assertIncludes(smokeTests, testName, "Smoke test coverage");
}

assertIncludes(privacy, "enabled: false", "Telemetry policy");
assertIncludes(privacy, "analyticsSinks: []", "Telemetry policy");
assertIncludes(privacy, "crashReportSinks: []", "Telemetry policy");
assertIncludes(privacy, "remoteLogSinks: []", "Telemetry policy");

assert(tauriConfig.app?.windows?.length === 1, "V1 must stay one main window.");
assert(tauriConfig.bundle?.targets?.includes("dmg"), "macOS DMG target must stay enabled.");
assert(tauriConfig.bundle?.targets?.includes("appimage"), "Linux AppImage target must stay enabled.");
assert(tauriConfig.plugins?.updater?.pubkey, "Runtime updater public key must stay configured.");
assert(tauriConfig.plugins?.updater?.endpoints?.[0]?.includes("Resplendent-Data/Narview"), "Runtime updater endpoint must stay on Narview GitHub Releases.");
assert(releaseTemplate.bundle?.createUpdaterArtifacts === true, "Release updater artifacts must stay enabled.");
assertIncludes(releaseWorkflow, "ubuntu-22.04", "Release workflow");
assertIncludes(releaseWorkflow, "macos-latest", "Release workflow");

const unsupportedFeaturePhrases = [
  "Mobile Client: Present in monorepo but outside desktop V1 release gate",
  "Browser-hosted app: Not present",
  "Windows support: Not present",
  "GitHub Enterprise Server: Not present",
  "Multiple GitHub accounts: Not present",
  "User-managed local checkout mutation: Not present",
  "Merging Pull Requests: Not present",
  "LLM-generated summaries or analysis: Not present",
  "Telemetry or analytics: Not present",
  "Multi-window support: Not present",
];

for (const phrase of unsupportedFeaturePhrases) {
  assertIncludes(acceptance, phrase, "Scope audit");
}

console.log("V1 acceptance audit passed.");
