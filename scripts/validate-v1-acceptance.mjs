import { readFile } from "node:fs/promises";

const requiredFiles = {
  acceptance: "docs/release/v1-acceptance.md",
  packageJson: "package.json",
  smokeTests: "src/App.smoke.test.tsx",
  privacy: "src/lib/privacy-diagnostics.ts",
  tauriConfig: "src-tauri/tauri.conf.json",
  releaseTemplate: "src-tauri/tauri.release.conf.template.json",
  releaseWorkflow: ".github/workflows/release.yml",
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
  "Reviewer workspace and sign-in",
  "Thread actions and local state separation",
  "File review and diff depth",
  "Session continuity",
  "Handoff, keyboard, privacy, and diagnostics",
  "Large Pull Request usability",
  "Release pipeline readiness",
  "Scope audit",
];

for (const evidence of expectedEvidence) {
  assertIncludes(acceptance, `| ${evidence} | Pass |`, "Acceptance checklist");
}

const expectedSmokeCoverage = [
  "starts the GitHub OAuth device flow from the sign-in button",
  "saves and removes GitHub repositories in the Workspace",
  "quick-opens a Pull Request URL without saving a repository",
  "shows the Review Overview metadata and high-level counts",
  "filters Review Queues across source, reviewed state, and thread state",
  "marks Review Threads reviewed locally and distinguishes outdated threads in the UI",
  "adds a Reply to the selected GitHub Review Thread",
  "resolves and unresolves Review Threads while preserving local Reviewed state",
  "reports partial failures for confirmed bulk GitHub actions and applies local side effects only to successes",
  "loads hunks, expands context, and fetches the whole file on demand",
  "restores the last active Pull Request after app restart",
  "updates Review Session state as the reviewer navigates threads",
  "builds structured handoff packets without LLM behavior or code mutation",
  "opens the command palette from the button and keyboard shortcut",
  "runs the keyboard review loop with visible shortcut cues",
  "previews and copies redacted diagnostics on explicit user action",
  "redacts operational logs and exposes no telemetry emission paths",
  "keeps large Pull Request overview, queues, files, and lazy diff usable within performance thresholds",
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
assert(releaseTemplate.bundle?.createUpdaterArtifacts === true, "Release updater artifacts must stay enabled.");
assertIncludes(releaseWorkflow, "ubuntu-22.04", "Release workflow");
assertIncludes(releaseWorkflow, "macos-latest", "Release workflow");
assertIncludes(releaseWorkflow, "uploadUpdaterJson: true", "Release workflow");

const unsupportedFeaturePhrases = [
  "Mobile apps: Not present",
  "Browser-hosted app: Not present",
  "Windows support: Not present",
  "GitHub Enterprise Server: Not present",
  "Multiple GitHub accounts: Not present",
  "Local clone or local Git operations: Not present",
  "Merging Pull Requests: Not present",
  "Full GitHub review submission: Not present",
  "Creating new Review Threads: Not present",
  "LLM-generated summaries or analysis: Not present",
  "Telemetry or analytics: Not present",
  "Multi-window support: Not present",
];

for (const phrase of unsupportedFeaturePhrases) {
  assertIncludes(acceptance, phrase, "Scope audit");
}

console.log("V1 acceptance audit passed.");
