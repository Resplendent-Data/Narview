import type { AnalysisIndex, AttentionNode, AttentionRelationship } from "./analysis-index";
import { buildLazyDiffState, getDefaultLoadedDiffHunkIds, type DiffLine } from "./diff-viewer";
import type { CachedFileSummary, CachedReviewThread } from "./pr-cache";
import type { ReviewTarget } from "./review-targets";
import type { AnalysisFileContent, PullRequestSummary } from "./workspace";

export interface ReviewTargetHeadLine {
  lineNumber: number;
  content: string;
  language: string;
}

export interface ReviewTargetHeadContext {
  id: string;
  title: string;
  path: string;
  source: "head-symbol" | "fallback-hunk" | "unavailable";
  message: string | null;
  lines: ReviewTargetHeadLine[];
}

export interface ReviewTargetChangedContext {
  id: string;
  title: string;
  path: string;
  lines: DiffLine[];
}

export interface ReviewTargetBaseComparison {
  id: string;
  title: string;
  path: string;
  lines: DiffLine[];
}

export interface ReviewTargetInspectorModel {
  target: ReviewTarget;
  nodes: AttentionNode[];
  relatedNodes: AttentionNode[];
  changedContexts: ReviewTargetChangedContext[];
  headContexts: ReviewTargetHeadContext[];
  baseComparisons: ReviewTargetBaseComparison[];
  relatedEdges: AttentionRelationship[];
  relatedTests: AttentionRelationship[];
  reviewThreads: CachedReviewThread[];
  reasons: string[];
  fallback: boolean;
}

export interface BuildReviewTargetInspectorInput {
  target: ReviewTarget | null;
  analysisIndex: AnalysisIndex;
  pullRequest: PullRequestSummary;
  files: CachedFileSummary[];
  fileContents: AnalysisFileContent[];
  reviewThreads: CachedReviewThread[];
}

interface TargetPathContext {
  path: string;
  nodes: AttentionNode[];
  file: CachedFileSummary | null;
  source: AnalysisFileContent | null;
}

export function buildReviewTargetInspectorModel(input: BuildReviewTargetInspectorInput): ReviewTargetInspectorModel | null {
  if (!input.target) {
    return null;
  }

  const target = input.target;
  const targetNodeIds = new Set(target.nodeIds);
  const targetPathSet = new Set(target.paths);
  const targetReviewThreadIds = new Set(target.reviewThreadIds);
  const nodes = input.analysisIndex.nodes
    .filter((node) => targetNodeIds.has(node.id))
    .sort(compareAttentionNodes);
  const relatedEdges = input.analysisIndex.relationships
    .filter((relationship) => relationshipBelongsToTarget(relationship, target, targetNodeIds, targetPathSet))
    .sort(compareRelationships);
  const relatedNodeIds = new Set(
    relatedEdges.flatMap((relationship) => [relationship.fromNodeId, relationship.toNodeId]).filter((id): id is string => Boolean(id)),
  );
  const relatedNodes = input.analysisIndex.nodes
    .filter((node) => relatedNodeIds.has(node.id) && !targetNodeIds.has(node.id))
    .sort(compareAttentionNodes);
  const pathContexts = target.paths.sort().map((path) => ({
    path,
    nodes: nodes.filter((node) => node.filePath === path),
    file: input.files.find((file) => file.path === path) ?? null,
    source: input.fileContents.find((source) => source.path === path) ?? null,
  }));

  return {
    target,
    nodes,
    relatedNodes,
    changedContexts: pathContexts.flatMap((context) => buildChangedContexts(context, input.pullRequest)),
    headContexts: pathContexts.flatMap((context) => buildHeadContexts(context, input.pullRequest)),
    baseComparisons: pathContexts.flatMap((context) => buildBaseComparisons(context, input.pullRequest)),
    relatedEdges,
    relatedTests: relatedEdges.filter((relationship) => relationship.kind === "test-file"),
    reviewThreads: input.reviewThreads.filter((thread) => targetReviewThreadIds.has(thread.id)),
    reasons: uniqueSorted([...target.reasoning, ...nodes.flatMap((node) => node.reasons ?? [])]),
    fallback: target.fallback || nodes.some((node) => node.kind === "hunk" || node.kind === "file-fallback"),
  };
}

