import { buildLazyDiffState, getDefaultLoadedDiffHunkIds } from "./diff-viewer";
import {
  analyzeFileForDeepSymbols,
  type AnalysisFileSource,
  type CodeRelationship,
  type CodeSymbol,
  type DeepAnalysisResult,
} from "./deep-analysis";
import { getFileKind, type FileKind } from "./file-changes";
import { isGeneratedOrLowSignalPath } from "./generated-files";
import type { CachedFileSummary, CachedPullRequestData } from "./pr-cache";
import { attachReviewThreadsToNodes } from "./review-thread-attachments";
import { getPullRequestKey } from "./review-session";
import type { PullRequestAnalysisInput, PullRequestSummary } from "./workspace";

export const analysisIndexStorageKey = "narview.analysisIndex.v1";
export const analysisIndexVersion = 3;

export type AttentionNodeKind = "symbol" | "context" | "hunk" | "file-fallback";
export type AttentionNodeReason =
  | "changed-symbol"
  | "context-symbol"
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
  reviewTarget: boolean;
  symbolName?: string;
  symbolKind?: CodeSymbol["kind"];
  language?: CodeSymbol["language"] | null;
  reasons?: string[];
}

export type AttentionRelationshipKind = CodeRelationship["kind"] | "test-file" | "review-thread" | "same-file";

export interface AttentionRelationship {
  id: string;
  kind: AttentionRelationshipKind;
  filePath: string;
  fromNodeId: string | null;
  toNodeId: string | null;
  fromSymbolName: string | null;
  toSymbolName: string | null;
  targetModule: string | null;
  targetFilePath: string | null;
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
  contextNodeCount: number;
  contextOverflowCount: number;
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
  kind: AttentionNodeKind | "generated-cluster";
  reason: AttentionNodeReason | "generated-cluster";
  threadCount: number;
  changedLines: number;
  collapsed?: boolean;
  fileCount?: number;
  paths?: string[];
}

export interface AttentionMapEdge {
  id: string;
  from: string;
  to: string;
  kind: "file-hunk" | AttentionRelationshipKind;
  reason: string;
}

export interface AttentionMapPresentation {
  nodes: AttentionMapNode[];
  edges: AttentionMapEdge[];
  summary: {
    files: number;
    symbolNodes: number;
    contextNodes: number;
    hunkNodes: number;
    fallbackNodes: number;
    reviewThreads: number;
    relationships: number;
    generatedClusters: number;
  };
}

interface BuiltAttentionNodes {
  nodes: AttentionNode[];
  relationships: AttentionRelationship[];
  fileAnalysis: FileAnalysisSummary;
}

