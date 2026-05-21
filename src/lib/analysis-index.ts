import { buildLazyDiffState, getDefaultLoadedDiffHunkIds } from "./diff-viewer";
import {
  analyzeFileForDeepSymbols,
  type AnalysisFileSource,
  type CodeRelationship,
  type CodeSymbol,
  type DeepAnalysisResult,
} from "./deep-analysis";
import { getFileKind, type FileKind } from "./file-changes";
import type { CachedFileSummary, CachedPullRequestData } from "./pr-cache";
import { getPullRequestKey } from "./review-session";
import type { PullRequestAnalysisInput, PullRequestSummary } from "./workspace";

export const analysisIndexStorageKey = "narview.analysisIndex.v1";
export const analysisIndexVersion = 2;

export type AttentionNodeKind = "symbol" | "hunk" | "file-fallback";
export type AttentionNodeReason =
  | "changed-symbol"
  | "diff-hunk"
  | "generated-hunk-fallback"
  | "unsupported-file"
  | "missing-text-diff";

export interface AttentionNode {
  id: string;
  kind: AttentionNodeKind;
  reason: AttentionNodeReason;
  filePath: string;
  fileKind: FileKind;
  status: CachedFileSummary["status"];
  hunkId: string | null;
  label: string;
  lineStart: number | null;
  lineEnd: number | null;
  additions: number;
  deletions: number;
  symbolName?: string;
  symbolKind?: CodeSymbol["kind"];
  language?: CodeSymbol["language"] | null;
  reasons?: string[];
}

export type AttentionRelationshipKind = CodeRelationship["kind"];

export interface AttentionRelationship {
  id: string;
  kind: AttentionRelationshipKind;
  filePath: string;
  fromNodeId: string | null;
  toNodeId: string | null;
  fromSymbolName: string | null;
  toSymbolName: string | null;
  targetModule: string | null;
  line: number;
  reason: string;
}

export interface FileAnalysisSummary {
  language: DeepAnalysisResult["language"];
  state: DeepAnalysisResult["state"];
  symbolCount: number;
  relationshipCount: number;
  importCount: number;
  exportCount: number;
  reasons: string[];
}

export interface AnalysisIndex {
  version: 1;
  analysisVersion: number;
  repository: string;
  pullRequestNumber: number;
  pullRequestKey: string;
  headSha: string;
  sourceSignature: string;
  storageScope: "local-storage-outside-review-clone";
  generatedAtEpochMs: number;
  nodes: AttentionNode[];
  relationships: AttentionRelationship[];
  fileAnalyses: Record<string, FileAnalysisSummary>;
}

export interface AnalysisIndexStore {
  version: 1;
  entries: Record<string, AnalysisIndex>;
}

export interface BuildAnalysisIndexInput {
  pullRequest: PullRequestSummary;
  files: CachedFileSummary[];
  analysisInput: PullRequestAnalysisInput;
  fileContents?: AnalysisFileSource[];
  analysisVersion?: number;
  nowEpochMs?: number;
}

export interface AttentionMapNode {
  id: string;
  label: string;
  filePath: string;
  kind: AttentionNodeKind;
  reason: AttentionNodeReason;
  threadCount: number;
  changedLines: number;
}

export interface AttentionMapEdge {
  id: string;
  from: string;
  to: string;
  kind: "file-hunk";
}

export interface AttentionMapPresentation {
  nodes: AttentionMapNode[];
  edges: AttentionMapEdge[];
  summary: {
    files: number;
    symbolNodes: number;
    hunkNodes: number;
    fallbackNodes: number;
    reviewThreads: number;
    relationships: number;
  };
}

interface BuiltAttentionNodes {
  nodes: AttentionNode[];
  relationships: AttentionRelationship[];
  fileAnalysis: FileAnalysisSummary;
}

export function readAnalysisIndexStore(): AnalysisIndexStore {
  if (typeof window === "undefined") {
    return { version: 1, entries: {} };
  }

  const raw = window.localStorage.getItem(analysisIndexStorageKey);
  if (!raw) {
    return { version: 1, entries: {} };
  }

  try {
    return JSON.parse(raw) as AnalysisIndexStore;
  } catch {
    return { version: 1, entries: {} };
  }
}

