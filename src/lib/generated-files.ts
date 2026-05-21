const generatedPathSegments = [
  "__generated__",
  "generated",
  "vendor",
  "vendors",
  "third_party",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "out",
];

const generatedFileEndings = [
  ".lock",
  ".min.js",
  ".min.css",
  ".bundle.js",
  ".generated.ts",
  ".generated.tsx",
  ".generated.js",
  ".generated.jsx",
  ".pb.go",
  ".pb.ts",
  ".pb.js",
  ".snap",
];

const generatedExactFiles = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "poetry.lock",
  "cargo.lock",
  "gemfile.lock",
]);

export function isGeneratedOrLowSignalPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  const fileName = normalizedPath.split("/").at(-1) ?? normalizedPath;
  const segments = normalizedPath.split("/");

  return (
    generatedExactFiles.has(fileName) ||
    generatedPathSegments.some((segment) => segments.includes(segment)) ||
    generatedFileEndings.some((ending) => normalizedPath.endsWith(ending))
  );
}