const contextNodeCapPerFile = 3;

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
  const graphRelationships = [
    ...relationships.map((relationship) => ({
      ...relationship,
      targetFilePath: relationship.targetFilePath ?? resolveModuleTargetFile(relationship.filePath, relationship.targetModule, input.files),
    })),
    ...buildSameFileRelationships(nodes),
    ...buildTestRelationships(input.files, nodes),
  ];

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
    relationships: graphRelationships,
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

  const representedFilePaths = new Set(index.nodes.map((node) => node.filePath));
  const collapsedGeneratedFiles = currentData.fileSummaries
    .filter(
      (file) =>
        representedFilePaths.has(file.path) &&
        isGeneratedOrLowSignalPath(file.path) &&
        (threadCountByPath.get(file.path) ?? 0) === 0,
    )
    .sort((left, right) => left.path.localeCompare(right.path));
  const collapsedGeneratedPaths = new Set(collapsedGeneratedFiles.map((file) => file.path));
  const generatedClusterNodeId = "cluster:generated-low-signal";
  const fileNodeIds = new Map<string, string>();
  const nodes: AttentionMapNode[] = [];
  const edges: AttentionMapEdge[] = [];

  if (collapsedGeneratedFiles.length > 0) {
    for (const file of collapsedGeneratedFiles) {
      fileNodeIds.set(file.path, generatedClusterNodeId);
    }

    nodes.push({
      id: generatedClusterNodeId,
      label: "Generated Cluster",
      filePath: "Generated Cluster",
      kind: "generated-cluster",
      reason: "generated-cluster",
      threadCount: 0,
      changedLines: collapsedGeneratedFiles.reduce((total, file) => total + file.additions + file.deletions, 0),
      collapsed: true,
      fileCount: collapsedGeneratedFiles.length,
      paths: collapsedGeneratedFiles.map((file) => file.path),
    });
  }

  for (const node of index.nodes) {
    if (collapsedGeneratedPaths.has(node.filePath)) {
      continue;
    }

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
      reason: `Groups ${node.label} under ${node.filePath}.`,
    });
  }

  for (const relationship of index.relationships) {
    const from = relationship.fromNodeId ?? (relationship.filePath ? fileNodeIds.get(relationship.filePath) ?? null : null);
    const to =
      relationship.toNodeId ??
      (relationship.targetFilePath ? fileNodeIds.get(relationship.targetFilePath) ?? null : null);
    if (!from || !to || from === to) {
      continue;
    }

    edges.push({
      id: relationship.id,
      from,
      to,
      kind: relationship.kind,
      reason: relationship.reason,
    });
  }

  for (const attachment of attachReviewThreadsToNodes(
    currentData.reviewThreads,
    index.nodes.filter((node) => node.reviewTarget),
  )) {
    if (attachment.kind !== "line-node" || !attachment.nodeId) {
      continue;
    }

    const fileNodeId = fileNodeIds.get(attachment.filePath);
    if (!fileNodeId) {
      continue;
    }

    edges.push({
      id: `review-thread:${attachment.thread.id}:${attachment.nodeId}`,
      from: fileNodeId,
      to: attachment.nodeId,
      kind: "review-thread",
      reason: `Review Thread ${attachment.thread.id} is attached to the nearest changed node in ${attachment.filePath}.`,
    });
  }

  return {
    nodes,
    edges,
    summary: {
      files: fileNodeIds.size,
      symbolNodes: index.nodes.filter((node) => node.kind === "symbol").length,
      contextNodes: index.nodes.filter((node) => node.kind === "context").length,
      hunkNodes: index.nodes.filter((node) => node.kind === "hunk").length,
      fallbackNodes: index.nodes.filter((node) => node.kind === "file-fallback").length,
      reviewThreads: currentData.reviewThreads.length,
      relationships: index.relationships.length,
      generatedClusters: collapsedGeneratedFiles.length > 0 ? 1 : 0,
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
      const changedSymbolIds = new Set(changedSymbols.map((symbol) => symbol.id));
      const contextSymbols = getContextSymbolsForChangedSymbols(deepAnalysis, changedSymbolIds);
      const visibleContextSymbols = contextSymbols.slice(0, contextNodeCapPerFile);
      const contextOverflowCount = Math.max(0, contextSymbols.length - visibleContextSymbols.length);
      const nodeIdBySymbolId = new Map([
        ...changedSymbols.map((symbol) => [symbol.id, `${symbol.id}:attention-symbol`] as const),
        ...visibleContextSymbols.map((symbol) => [symbol.id, `${symbol.id}:context-symbol`] as const),
      ]);

      return {
        nodes: [
          ...changedSymbols.map((symbol) => buildSymbolNode(file, fileKind, symbol)),
          ...visibleContextSymbols.map((symbol) => buildContextNode(file, fileKind, symbol)),
        ],
        relationships: deepAnalysis.relationships.map((relationship) =>
          toAttentionRelationship(relationship, nodeIdBySymbolId),
        ),
        fileAnalysis: summarizeFileAnalysis(deepAnalysis, visibleContextSymbols.length, contextOverflowCount),
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
        reviewTarget: true,
      } satisfies AttentionNode;
    }),
    relationships: [],
    fileAnalysis: summarizeFileAnalysis(deepAnalysis, 0, 0),
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
      ? summarizeFileAnalysis(deepAnalysis, 0, 0)
      : {
          language: null,
          state: "unsupported",
          symbolCount: 0,
          relationshipCount: 0,
          importCount: 0,
          exportCount: 0,
          contextNodeCount: 0,
          contextOverflowCount: 0,
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
    reviewTarget: true,
    symbolName: symbol.name,
    symbolKind: symbol.kind,
    language: symbol.language,
    reasons: symbol.reasons,
  };
}