export function writeAnalysisIndex(index: AnalysisIndex, store = readAnalysisIndexStore()) {
  const next: AnalysisIndexStore = {
    version: 1,
    entries: {
      ...store.entries,
      [getAnalysisIndexKey(index.repository, index.pullRequestNumber, index.headSha, index.analysisVersion)]: index,
    },
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(analysisIndexStorageKey, JSON.stringify(next));
  }

  return next;
}

export function readValidAnalysisIndex(input: BuildAnalysisIndexInput, store = readAnalysisIndexStore()) {
  const headSha = getAnalysisHeadSha(input.analysisInput);
  if (!headSha) {
    return null;
  }

  const analysisVersion = input.analysisVersion ?? analysisIndexVersion;
  const index = store.entries[getAnalysisIndexKey(input.pullRequest.repository, input.pullRequest.number, headSha, analysisVersion)];
  if (!index) {
    return null;
  }

  return isAnalysisIndexCurrent(index, input) ? index : null;
}

export function buildOrReuseAnalysisIndex(input: BuildAnalysisIndexInput, store = readAnalysisIndexStore()) {
  return readValidAnalysisIndex(input, store) ?? buildAnalysisIndex(input);
}

export function buildAnalysisIndex(input: BuildAnalysisIndexInput): AnalysisIndex {
  const analysisVersion = input.analysisVersion ?? analysisIndexVersion;
  const pullRequestKey = getPullRequestKey(input.pullRequest);
  const headSha = getAnalysisHeadSha(input.analysisInput) ?? "head-unavailable";
  const contentByPath = new Map((input.fileContents ?? []).map((source) => [source.path, source]));
  const relationships: AttentionRelationship[] = [];
  const fileAnalyses: Record<string, FileAnalysisSummary> = {};
  const nodes = input.files.flatMap((file) => {
    const result = buildAttentionNodesForFile(input.pullRequest, file, contentByPath.get(file.path) ?? null);
    fileAnalyses[file.path] = result.fileAnalysis;
    relationships.push(...result.relationships);
    return result.nodes;
  });

  return {
    version: 1,
    analysisVersion,
    repository: input.pullRequest.repository,
    pullRequestNumber: input.pullRequest.number,
    pullRequestKey,
    headSha,
    sourceSignature: buildSourceSignature(input.files, input.fileContents ?? []),
    storageScope: "local-storage-outside-review-clone",
    generatedAtEpochMs: input.nowEpochMs ?? Date.now(),
    nodes,
    relationships,
    fileAnalyses,
  };
}

export function isAnalysisIndexCurrent(index: AnalysisIndex, input: BuildAnalysisIndexInput) {
  const headSha = getAnalysisHeadSha(input.analysisInput);

  return (
    Boolean(headSha) &&
    index.repository === input.pullRequest.repository &&
    index.pullRequestNumber === input.pullRequest.number &&
    index.headSha === headSha &&
    index.analysisVersion === (input.analysisVersion ?? analysisIndexVersion) &&
    index.sourceSignature === buildSourceSignature(input.files, input.fileContents ?? [])
  );
}

