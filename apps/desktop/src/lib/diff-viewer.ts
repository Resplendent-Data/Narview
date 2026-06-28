import type { CachedFileSummary } from "./pr-cache";
import { getFileKind, type FileKind } from "./file-changes";
import { setLocalStorageItem } from "./local-storage";

export type DiffMode = "unified" | "side-by-side";
export type DiffLineKind = "context" | "addition" | "deletion";

export interface DiffLine {
  oldLine: number | null;
  newLine: number | null;
  kind: DiffLineKind;
  content: string;
  highlighted: boolean;
  language: string;
  sourceContext?: boolean;
}

export interface DiffHunkView {
  id: string;
  header: string;
  loaded: boolean;
  expandable: boolean;
  expanded: boolean;
  canExpandBefore: boolean;
  canExpandAfter: boolean;
  contextBefore: number;
  contextAfter: number;
  sourceHunkIds?: string[];
  expandBeforeHunkId?: string;
  expandAfterHunkId?: string;
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

export interface DiffHunkExpansion {
  before: number;
  after: number;
}

export interface LazyDiffOptions {
  mode: DiffMode;
  repository: string;
  pullRequestNumber: number;
  loadedHunkIds?: string[];
  expandedHunkIds?: string[];
  expandedHunkContexts?: Record<string, DiffHunkExpansion>;
  fullFileLoaded?: boolean;
  sourceContent?: string | null;
}

export interface HighlightWindow {
  visibleStart: number;
  visibleEnd: number;
  overscan?: number;
}

interface PatchHunkView extends DiffHunkView {
  oldStart: number | null;
  newStart: number | null;
}

export const diffViewerStorageKey = "narview.diffViewerPreferences.v1";
export const diffContextExpansionLineCount = 20;

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
    setLocalStorageItem(diffViewerStorageKey, JSON.stringify({ version: 1, mode }));
  }
}

