import type { CachedFileSummary } from "./pr-cache";
import { getFileKind, type FileKind } from "./file-changes";

export type DiffMode = "unified" | "side-by-side";
export type DiffLineKind = "context" | "addition" | "deletion";

export interface DiffLine {
  oldLine: number | null;
  newLine: number | null;
  kind: DiffLineKind;
  content: string;
  highlighted: boolean;
  language: string;
}

export interface DiffHunkView {
  id: string;
  header: string;
  loaded: boolean;
  expandable: boolean;
  expanded: boolean;
  lines: DiffLine[];
}

export interface LazyDiffState {
  filePath: string;
  mode: DiffMode;
  kind: FileKind;
  language: string;
  githubUrl: string;
  hunks: DiffHunkView[];
  fullFileLines: DiffLine[] | null;
}

export interface LazyDiffOptions {
  mode: DiffMode;
  repository: string;
  pullRequestNumber: number;
  loadedHunkIds?: string[];
  expandedHunkIds?: string[];
  fullFileLoaded?: boolean;
}

export interface HighlightWindow {
  visibleStart: number;
  visibleEnd: number;
  overscan?: number;
}

interface HunkDescriptor {
  id: string;
  header: string;
  startLine: number;
}

export const diffViewerStorageKey = "narview.diffViewerPreferences.v1";

export function readDiffModePreference(): DiffMode {
  if (typeof window === "undefined") {
    return "unified";
  }

  const raw = window.localStorage.getItem(diffViewerStorageKey);
  if (!raw) {
    return "unified";
  }

  try {
    const parsed = JSON.parse(raw) as { mode?: DiffMode };
    return parsed.mode === "side-by-side" ? "side-by-side" : "unified";
  } catch {
    return "unified";
  }
}

export function writeDiffModePreference(mode: DiffMode) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(diffViewerStorageKey, JSON.stringify({ version: 1, mode }));
  }
}

export function getDefaultLoadedDiffHunkIds(file: CachedFileSummary) {
  if (getFileKind(file) !== "text") {
    return [];
  }

  if (file.patch) {
    return parsePatch(file.patch, file.path).map((hunk) => hunk.id);
  }

  if (file.patch === null) {
    return [];
  }

  return getDiffHunkDescriptors(file).map((descriptor) => descriptor.id);
}

export function buildLazyDiffState(file: CachedFileSummary, options: LazyDiffOptions): LazyDiffState {
  const kind = getFileKind(file);
  const language = getLanguageForPath(file.path);
  const githubUrl = `https://github.com/${options.repository}/pull/${options.pullRequestNumber}/files`;

  if (kind !== "text") {
    return {
      filePath: file.path,
      mode: options.mode,
      kind,
      language,
      githubUrl,
      hunks: [],
      fullFileLines: null,
    };
  }

  const patchHunks = file.patch ? parsePatch(file.patch, file.path) : [];
  if (patchHunks.length > 0) {
    const loaded = new Set([...getDefaultLoadedDiffHunkIds(file), ...(options.loadedHunkIds ?? [])]);
    const hunks = patchHunks.map((hunk) => {
      const isLoaded = loaded.has(hunk.id);

      return {
        id: hunk.id,
        header: hunk.header,
        loaded: isLoaded,
        expandable: false,
        expanded: false,
        lines: isLoaded ? highlightLoadedDiffLines(hunk.lines, file.path) : [],
      };
    });

    return {
      filePath: file.path,
      mode: options.mode,
      kind,
      language,
      githubUrl,
      hunks,
      fullFileLines: options.fullFileLoaded ? highlightLoadedDiffLines(patchHunks.flatMap((hunk) => hunk.lines), file.path) : null,
    };
  }

  if (file.patch === null) {
    return {
      filePath: file.path,
      mode: options.mode,
      kind,
      language,
      githubUrl,
      hunks: [],
      fullFileLines: null,
    };
  }

  const loaded = new Set([...getDefaultLoadedDiffHunkIds(file), ...(options.loadedHunkIds ?? [])]);
  const expanded = new Set(options.expandedHunkIds ?? []);
  const descriptors = getDiffHunkDescriptors(file);
  const hunks = descriptors.map((descriptor, index) => {
    const isLoaded = loaded.has(descriptor.id);
    const isExpanded = expanded.has(descriptor.id);
    const rawLines = isLoaded ? buildHunkLines(file, descriptor, index, isExpanded) : [];

    return {
      id: descriptor.id,
      header: descriptor.header,
      loaded: isLoaded,
      expandable: isLoaded,
      expanded: isExpanded,
      lines: highlightLoadedDiffLines(rawLines, file.path),
    };
  });

  return {
    filePath: file.path,
    mode: options.mode,
    kind,
    language,
    githubUrl,
    hunks,
    fullFileLines: options.fullFileLoaded ? buildFullFileLines(file, language) : null,
  };
}

export function highlightDiffLines(lines: DiffLine[], filePath: string, window: HighlightWindow) {
  const language = getLanguageForPath(filePath);
  const overscan = window.overscan ?? 8;
  const start = Math.max(0, window.visibleStart - overscan);
  const end = Math.min(lines.length - 1, window.visibleEnd + overscan);

  return lines.map((line, index) => ({
    ...line,
    highlighted: index >= start && index <= end,
    language,
  }));
}

