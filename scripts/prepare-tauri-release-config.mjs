import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const outputIndex = process.argv.indexOf("--output");
const templatePath = resolve("src-tauri/tauri.release.conf.template.json");
const outputPath =
  outputIndex >= 0 && process.argv[outputIndex + 1]
    ? resolve(process.argv[outputIndex + 1])
    : resolve("src-tauri/tauri.release.generated.conf.json");
const dryRun = args.has("--dry-run");

const publicKey = process.env.NARVIEW_UPDATER_PUBLIC_KEY;
const endpoint =
  process.env.NARVIEW_UPDATER_ENDPOINT ??
  (process.env.GITHUB_REPOSITORY
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/releases/latest/download/latest.json`
    : undefined);

const missing = [
  ["NARVIEW_UPDATER_PUBLIC_KEY", publicKey],
  ["NARVIEW_UPDATER_ENDPOINT or GITHUB_REPOSITORY", endpoint],
].filter(([, value]) => !value);

if (missing.length > 0) {
  throw new Error(`Missing release config input: ${missing.map(([name]) => name).join(", ")}`);
}

const template = await readFile(templatePath, "utf8");
const rendered = template
  .replaceAll("${NARVIEW_UPDATER_PUBLIC_KEY}", publicKey)
  .replaceAll("${NARVIEW_UPDATER_ENDPOINT}", endpoint);

const config = JSON.parse(rendered);

if (config.bundle?.createUpdaterArtifacts !== true) {
  throw new Error("Release config must enable bundle.createUpdaterArtifacts.");
}

if (!Array.isArray(config.plugins?.updater?.endpoints) || config.plugins.updater.endpoints.length === 0) {
  throw new Error("Release config must define at least one updater endpoint.");
}

if (!config.plugins?.updater?.pubkey || config.plugins.updater.pubkey.includes("${")) {
  throw new Error("Release config must contain a concrete updater public key.");
}

if (dryRun) {
  console.log(`Validated release config for ${config.plugins.updater.endpoints[0]}`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}