export function getDefaultLoadedDiffHunkIds(file: CachedFileSummary) {
  if (getFileKind(file) !== "text") {
    return [];
  }

  if (file.patch) {
    return parsePatch(file.patch, file.path).map((hunk) => hunk.id);
  }

  return [];
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

  const sourceLines = typeof options.sourceContent === "string" ? splitSourceLines(options.sourceContent) : null;
  const patchHunks = file.patch ? parsePatch(file.patch, file.path) : [];
  if (patchHunks.length > 0) {
    const loaded = new Set([...getDefaultLoadedDiffHunkIds(file), ...(options.loadedHunkIds ?? [])]);
    const hunks = mergeOverlappingDiffHunks(
      patchHunks.map((hunk) => {
        const isLoaded = loaded.has(hunk.id);
        const expansion = options.expandedHunkContexts?.[hunk.id] ?? { before: 0, after: 0 };
        const expandedHunk = sourceLines && isLoaded ? expandPatchHunkWithSourceContext(hunk, sourceLines, expansion) : hunk;

        return {
          id: expandedHunk.id,
          header: expandedHunk.header,
          loaded: isLoaded,
          expandable: Boolean(sourceLines && isLoaded),
          expanded: expandedHunk.contextBefore > 0 || expandedHunk.contextAfter > 0,
          canExpandBefore: Boolean(sourceLines && isLoaded && expandedHunk.canExpandBefore),
          canExpandAfter: Boolean(sourceLines && isLoaded && expandedHunk.canExpandAfter),
          contextBefore: sourceLines && isLoaded ? expandedHunk.contextBefore : 0,
          contextAfter: sourceLines && isLoaded ? expandedHunk.contextAfter : 0,
          sourceHunkIds: [expandedHunk.id],
          expandBeforeHunkId: expandedHunk.id,
          expandAfterHunkId: expandedHunk.id,
          lines: isLoaded ? highlightLoadedDiffLines(expandedHunk.lines, file.path) : [],
        };
      }),
    );

    return {
      filePath: file.path,
      mode: options.mode,
      kind,
      language,
      githubUrl,
      hunks,
      fullFileLines: options.fullFileLoaded
        ? sourceLines
          ? highlightLoadedDiffLines(buildSourceFullFileLines(sourceLines), file.path)
          : highlightLoadedDiffLines(patchHunks.flatMap((hunk) => hunk.lines), file.path)
        : null,
    };
  }

  return {
    filePath: file.path,
    mode: options.mode,
    kind,
    language,
    githubUrl,
    hunks: [],
    fullFileLines: options.fullFileLoaded && sourceLines
      ? highlightLoadedDiffLines(buildSourceFullFileLines(sourceLines), file.path)
      : null,
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

function mergeOverlappingDiffHunks(hunks: DiffHunkView[]) {
  const merged: DiffHunkView[] = [];

  for (const hunk of hunks) {
    const previous = merged.at(-1);
    if (!previous || !hunksOverlap(previous, hunk)) {
      merged.push(hunk);
      continue;
    }

    merged[merged.length - 1] = mergeDiffHunks(previous, hunk);
  }

  return merged;
}

function hunksOverlap(left: DiffHunkView, right: DiffHunkView) {
  const leftRange = getVisibleHunkRange(left);
  const rightRange = getVisibleHunkRange(right);

  return Boolean(leftRange && rightRange && rightRange.start <= leftRange.end + 1);
}

function mergeDiffHunks(left: DiffHunkView, right: DiffHunkView): DiffHunkView {
  const leftRange = getVisibleHunkRange(left);
  const rightRange = getVisibleHunkRange(right);
  const startOwner = !leftRange || (rightRange && rightRange.start < leftRange.start) ? right : left;
  const endOwner = !leftRange || (rightRange && rightRange.end > leftRange.end) ? right : left;
  const sourceHunkIds = [...(left.sourceHunkIds ?? [left.id]), ...(right.sourceHunkIds ?? [right.id])];

  return {
    id: sourceHunkIds.join("+"),
    header: startOwner.header,
    loaded: left.loaded || right.loaded,
    expandable: left.expandable || right.expandable,
    expanded: left.expanded || right.expanded,
    canExpandBefore: startOwner.canExpandBefore,
    canExpandAfter: endOwner.canExpandAfter,
    contextBefore: startOwner.contextBefore,
    contextAfter: endOwner.contextAfter,
    sourceHunkIds,
    expandBeforeHunkId: getExpandBeforeHunkId(startOwner),
    expandAfterHunkId: getExpandAfterHunkId(endOwner),
    lines: mergeDiffHunkLines(left.lines, right.lines),
  };
}

function mergeDiffHunkLines(left: DiffLine[], right: DiffLine[]) {
  const rightPatchRange = getPatchLineRange(right) ?? getLineRange(right);
  if (!rightPatchRange) {
    return dedupeDiffLines([...left, ...right]);
  }

  const leftRange = getLineRange(left);
  const beforeLines: DiffLine[] = [];
  const afterLines: DiffLine[] = [];

  for (const line of left) {
    const position = getDiffLineSortPosition(line);
    if (line.sourceContext && position >= rightPatchRange.start && position <= rightPatchRange.end) {
      continue;
    }

    if (position > rightPatchRange.end) {
      afterLines.push(line);
    } else {
      beforeLines.push(line);
    }
  }

  const rightLines = right.filter((line) => {
    if (!line.sourceContext || !leftRange) {
      return true;
    }

    const position = getDiffLineSortPosition(line);
    return position < leftRange.start || position > leftRange.end;
  });

  return dedupeDiffLines([...beforeLines, ...rightLines, ...afterLines]);
}

function getVisibleHunkRange(hunk: DiffHunkView) {
  return getLineRange(hunk.lines);
}

function getLineRange(lines: DiffLine[]) {
  const lineNumbers = lines.flatMap((line) => [line.newLine, line.oldLine]).filter((lineNumber): lineNumber is number => lineNumber !== null);
  if (lineNumbers.length === 0) {
    return null;
  }

  return {
    start: Math.min(...lineNumbers),
    end: Math.max(...lineNumbers),
  };
}

function getPatchLineRange(lines: DiffLine[]) {
  return getLineRange(lines.filter((line) => !line.sourceContext));
}

function dedupeDiffLines(lines: DiffLine[]) {
  const deduped = new Map<string, DiffLine>();

  for (const line of lines) {
    const key = getDiffLineMergeKey(line);
    if (!deduped.has(key)) {
      deduped.set(key, line);
    }
  }

  return [...deduped.values()];
}

function getDiffLineMergeKey(line: DiffLine) {
  if (line.kind === "context") {
    return `context:${line.newLine ?? line.oldLine ?? "unknown"}:${line.content}`;
  }

  return `${line.kind}:${line.oldLine ?? ""}:${line.newLine ?? ""}:${line.content}`;
}

function getDiffLineSortPosition(line: DiffLine) {
  return line.newLine ?? line.oldLine ?? Number.MAX_SAFE_INTEGER;
}

function getExpandBeforeHunkId(hunk: DiffHunkView) {
  return hunk.expandBeforeHunkId ?? hunk.sourceHunkIds?.[0] ?? hunk.id;
}

function getExpandAfterHunkId(hunk: DiffHunkView) {
  return hunk.expandAfterHunkId ?? hunk.sourceHunkIds?.at(-1) ?? hunk.id;
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

function parsePatch(patch: string, filePath: string): PatchHunkView[] {
  const hunks: PatchHunkView[] = [];
  let current: { id: string; header: string; lines: DiffLine[]; oldLine: number; newLine: number } | null = null;

  for (const rawLine of patch.split("\n")) {
    if (rawLine.startsWith("@@")) {
      const match = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      const oldStart = match ? Number(match[1]) : null;
      const newStart = match ? Number(match[2]) : null;
      const hunkIndex = hunks.length + 1;
      current = {
        id: `${filePath}:hunk-${hunkIndex}`,
        header: rawLine,
        lines: [],
        oldLine: oldStart ?? 0,
        newLine: newStart ?? 0,
      };
      hunks.push({
        id: current.id,
        header: current.header,
        loaded: false,
        expandable: false,
        expanded: false,
        canExpandBefore: false,
        canExpandAfter: false,
        contextBefore: 0,
        contextAfter: 0,
        lines: current.lines,
        oldStart,
        newStart,
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

function expandPatchHunkWithSourceContext(
  hunk: PatchHunkView,
  sourceLines: string[],
  requested: DiffHunkExpansion,
): PatchHunkView {
  const firstNewLine = hunk.lines.find((line) => line.newLine !== null)?.newLine ?? hunk.newStart;
  const lastNewLine = findLastDiffLine(hunk.lines, "new") ?? hunk.newStart;
  const firstOldLine = hunk.lines.find((line) => line.oldLine !== null)?.oldLine ?? hunk.oldStart;
  const lastOldLine = findLastDiffLine(hunk.lines, "old") ?? hunk.oldStart;

  if (firstNewLine === null || lastNewLine === null || sourceLines.length === 0) {
    return {
      ...hunk,
      expandable: false,
      canExpandBefore: false,
      canExpandAfter: false,
      contextBefore: 0,
      contextAfter: 0,
    };
  }

  const contextBefore = Math.min(Math.max(requested.before, 0), Math.max(firstNewLine - 1, 0));
  const contextAfter = Math.min(Math.max(requested.after, 0), Math.max(sourceLines.length - lastNewLine, 0));
  const beforeLines = Array.from({ length: contextBefore }, (_, index) => {
    const newLine = firstNewLine - contextBefore + index;
    const oldLine = firstOldLine === null ? null : firstOldLine - contextBefore + index;
    return createLine(oldLine !== null && oldLine > 0 ? oldLine : null, newLine, "context", sourceLines[newLine - 1] ?? "", true);
  });
  const afterLines = Array.from({ length: contextAfter }, (_, index) => {
    const newLine = lastNewLine + index + 1;
    const oldLine = lastOldLine === null ? null : lastOldLine + index + 1;
    return createLine(oldLine !== null && oldLine > 0 ? oldLine : null, newLine, "context", sourceLines[newLine - 1] ?? "", true);
  });

  return {
    ...hunk,
    expandable: true,
    expanded: contextBefore > 0 || contextAfter > 0,
    canExpandBefore: firstNewLine - contextBefore > 1,
    canExpandAfter: lastNewLine + contextAfter < sourceLines.length,
    contextBefore,
    contextAfter,
    lines: [...beforeLines, ...hunk.lines, ...afterLines],
  };
}

function findLastDiffLine(lines: DiffLine[], side: "old" | "new") {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const lineNumber = side === "old" ? lines[index].oldLine : lines[index].newLine;
    if (lineNumber !== null) {
      return lineNumber;
    }
  }

  return null;
}

function splitSourceLines(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  return lines.length > 1 && lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function buildSourceFullFileLines(sourceLines: string[]) {
  return sourceLines.map((content, index) => createLine(index + 1, index + 1, "context", content));
}

function createLine(oldLine: number | null, newLine: number | null, kind: DiffLineKind, content: string, sourceContext = false): DiffLine {
  return {
    oldLine,
    newLine,
    kind,
    content,
    highlighted: false,
    language: "text",
    sourceContext,
  };
}

function getExtension(path: string) {
  const lastSlash = path.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot) : "";
}