function highlightLoadedDiffLines(lines: DiffLine[], filePath: string) {
  const language = getLanguageForPath(filePath);

  return lines.map((line) => ({
    ...line,
    highlighted: true,
    language,
  }));
}

export function getLanguageForPath(path: string) {
  const extension = getExtension(path.toLowerCase());
  const languages: Record<string, string> = {
    ".bash": "shell",
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".css": "css",
    ".dart": "dart",
    ".go": "go",
    ".h": "c",
    ".hpp": "cpp",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".kt": "kotlin",
    ".md": "markdown",
    ".php": "php",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".scss": "scss",
    ".sh": "shell",
    ".sql": "sql",
    ".swift": "swift",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".zsh": "shell",
  };

  return languages[extension] ?? "text";
}

function getDiffHunkDescriptors(file: CachedFileSummary): HunkDescriptor[] {
  const changedLines = Math.max(file.additions + file.deletions, 1);
  const secondStart = Math.min(160, Math.max(42, changedLines));

  return [
    {
      id: `${file.path}:primary`,
      header: `@@ -1,6 +1,8 @@ ${file.path}`,
      startLine: 1,
    },
    {
      id: `${file.path}:secondary`,
      header: `@@ -${secondStart},5 +${secondStart},7 @@ ${file.path}`,
      startLine: secondStart,
    },
  ];
}

function parsePatch(patch: string, filePath: string): DiffHunkView[] {
  const hunks: DiffHunkView[] = [];
  let current: { id: string; header: string; lines: DiffLine[]; oldLine: number; newLine: number } | null = null;

  for (const rawLine of patch.split("\n")) {
    if (rawLine.startsWith("@@")) {
      const match = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      const hunkIndex = hunks.length + 1;
      current = {
        id: `${filePath}:hunk-${hunkIndex}`,
        header: rawLine,
        lines: [],
        oldLine: match ? Number(match[1]) : 0,
        newLine: match ? Number(match[2]) : 0,
      };
      hunks.push({
        id: current.id,
        header: current.header,
        loaded: false,
        expandable: false,
        expanded: false,
        lines: current.lines,
      });
      continue;
    }

    if (!current || rawLine.startsWith("\\ No newline")) {
      continue;
    }

    const prefix = rawLine[0];
    const content = rawLine.slice(1);

    if (prefix === "+") {
      current.lines.push(createLine(null, current.newLine, "addition", content));
      current.newLine += 1;
    } else if (prefix === "-") {
      current.lines.push(createLine(current.oldLine, null, "deletion", content));
      current.oldLine += 1;
    } else {
      current.lines.push(createLine(current.oldLine, current.newLine, "context", rawLine.startsWith(" ") ? content : rawLine));
      current.oldLine += 1;
      current.newLine += 1;
    }
  }

  return hunks;
}

function buildHunkLines(file: CachedFileSummary, descriptor: HunkDescriptor, index: number, expanded: boolean): DiffLine[] {
  const name = toIdentifier(file.path);
  const base = descriptor.startLine;
  const lines: DiffLine[] = [];

  if (expanded) {
    lines.push(createLine(base - 2, base - 2, "context", `// context before ${file.path}`));
    lines.push(createLine(base - 1, base - 1, "context", `const previous${name} = loadPreviousState();`));
  }

  if (file.status === "added") {
    lines.push(createLine(null, base, "addition", `export function ${name}() {`));
    lines.push(createLine(null, base + 1, "addition", `  return create${name}();`));
    lines.push(createLine(null, base + 2, "addition", "}"));
  } else {
    lines.push(createLine(base, base, "context", `export function update${name}() {`));
    lines.push(createLine(base + 1, null, "deletion", `  const value = previous${name};`));
    lines.push(createLine(null, base + 1, "addition", `  const value = next${name};`));
    lines.push(createLine(base + 2, base + 2, "context", "  return value;"));
    if (index === 1) {
      lines.push(createLine(base + 3, null, "deletion", "  logger.debug(value);"));
      lines.push(createLine(null, base + 3, "addition", "  logger.info(value);"));
    }
    lines.push(createLine(base + 4, base + 4, "context", "}"));
  }

  if (expanded) {
    lines.push(createLine(base + 5, base + 5, "context", `const next${name} = loadNextState();`));
    lines.push(createLine(base + 6, base + 6, "context", `// context after ${file.path}`));
  }

  return lines;
}

function buildFullFileLines(file: CachedFileSummary, language: string): DiffLine[] {
  const name = toIdentifier(file.path);
  const lines = [
    createLine(1, 1, "context", `import { loadNextState } from "${name}";`),
    createLine(2, 2, "context", ""),
    createLine(3, 3, "context", `export function update${name}() {`),
    createLine(4, 4, "addition", `  const value = next${name};`),
    createLine(5, 5, "context", "  return value;"),
    createLine(6, 6, "context", "}"),
  ];

  return lines.map((line) => ({ ...line, highlighted: true, language }));
}

function createLine(oldLine: number | null, newLine: number | null, kind: DiffLineKind, content: string): DiffLine {
  return {
    oldLine,
    newLine,
    kind,
    content,
    highlighted: false,
    language: "text",
  };
}

function toIdentifier(path: string) {
  const fileName = path.split("/").at(-1) ?? path;
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, letter: string) => letter.toUpperCase())
    .replace(/^[^a-zA-Z]+/, "")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function getExtension(path: string) {
  const lastSlash = path.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot) : "";
}
