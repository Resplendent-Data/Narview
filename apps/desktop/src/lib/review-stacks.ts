import type { CachedFileSummary, CachedReviewThread } from "./pr-cache";
import { getFileKind, type FileKind } from "./file-changes";
import { isGeneratedOrLowSignalPath } from "./generated-files";

export type FileViewedState = "VIEWED" | "UNVIEWED" | "UNKNOWN";
export type ReviewStackKind = "contracts" | "core" | "interface" | "tests" | "docs" | "generated";
export type ReviewLayerViewedState = "viewed" | "unviewed" | "partial";

export interface ReviewStackRange {
  id: string;
  filePath: string;
  hunkId: string | null;
  startLine: number | null;
  endLine: number | null;
  changedLineCount: number;
}

export interface ReviewStackFile {
  path: string;
  previousPath: string | null;
  additions: number;
  deletions: number;
  status: CachedFileSummary["status"];
  patch: string | null | undefined;
  viewerViewedState: FileViewedState;
  kind: FileKind;
  generated: boolean;
  commentCount: number;
  unresolvedCommentCount: number;
}

export interface ReviewLayer {
  id: string;
  stackId: string;
  title: string;
  order: number;
  filePaths: string[];
  ranges: ReviewStackRange[];
  commentCount: number;
  viewedState: ReviewLayerViewedState;
}

export interface ReviewStack {
  id: string;
  title: string;
  kind: ReviewStackKind;
  order: number;
  layers: ReviewLayer[];
  filePaths: string[];
  commentCount: number;
  viewedFileCount: number;
  totalFileCount: number;
}

export interface ReviewStackModel {
  stacks: ReviewStack[];
  files: ReviewStackFile[];
  filesByPath: Map<string, ReviewStackFile>;
}

export interface BuildReviewStacksInput {
  files: CachedFileSummary[];
  reviewThreads?: CachedReviewThread[];
  viewedOverrides?: Record<string, FileViewedState>;
}

interface StackDraft {
  id: string;
  title: string;
  kind: ReviewStackKind;
  order: number;
  files: ReviewStackFile[];
}

interface FileClassification {
  key: string;
  title: string;
  kind: ReviewStackKind;
  order: number;
}

export function buildReviewStackModel(input: BuildReviewStacksInput): ReviewStackModel {
  const commentCounts = buildCommentCounts(input.reviewThreads ?? []);
  const files = input.files.map((file) => toReviewStackFile(file, commentCounts, input.viewedOverrides ?? {}));
  const drafts = new Map<string, StackDraft>();

  for (const file of files) {
    const classification = classifyFile(file);
    const existing = drafts.get(classification.key);
    if (existing) {
      existing.files.push(file);
    } else {
      drafts.set(classification.key, {
        id: `stack:${classification.key}`,
        title: classification.title,
        kind: classification.kind,
        order: classification.order,
        files: [file],
      });
    }
  }

  const stacks = [...drafts.values()]
    .map((draft) => finalizeStack(draft))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
  const filesByPath = new Map(files.map((file) => [file.path, file]));

  return {
    stacks,
    files: files.slice().sort(compareFiles),
    filesByPath,
  };
}

export function getStackProgressLabel(stack: Pick<ReviewStack, "viewedFileCount" | "totalFileCount">) {
  return `${stack.viewedFileCount}/${stack.totalFileCount} viewed`;
}

export function getLayerFileLabel(layer: Pick<ReviewLayer, "filePaths">) {
  return `${layer.filePaths.length} file${layer.filePaths.length === 1 ? "" : "s"}`;
}

export function normalizeViewedState(value: unknown): FileViewedState {
  return value === "VIEWED" || value === "UNVIEWED" ? value : "UNKNOWN";
}

function toReviewStackFile(
  file: CachedFileSummary,
  commentCounts: Map<string, { total: number; unresolved: number }>,
  viewedOverrides: Record<string, FileViewedState>,
): ReviewStackFile {
  const counts = commentCounts.get(file.path) ?? { total: 0, unresolved: 0 };
  const viewerViewedState = viewedOverrides[file.path] ?? normalizeViewedState(file.viewerViewedState);

  return {
    path: file.path,
    previousPath: file.previousPath ?? null,
    additions: file.additions,
    deletions: file.deletions,
    status: file.status,
    patch: file.patch,
    viewerViewedState,
    kind: getFileKind(file),
    generated: isGeneratedOrLowSignalPath(file.path),
    commentCount: counts.total,
    unresolvedCommentCount: counts.unresolved,
  };
}

function buildCommentCounts(threads: CachedReviewThread[]) {
  const counts = new Map<string, { total: number; unresolved: number }>();

  for (const thread of threads) {
    const current = counts.get(thread.filePath) ?? { total: 0, unresolved: 0 };
    current.total += 1;
    if (thread.state !== "resolved") {
      current.unresolved += 1;
    }
    counts.set(thread.filePath, current);
  }

  return counts;
}