export function buildAttentionMapPresentation(index: AnalysisIndex, currentData: CachedPullRequestData): AttentionMapPresentation {
  const threadCountByPath = new Map<string, number>();
  for (const thread of currentData.reviewThreads) {
    threadCountByPath.set(thread.filePath, (threadCountByPath.get(thread.filePath) ?? 0) + 1);
  }

  const fileNodeIds = new Map<string, string>();
  const nodes: AttentionMapNode[] = [];
  const edges: AttentionMapEdge[] = [];

  for (const node of index.nodes) {
    const fileNodeId = `file:${node.filePath}`;
    if (!fileNodeIds.has(node.filePath)) {
      fileNodeIds.set(node.filePath, fileNodeId);
      nodes.push({
        id: fileNodeId,
        label: node.filePath,
        filePath: node.filePath,
        kind: "file-fallback",
        reason: "generated-hunk-fallback",
        threadCount: threadCountByPath.get(node.filePath) ?? 0,
        changedLines: 0,
      });
    }

    nodes.push({
      id: node.id,
      label: node.label,
      filePath: node.filePath,
      kind: node.kind,
      reason: node.reason,
      threadCount: threadCountByPath.get(node.filePath) ?? 0,
      changedLines: node.additions + node.deletions,
    });

    edges.push({
      id: `${fileNodeId}->${node.id}`,
      from: fileNodeId,
      to: node.id,
      kind: "file-hunk",
    });
  }

  return {
    nodes,
    edges,
    summary: {
      files: fileNodeIds.size,
      symbolNodes: index.nodes.filter((node) => node.kind === "symbol").length,
      hunkNodes: index.nodes.filter((node) => node.kind === "hunk").length,
      fallbackNodes: index.nodes.filter((node) => node.kind === "file-fallback").length,
      reviewThreads: currentData.reviewThreads.length,
      relationships: index.relationships.length,
    },
  };
}

export function getAnalysisIndexKey(repository: string, pullRequestNumber: number, headSha: string, analysisVersion = analysisIndexVersion) {
  return `${repository.toLowerCase()}#${pullRequestNumber}:${headSha}:v${analysisVersion}`;
}

function buildAttentionNodesForFile(
  pullRequest: PullRequestSummary,
  file: CachedFileSummary,
  source: AnalysisFileSource | null,
): BuiltAttentionNodes {
  const fileKind = getFileKind(file);
  if (fileKind !== "text") {
    return fallbackBuildResult(file, fileKind, "unsupported-file", null);
  }

  const deepAnalysis = analyzeFileForDeepSymbols(file, source);
  const changedRanges = getChangedLineRanges(pullRequest, file);
  if (deepAnalysis.state === "parsed") {
    const changedSymbols = deepAnalysis.symbols.filter((symbol) => symbolIntersectsRanges(symbol, changedRanges));
    if (changedSymbols.length > 0) {
      const nodeIdBySymbolId = new Map(changedSymbols.map((symbol) => [symbol.id, `${symbol.id}:attention-symbol`]));

      return {
        nodes: changedSymbols.map((symbol) => buildSymbolNode(file, fileKind, symbol)),
        relationships: deepAnalysis.relationships.map((relationship) => ({
          ...relationship,
          fromNodeId: relationship.fromSymbolId ? nodeIdBySymbolId.get(relationship.fromSymbolId) ?? null : null,
          toNodeId: relationship.toSymbolId ? nodeIdBySymbolId.get(relationship.toSymbolId) ?? null : null,
        })),
        fileAnalysis: summarizeFileAnalysis(deepAnalysis),
      };
    }
  }

  if (file.patch === null) {
    return fallbackBuildResult(file, fileKind, "missing-text-diff", deepAnalysis);
  }

  const diffState = buildLazyDiffState(file, {
    mode: "unified",
    repository: pullRequest.repository,
    pullRequestNumber: pullRequest.number,
    loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
  });

  if (diffState.hunks.length === 0) {
    return fallbackBuildResult(file, fileKind, "missing-text-diff", deepAnalysis);
  }

  return {
    nodes: diffState.hunks.map((hunk, index) => {
      const changedLines = hunk.lines.filter((line) => line.kind !== "context");
      const firstLine = changedLines.find((line) => line.newLine ?? line.oldLine);
      const lastLine = [...changedLines].reverse().find((line) => line.newLine ?? line.oldLine);

      return {
        id: `${file.path}:attention-hunk-${index + 1}`,
        kind: "hunk",
        reason: hunk.id.includes(":hunk-") ? "diff-hunk" : "generated-hunk-fallback",
        filePath: file.path,
        fileKind,
        status: file.status,
        hunkId: hunk.id,
        label: hunk.header,
        lineStart: firstLine?.newLine ?? firstLine?.oldLine ?? null,
        lineEnd: lastLine?.newLine ?? lastLine?.oldLine ?? null,
        additions: hunk.lines.filter((line) => line.kind === "addition").length,
        deletions: hunk.lines.filter((line) => line.kind === "deletion").length,
      } satisfies AttentionNode;
    }),
    relationships: [],
    fileAnalysis: summarizeFileAnalysis(deepAnalysis),
  };
}

