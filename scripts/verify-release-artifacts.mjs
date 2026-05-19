import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[index + 1]?.startsWith("--") ? "true" : (argv[index + 1] ?? "true");
    result[key] = value;

    if (value !== "true") {
      index += 1;
    }
  }

  return result;
}

function parseArtifactPaths(raw) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => (typeof item === "string" ? [item] : []));
    }
  } catch {
    // The action output format has changed before, so keep a tolerant text parser.
  }

  return raw
    .split(/[\n,;]+/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function expectSome(paths, description, matcher) {
  if (!paths.some(matcher)) {
    throw new Error(`Missing ${description}. Received: ${paths.join(", ") || "(none)"}`);
  }
}

export function verifyReleaseArtifacts({ artifactPaths, platform }) {
  const normalizedPlatform = platform.toLowerCase();
  const paths = parseArtifactPaths(artifactPaths);

  if (paths.length === 0) {
    throw new Error("No Tauri artifact paths were reported.");
  }

  expectSome(paths, "signed updater artifact", (path) => path.endsWith(".sig"));

  if (normalizedPlatform.includes("linux")) {
    expectSome(paths, "Linux AppImage", (path) => path.endsWith(".AppImage"));
    expectSome(paths, "Linux AppImage signature", (path) => path.endsWith(".AppImage.sig"));
  }

  if (normalizedPlatform.includes("mac")) {
    expectSome(paths, "macOS DMG", (path) => path.endsWith(".dmg"));
    expectSome(paths, "macOS updater archive", (path) => path.endsWith(".app.tar.gz"));
    expectSome(paths, "macOS updater signature", (path) => path.endsWith(".app.tar.gz.sig"));
  }

  return paths;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));

  if (!args["artifact-paths"] || !args.platform) {
    throw new Error("Usage: node scripts/verify-release-artifacts.mjs --platform <linux|macos> --artifact-paths <paths>");
  }

  const verified = verifyReleaseArtifacts({
    artifactPaths: args["artifact-paths"],
    platform: args.platform,
  });

  console.log(`Verified ${verified.length} release artifact path(s) for ${args.platform}.`);
}
