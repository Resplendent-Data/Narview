import { buildLazyDiffState, getDefaultLoadedDiffHunkIds } from "./diff-viewer";
import { getFileKind, type FileKind } from "./file-changes";
import type { CachedFileSummary, CachedPullRequestData } from "./pr-cache";
import { getPullRequestKey } from "./review-session";
import type { PullRequestAnalysisInput, PullRequestSummary } from "./workspace";

export const analysisIndexStorageKey = "narview.analysisIndex.v1";
export const analysisIndexVersion = 1;

export type AttentionNodeKind = "hunk" | "file-fallback";
export type AttentionNodeReason = "diff-hunk" | "generated-hunk-fallback" | "unsupported-file" | "missing-text-diff";

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
}

export interface AnalysisIndexStore {
  version: 1;
  entries: Record<string, AnalysisIndex>;
}

export interface BuildAnalysisIndexInput {
  pullRequest: PullRequestSummary;
  files: CachedFileSummary[];
  analysisInput: PullRequestAnalysisInput;
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
    hunkNodes: number;
    fallbackNodes: number;
    reviewThreads: number;
  };
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
  const nodes = input.files.flatMap((file) => buildAttentionNodesForFile(input.pullRequest, file));

  return {
    version: 1,
    analysisVersion,
    repository: input.pullRequest.repository,
    pullRequestNumber: input.pullRequest.number,
    pullRequestKey,
    headSha,
    sourceSignature: buildSourceSignature(input.files),
    storageScope: "local-storage-outside-review-clone",
    generatedAtEpochMs: input.nowEpochMs ?? Date.now(),
    nodes,
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
    index.sourceSignature === buildSourceSignature(input.files)
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
      hunkNodes: index.nodes.filter((node) => node.kind === "hunk").length,
      fallbackNodes: index.nodes.filter((node) => node.kind === "file-fallback").length,
      reviewThreads: currentData.reviewThreads.length,
    },
  };
}

export function getAnalysisIndexKey(repository: string, pullRequestNumber: number, headSha: string, analysisVersion = analysisIndexVersion) {
  return `${repository.toLowerCase()}#${pullRequestNumber}:${headSha}:v${analysisVersion}`;
}

function buildAttentionNodesForFile(pullRequest: PullRequestSummary, file: CachedFileSummary): AttentionNode[] {
  const fileKind = getFileKind(file);
  if (fileKind !== "text") {
    return [buildFileFallbackNode(file, fileKind, "unsupported-file")];
  }

  if (file.patch === null) {
    return [buildFileFallbackNode(file, fileKind, "missing-text-diff")];
  }

  const diffState = buildLazyDiffState(file, {
    mode: "unified",
    repository: pullRequest.repository,
    pullRequestNumber: pullRequest.number,
    loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
  });

  if (diffState.hunks.length === 0) {
    return [buildFileFallbackNode(file, fileKind, "missing-text-diff")];
  }

  return diffState.hunks.map((hunk, index) => {
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
  });
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

function getAnalysisHeadSha(analysisInput: PullRequestAnalysisInput) {
  return analysisInput.state === "ready" ? analysisInput.headSha : null;
}

function buildSourceSignature(files: CachedFileSummary[]) {
  return files
    .map((file) =>
      [
        file.path,
        file.status,
        file.additions,
        file.deletions,
        hashString(file.patch === null ? "<missing-text-diff>" : (file.patch ?? "<generated-hunks>")),
      ].join(":"),
    )
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