function buildContextNode(file: CachedFileSummary, fileKind: FileKind, symbol: CodeSymbol): AttentionNode {
  return {
    id: `${symbol.id}:context-symbol`,
    kind: "context",
    reason: "context-symbol",
    filePath: file.path,
    fileKind,
    status: file.status,
    hunkId: null,
    label: symbol.name,
    lineStart: symbol.startLine,
    lineEnd: symbol.endLine,
    additions: 0,
    deletions: 0,
    reviewTarget: false,
    symbolName: symbol.name,
    symbolKind: symbol.kind,
    language: symbol.language,
    reasons: [`${symbol.name} is unchanged context for a changed symbol relationship.`],
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
    reviewTarget: true,
  };
}

function toAttentionRelationship(
  relationship: CodeRelationship,
  nodeIdBySymbolId: Map<string, string>,
): AttentionRelationship {
  return {
    id: relationship.id,
    kind: relationship.kind,
    filePath: relationship.filePath,
    fromNodeId: relationship.fromSymbolId ? nodeIdBySymbolId.get(relationship.fromSymbolId) ?? null : null,
    toNodeId: relationship.toSymbolId ? nodeIdBySymbolId.get(relationship.toSymbolId) ?? null : null,
    fromSymbolName: relationship.fromSymbolName,
    toSymbolName: relationship.toSymbolName,
    targetModule: relationship.targetModule,
    targetFilePath: null,
    line: relationship.line,
    reason: relationship.reason,
  };
}

function getContextSymbolsForChangedSymbols(deepAnalysis: DeepAnalysisResult, changedSymbolIds: Set<string>) {
  const symbolsById = new Map(deepAnalysis.symbols.map((symbol) => [symbol.id, symbol]));
  const contextSymbols = new Map<string, CodeSymbol>();

  for (const relationship of deepAnalysis.relationships) {
    if (!relationship.fromSymbolId || !relationship.toSymbolId) {
      continue;
    }

    if (changedSymbolIds.has(relationship.fromSymbolId) && !changedSymbolIds.has(relationship.toSymbolId)) {
      const symbol = symbolsById.get(relationship.toSymbolId);
      if (symbol) {
        contextSymbols.set(symbol.id, symbol);
      }
    }
    if (changedSymbolIds.has(relationship.toSymbolId) && !changedSymbolIds.has(relationship.fromSymbolId)) {
      const symbol = symbolsById.get(relationship.fromSymbolId);
      if (symbol) {
        contextSymbols.set(symbol.id, symbol);
      }
    }
  }

  return [...contextSymbols.values()].sort((left, right) => left.startLine - right.startLine);
}

