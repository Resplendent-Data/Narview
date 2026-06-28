import type { AttentionNode } from "./analysis-index";
import type { CachedReviewThread } from "./pr-cache";

export type ReviewThreadAttachmentKind = "line-node" | "file" | "unmapped";

export interface ReviewThreadAttachment {
  thread: CachedReviewThread;
  kind: ReviewThreadAttachmentKind;
  nodeId: string | null;
  filePath: string;
  distance: number | null;
}

export function attachReviewThreadsToNodes(
  threads: CachedReviewThread[],
  nodes: AttentionNode[],
): ReviewThreadAttachment[] {
  const nodesByPath = new Map<string, AttentionNode[]>();
  for (const node of nodes) {
    nodesByPath.set(node.filePath, [...(nodesByPath.get(node.filePath) ?? []), node]);
  }

  return threads.map((thread) => {
    if (thread.line === null) {
      return {
        thread,
        kind: "file",
        nodeId: null,
        filePath: thread.filePath,
        distance: null,
      };
    }

    const nearest = findNearestNodeForLine(thread.line, nodesByPath.get(thread.filePath) ?? []);
    if (!nearest) {
      return {
        thread,
        kind: "unmapped",
        nodeId: null,
        filePath: thread.filePath,
        distance: null,
      };
    }

    return {
      thread,
      kind: "line-node",
      nodeId: nearest.node.id,
      filePath: thread.filePath,
      distance: nearest.distance,
    };
  });
}

export function findNearestNodeForLine(line: number, nodes: AttentionNode[]) {
  const rangedNodes = nodes
    .map((node) => ({ node, distance: getLineDistance(line, node) }))
    .filter((candidate) => Number.isFinite(candidate.distance))
    .sort(compareNodeDistance);

  if (rangedNodes[0]) {
    return rangedNodes[0];
  }

  const fallback = [...nodes].sort(compareAttachmentNodes)[0];
  return fallback ? { node: fallback, distance: Number.MAX_SAFE_INTEGER } : null;
}

function getLineDistance(line: number, node: AttentionNode) {
  const start = node.lineStart ?? node.lineEnd;
  const end = node.lineEnd ?? node.lineStart;
  if (start === null || start === undefined || end === null || end === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (line >= start && line <= end) {
    return 0;
  }

  return Math.min(Math.abs(line - start), Math.abs(line - end));
}

function compareNodeDistance(
  left: { node: AttentionNode; distance: number },
  right: { node: AttentionNode; distance: number },
) {
  return left.distance - right.distance || compareAttachmentNodes(left.node, right.node);
}

function compareAttachmentNodes(left: AttentionNode, right: AttentionNode) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    (left.lineStart ?? Number.MAX_SAFE_INTEGER) - (right.lineStart ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id)
  );
}