function buildHeadContexts(context: TargetPathContext, pullRequest: PullRequestSummary): ReviewTargetHeadContext[] {
  if (context.source?.state === "loaded" && context.source.content !== null) {
    const symbolContexts = context.nodes
      .filter((node) => node.lineStart !== null && node.lineEnd !== null)
      .map((node) => buildHeadSymbolContext(context, node));

    if (symbolContexts.length > 0) {
      return symbolContexts;
    }
  }

  const fallbackLines = buildTargetDiffLines(context, pullRequest).flatMap((view) =>
    view.lines.filter((line) => line.kind !== "deletion"),
  );
  if (fallbackLines.length > 0) {
    return [
      {
        id: `${context.path}:head-fallback`,
        title: `${context.path} fallback hunk`,
        path: context.path,
        source: "fallback-hunk",
        message: context.source?.message ?? "Full head file context is unavailable; showing head-side hunk lines.",
        lines: fallbackLines.map((line) => ({
          lineNumber: line.newLine ?? line.oldLine ?? 0,
          content: line.content,
          language: line.language,
        })),
      },
    ];
  }

  return [
    {
      id: `${context.path}:head-unavailable`,
      title: context.path,
      path: context.path,
      source: "unavailable",
      message: context.source?.message ?? "Head version is unavailable for this Review Target.",
      lines: [],
    },
  ];
}

function buildHeadSymbolContext(context: TargetPathContext, node: AttentionNode): ReviewTargetHeadContext {
  const content = context.source?.content ?? "";
  const lines = content.split("\n");
  const startLine = Math.max(1, (node.lineStart ?? 1) - 1);
  const endLine = Math.min(lines.length, (node.lineEnd ?? node.lineStart ?? 1) + 1);

  return {
    id: `${node.id}:head`,
    title: `${node.label}${node.symbolKind ? ` ${node.symbolKind}` : ""}`,
    path: context.path,
    source: "head-symbol",
    message: null,
    lines: lines.slice(startLine - 1, endLine).map((line, index) => ({
      lineNumber: startLine + index,
      content: line,
      language: node.language ?? "text",
    })),
  };
}

function buildChangedContexts(context: TargetPathContext, pullRequest: PullRequestSummary): ReviewTargetChangedContext[] {
  return buildTargetDiffLines(context, pullRequest).map((view) => ({
    id: `${context.path}:changed:${view.id}`,
    title: view.header,
    path: context.path,
    lines: view.lines,
  }));
}

function buildBaseComparisons(context: TargetPathContext, pullRequest: PullRequestSummary): ReviewTargetBaseComparison[] {
  return buildTargetDiffLines(context, pullRequest).map((view) => ({
    id: `${context.path}:base:${view.id}`,
    title: view.header,
    path: context.path,
    lines: view.lines.filter((line) => line.kind !== "addition"),
  }));
}

function buildTargetDiffLines(context: TargetPathContext, pullRequest: PullRequestSummary) {
  if (!context.file) {
    return [];
  }

  const diffState = buildLazyDiffState(context.file, {
    mode: "unified",
    repository: pullRequest.repository,
    pullRequestNumber: pullRequest.number,
    loadedHunkIds: getDefaultLoadedDiffHunkIds(context.file),
  });
  const hunkIds = new Set(context.nodes.map((node) => node.hunkId).filter((id): id is string => Boolean(id)));
  const ranges = context.nodes
    .filter((node) => node.lineStart !== null || node.lineEnd !== null)
    .map((node) => ({
      start: node.lineStart ?? node.lineEnd ?? 0,
      end: node.lineEnd ?? node.lineStart ?? 0,
    }));
  const matching = diffState.hunks.filter((hunk) => {
    if (hunkIds.has(hunk.id)) {
      return true;
    }
    if (ranges.length === 0) {
      return true;
    }
    return hunk.lines.some((line) => {
      const lineNumber = line.newLine ?? line.oldLine;
      return lineNumber !== null && ranges.some((range) => lineNumber >= range.start && lineNumber <= range.end);
    });
  });

  return matching.length > 0 ? matching : diffState.hunks.slice(0, 1);
}

function relationshipBelongsToTarget(
  relationship: AttentionRelationship,
  target: ReviewTarget,
  targetNodeIds: Set<string>,
  targetPathSet: Set<string>,
) {
  return (
    target.edgeIds.includes(relationship.id) ||
    (relationship.fromNodeId !== null && targetNodeIds.has(relationship.fromNodeId)) ||
    (relationship.toNodeId !== null && targetNodeIds.has(relationship.toNodeId)) ||
    targetPathSet.has(relationship.filePath) ||
    (relationship.targetFilePath !== null && targetPathSet.has(relationship.targetFilePath))
  );
}

function compareAttentionNodes(left: AttentionNode, right: AttentionNode) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    (left.lineStart ?? 0) - (right.lineStart ?? 0) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function compareRelationships(left: AttentionRelationship, right: AttentionRelationship) {
  return left.kind.localeCompare(right.kind) || left.filePath.localeCompare(right.filePath) || left.line - right.line || left.id.localeCompare(right.id);
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