function summarizeFileAnalysis(
  deepAnalysis: DeepAnalysisResult,
  contextNodeCount: number,
  contextOverflowCount: number,
): FileAnalysisSummary {
  return {
    language: deepAnalysis.language,
    state: deepAnalysis.state,
    symbolCount: deepAnalysis.symbols.length,
    relationshipCount: deepAnalysis.relationships.length,
    importCount: deepAnalysis.imports.length,
    exportCount: deepAnalysis.exports.length,
    contextNodeCount,
    contextOverflowCount,
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

function buildSameFileRelationships(nodes: AttentionNode[]): AttentionRelationship[] {
  const reviewTargetsByFile = new Map<string, AttentionNode[]>();
  for (const node of nodes.filter((candidate) => candidate.reviewTarget)) {
    reviewTargetsByFile.set(node.filePath, [...(reviewTargetsByFile.get(node.filePath) ?? []), node]);
  }

  return [...reviewTargetsByFile.entries()].flatMap(([filePath, fileNodes]) =>
    fileNodes.flatMap((node, index) =>
      fileNodes.slice(index + 1).map((related) => ({
        id: `same-file:${node.id}:${related.id}`,
        kind: "same-file" as const,
        filePath,
        fromNodeId: node.id,
        toNodeId: related.id,
        fromSymbolName: node.symbolName ?? node.label,
        toSymbolName: related.symbolName ?? related.label,
        targetModule: null,
        targetFilePath: related.filePath,
        line: node.lineStart ?? related.lineStart ?? 0,
        reason: `${node.label} and ${related.label} are changed review targets in ${filePath}.`,
      })),
    ),
  );
}

function buildTestRelationships(files: CachedFileSummary[], nodes: AttentionNode[]): AttentionRelationship[] {
  const nodesByPath = new Map<string, AttentionNode[]>();
  for (const node of nodes.filter((candidate) => candidate.reviewTarget)) {
    nodesByPath.set(node.filePath, [...(nodesByPath.get(node.filePath) ?? []), node]);
  }

  const paths = files.map((file) => file.path);
  const testPaths = paths.filter(isTestPath);
  const implementationPaths = paths.filter((path) => !isTestPath(path));
  const relationships: AttentionRelationship[] = [];

  for (const testPath of testPaths) {
    const testNodes = nodesByPath.get(testPath) ?? [];
    const testStem = normalizedTestStem(testPath);
    for (const implementationPath of implementationPaths) {
      if (!testStem || !normalizedPathStem(implementationPath).includes(testStem)) {
        continue;
      }

      const implementationNodes = nodesByPath.get(implementationPath) ?? [];
      const fromNode = testNodes[0];
      const toNode = implementationNodes[0];
      relationships.push({
        id: `test-file:${testPath}:${implementationPath}`,
        kind: "test-file",
        filePath: testPath,
        fromNodeId: fromNode?.id ?? null,
        toNodeId: toNode?.id ?? null,
        fromSymbolName: fromNode?.symbolName ?? fromNode?.label ?? null,
        toSymbolName: toNode?.symbolName ?? toNode?.label ?? null,
        targetModule: null,
        targetFilePath: implementationPath,
        line: fromNode?.lineStart ?? 0,
        reason: `${testPath} appears to cover ${implementationPath} by deterministic test naming.`,
      });
    }
  }

  return relationships;
}

function resolveModuleTargetFile(filePath: string, targetModule: string | null, files: CachedFileSummary[]) {
  if (!targetModule || !targetModule.startsWith(".")) {
    return null;
  }

  const candidateBase = normalizePath(`${dirname(filePath)}/${targetModule.replace(/^\.\//, "")}`);
  const candidates = [
    candidateBase,
    `${candidateBase}.ts`,
    `${candidateBase}.tsx`,
    `${candidateBase}.js`,
    `${candidateBase}.jsx`,
    `${candidateBase}.py`,
    `${candidateBase}/index.ts`,
    `${candidateBase}/index.tsx`,
    `${candidateBase}/index.js`,
    `${candidateBase}/index.jsx`,
  ];
  const filePaths = new Set(files.map((file) => file.path));
  return candidates.find((candidate) => filePaths.has(candidate)) ?? null;
}

function isTestPath(path: string) {
  const lowerPath = path.toLowerCase();
  return (
    lowerPath.includes("/__tests__/") ||
    lowerPath.includes("/tests/") ||
    lowerPath.includes(".test.") ||
    lowerPath.includes(".spec.") ||
    /(^|\/)test_[^/]+\.py$/.test(lowerPath) ||
    /(^|\/)[^/]+_test\.py$/.test(lowerPath)
  );
}

function normalizedTestStem(path: string) {
  return (path.split("/").at(-1) ?? "")
    .replace(/\.(tsx|ts|jsx|js|py)$/i, "")
    .toLowerCase()
    .replace(/^test_/, "")
    .replace(/_test$/, "")
    .replace(/\.test$/, "")
    .replace(/\.spec$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizedPathStem(path: string) {
  return path
    .split("/")
    .at(-1)
    ?.replace(/\.(tsx|ts|jsx|js|py)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") ?? "";
}

function dirname(path: string) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
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