function finalizeStack(draft: StackDraft): ReviewStack {
  const files = draft.files.slice().sort(compareFiles);
  const layers = files.map((file, index) => {
    const ranges = buildRanges(file);
    return {
      id: `layer:${draft.id}:${stableHash(file.path)}`,
      stackId: draft.id,
      title: getLayerTitle(file),
      order: index,
      filePaths: [file.path],
      ranges,
      commentCount: file.commentCount,
      viewedState: file.viewerViewedState === "VIEWED" ? "viewed" : "unviewed",
    } satisfies ReviewLayer;
  });
  const viewedFileCount = files.filter((file) => file.viewerViewedState === "VIEWED").length;

  return {
    id: draft.id,
    title: draft.title,
    kind: draft.kind,
    order: draft.order,
    layers,
    filePaths: files.map((file) => file.path),
    commentCount: files.reduce((sum, file) => sum + file.commentCount, 0),
    viewedFileCount,
    totalFileCount: files.length,
  };
}

function classifyFile(file: ReviewStackFile): FileClassification {
  const path = file.path.toLowerCase();
  const moduleName = getModuleName(file.path);

  if (file.generated) {
    return { key: "generated", title: "Generated and low-signal files", kind: "generated", order: 900 };
  }

  if (isDocsPath(path)) {
    return { key: "docs", title: "Docs and release notes", kind: "docs", order: 800 };
  }

  if (isTestPath(path)) {
    return {
      key: `tests:${slugify(moduleName)}`,
      title: `Tests for ${moduleName}`,
      kind: "tests",
      order: 600 + stableNumber(moduleName, 99),
    };
  }

  if (isContractPath(path)) {
    return { key: "contracts", title: "Contracts, schema, and setup", kind: "contracts", order: 100 };
  }

  if (isInterfacePath(path)) {
    return {
      key: `interface:${slugify(moduleName)}`,
      title: `Interface: ${moduleName}`,
      kind: "interface",
      order: 400 + stableNumber(moduleName, 99),
    };
  }

  return {
    key: `core:${slugify(moduleName)}`,
    title: `Core: ${moduleName}`,
    kind: "core",
    order: 200 + stableNumber(moduleName, 99),
  };
}

function buildRanges(file: ReviewStackFile): ReviewStackRange[] {
  if (!file.patch) {
    return [
      {
        id: `${file.path}:file`,
        filePath: file.path,
        hunkId: null,
        startLine: null,
        endLine: null,
        changedLineCount: file.additions + file.deletions,
      },
    ];
  }

  const ranges: ReviewStackRange[] = [];
  const lines = file.patch.split(/\r?\n/);
  let hunkIndex = 0;
  let current: ReviewStackRange | null = null;
  let newLine = 0;

  for (const line of lines) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      if (current) {
        ranges.push(current);
      }
      hunkIndex += 1;
      newLine = Number(header[1]);
      current = {
        id: `${file.path}:hunk-${hunkIndex}`,
        filePath: file.path,
        hunkId: `hunk-${hunkIndex}`,
        startLine: newLine,
        endLine: newLine,
        changedLineCount: 0,
      };
      continue;
    }

    if (!current || line.startsWith("\\ No newline")) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.changedLineCount += 1;
      current.endLine = newLine;
      newLine += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.changedLineCount += 1;
    } else {
      current.endLine = newLine;
      newLine += 1;
    }
  }

  if (current) {
    ranges.push(current);
  }

  return ranges.length > 0 ? ranges : buildRanges({ ...file, patch: null });
}

function getLayerTitle(file: ReviewStackFile) {
  const name = file.path.split("/").pop() ?? file.path;
  if (file.previousPath && file.previousPath !== file.path) {
    return `${name} renamed`;
  }
  return name;
}

function getModuleName(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "root";
  }

  if (parts[0] === "src" && parts.length > 1) {
    return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
  }

  if (parts[0] === "src-tauri" && parts.length > 2) {
    return parts.slice(0, 3).join("/");
  }

  return parts.length > 1 ? parts[0] : "root";
}

function compareFiles(left: ReviewStackFile, right: ReviewStackFile) {
  return right.unresolvedCommentCount - left.unresolvedCommentCount || left.path.localeCompare(right.path);
}

function isContractPath(path: string) {
  return /(^|\/)(schema|schemas|migrations?|proto|protos|graphql|openapi|api-specs?)(\/|$)/.test(path) ||
    /(^|\/)(package\.json|package-lock\.json|cargo\.toml|cargo\.lock|tsconfig[^/]*\.json|vite\.config\.[jt]s|tailwind\.config\.[jt]s|postcss\.config\.js)$/.test(path) ||
    /\.(sql|graphql|gql|proto|ya?ml|toml)$/.test(path);
}

function isInterfacePath(path: string) {
  return /(^|\/)(app|pages|routes|screens|views|components|ui)(\/|$)/.test(path) ||
    /\.(css|scss|sass)$/.test(path) ||
    /\b(app|page|route|view|screen|component)\.[jt]sx?$/.test(path);
}

function isTestPath(path: string) {
  return /(^|\/)(__tests__|tests?|specs?|fixtures?)(\/|$)/.test(path) || /\.(test|spec)\.[jt]sx?$/.test(path);
}

function isDocsPath(path: string) {
  return path.startsWith("docs/") || path.startsWith("prds/") || /(^|\/)(readme|changelog|license)(\.[a-z0-9]+)?$/.test(path);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "root";
}

function stableNumber(value: string, modulo: number) {
  return stableHash(value).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % modulo;
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