function fallbackBuildResult(
  file: CachedFileSummary,
  fileKind: FileKind,
  reason: AttentionNodeReason,
  deepAnalysis: DeepAnalysisResult | null,
): BuiltAttentionNodes {
  return {
    nodes: [buildFileFallbackNode(file, fileKind, reason)],
    relationships: [],
    fileAnalysis: deepAnalysis
      ? summarizeFileAnalysis(deepAnalysis)
      : {
          language: null,
          state: "unsupported",
          symbolCount: 0,
          relationshipCount: 0,
          importCount: 0,
          exportCount: 0,
          reasons: [reason],
        },
  };
}

function buildSymbolNode(file: CachedFileSummary, fileKind: FileKind, symbol: CodeSymbol): AttentionNode {
  return {
    id: `${symbol.id}:attention-symbol`,
    kind: "symbol",
    reason: "changed-symbol",
    filePath: file.path,
    fileKind,
    status: file.status,
    hunkId: null,
    label: symbol.name,
    lineStart: symbol.startLine,
    lineEnd: symbol.endLine,
    additions: file.additions,
    deletions: file.deletions,
    symbolName: symbol.name,
    symbolKind: symbol.kind,
    language: symbol.language,
    reasons: symbol.reasons,
  };
}

function buildFileFallbackNode(file: CachedFileSummary, fileKind: FileKind, reason: AttentionNodeReason): AttentionNode {
  return {
    id: `${file.path}:attention-file-fallback`,
    kind: "file-fallback",
    reason,
    filePath: file.path,
    fileKind,
    status: file.status,
    hunkId: null,
    label: file.path,
    lineStart: null,
    lineEnd: null,
    additions: file.additions,
    deletions: file.deletions,
  };
}

function summarizeFileAnalysis(deepAnalysis: DeepAnalysisResult): FileAnalysisSummary {
  return {
    language: deepAnalysis.language,
    state: deepAnalysis.state,
    symbolCount: deepAnalysis.symbols.length,
    relationshipCount: deepAnalysis.relationships.length,
    importCount: deepAnalysis.imports.length,
    exportCount: deepAnalysis.exports.length,
    reasons: deepAnalysis.reasons,
  };
}

function getChangedLineRanges(pullRequest: PullRequestSummary, file: CachedFileSummary) {
  if (file.patch === null) {
    return [];
  }

  const diffState = buildLazyDiffState(file, {
    mode: "unified",
    repository: pullRequest.repository,
    pullRequestNumber: pullRequest.number,
    loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
  });

  return diffState.hunks.flatMap((hunk) => {
    const changedLines = hunk.lines
      .filter((line) => line.kind !== "context")
      .map((line) => line.newLine ?? line.oldLine)
      .filter((line): line is number => Boolean(line));
    if (changedLines.length === 0) {
      return [];
    }

    return [
      {
        start: Math.min(...changedLines),
        end: Math.max(...changedLines),
      },
    ];
  });
}

function symbolIntersectsRanges(symbol: CodeSymbol, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((range) => symbol.startLine <= range.end && symbol.endLine >= range.start);
}

function getAnalysisHeadSha(analysisInput: PullRequestAnalysisInput) {
  return analysisInput.state === "ready" ? analysisInput.headSha : null;
}

function buildSourceSignature(files: CachedFileSummary[], fileContents: AnalysisFileSource[]) {
  const contentByPath = new Map(fileContents.map((source) => [source.path, source]));

  return files
    .map((file) => {
      const source = contentByPath.get(file.path);
      return [
        file.path,
        file.status,
        file.additions,
        file.deletions,
        hashString(file.patch === null ? "<missing-text-diff>" : (file.patch ?? "<generated-hunks>")),
        source?.state ?? "no-content",
        hashString(source?.content ?? ""),
      ].join(":");
    })
    .sort()
    .join("|");
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
