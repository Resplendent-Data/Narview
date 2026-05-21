import type {
  AnalysisIndex,
  AttentionMapNode,
  AttentionMapPresentation,
  AttentionNode,
  AttentionRelationship,
} from "./analysis-index";
import type { CachedPullRequestData } from "./pr-cache";
import type { HotspotScore } from "./review-overview";

export type ReviewTargetKind = "node-group" | "generated-cluster";
export type ReviewTargetPriority = "high" | "normal" | "low";

export interface ReviewTarget {
  id: string;
  stableKey: string;
  kind: ReviewTargetKind;
  title: string;
  priority: ReviewTargetPriority;
  nodeIds: string[];
  edgeIds: string[];
  paths: string[];
  filePath: string | null;
  modulePath: string;
  fallback: boolean;
  reasoning: string[];
  size: {
    nodes: number;
    files: number;
    changedLines: number;
    relationships: number;
    reviewThreads: number;
  };
}

export interface BuildReviewTargetsInput {
  analysisIndex: AnalysisIndex;
  attentionMap: AttentionMapPresentation;
  currentData: CachedPullRequestData;
  hotspots?: HotspotScore[];
  maxNodesPerTarget?: number;
}

interface GroupEdge {
  id: string;
  from: string;
  to: string;
  reason: string;
  strength: "strong" | "nearby";
}

const defaultMaxNodesPerTarget = 4;
const nearbyLineThreshold = 80;
const mixedSymbolHunkThreshold = 24;

export function buildReviewTargets(input: BuildReviewTargetsInput): ReviewTarget[] {
  const maxNodesPerTarget = input.maxNodesPerTarget ?? defaultMaxNodesPerTarget;
  const reviewNodes = input.analysisIndex.nodes.filter((node) => node.reviewTarget);
  const nodeById = new Map(reviewNodes.map((node) => [node.id, node]));
  const edges = [
    ...buildRelationshipGroupEdges(input.analysisIndex.relationships, nodeById),
    ...buildNearbyGroupEdges(reviewNodes),
  ];
  const componentTargets = buildConnectedComponents(reviewNodes, edges).flatMap((component) =>
    splitComponentIntoTargets(component, edges, input.currentData, maxNodesPerTarget),
  );
  const clusterTargets = buildGeneratedClusterTargets(input.attentionMap, input.hotspots ?? []);

  return [...componentTargets, ...clusterTargets].sort(compareReviewTargets);
}

function buildRelationshipGroupEdges(relationships: AttentionRelationship[], nodeById: Map<string, AttentionNode>) {
  const edges: GroupEdge[] = [];

  for (const relationship of relationships) {
    if (!relationship.fromNodeId || !relationship.toNodeId) {
      continue;
    }
    if (!nodeById.has(relationship.fromNodeId) || !nodeById.has(relationship.toNodeId)) {
      continue;
    }
    if (!isStrongRelationship(relationship)) {
      continue;
    }

    edges.push({
      id: relationship.id,
      from: relationship.fromNodeId,
      to: relationship.toNodeId,
      reason: relationship.reason,
      strength: "strong",
    });
  }

  return edges;
}

function buildNearbyGroupEdges(nodes: AttentionNode[]) {
  const edges: GroupEdge[] = [];
  const sortedNodes = [...nodes].sort(compareAttentionNodes);

  for (let leftIndex = 0; leftIndex < sortedNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sortedNodes.length; rightIndex += 1) {
      const left = sortedNodes[leftIndex];
      const right = sortedNodes[rightIndex];
      if (left.filePath !== right.filePath) {
        continue;
      }

      const reason = getNearbyGroupingReason(left, right);
      if (!reason) {
        continue;
      }

      edges.push({
        id: `nearby:${left.id}:${right.id}`,
        from: left.id,
        to: right.id,
        reason,
        strength: "nearby",
      });
    }
  }

  return edges;
}

function buildConnectedComponents(nodes: AttentionNode[], edges: GroupEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const components: AttentionNode[][] = [];

  for (const node of [...nodes].sort(compareAttentionNodes)) {
    if (visited.has(node.id)) {
      continue;
    }

    const queue = [node.id];
    const component: AttentionNode[] = [];
    visited.add(node.id);

    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) {
        continue;
      }
      const current = nodeById.get(id);
      if (current) {
        component.push(current);
      }

      for (const next of adjacency.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    components.push(component.sort(compareAttentionNodes));
  }

  return components;
}

function splitComponentIntoTargets(
  component: AttentionNode[],
  allEdges: GroupEdge[],
  currentData: CachedPullRequestData,
  maxNodesPerTarget: number,
) {
  if (component.length <= maxNodesPerTarget) {
    return [createNodeGroupTarget(component, allEdges, currentData)];
  }

  const chunks = chunkOversizedComponent(component, maxNodesPerTarget);
  return chunks.map((chunk) =>
    createNodeGroupTarget(chunk, allEdges, currentData, [
      `Split from an oversized ${component.length}-node relationship group to keep one logic question per target.`,
    ]),
  );
}

function chunkOversizedComponent(component: AttentionNode[], maxNodesPerTarget: number) {
  const chunks: AttentionNode[][] = [];
  const nodesByFile = new Map<string, AttentionNode[]>();
  for (const node of component) {
    nodesByFile.set(node.filePath, [...(nodesByFile.get(node.filePath) ?? []), node]);
  }

  for (const [, nodes] of [...nodesByFile.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    for (let index = 0; index < nodes.length; index += maxNodesPerTarget) {
      chunks.push(nodes.slice(index, index + maxNodesPerTarget).sort(compareAttentionNodes));
    }
  }

  return chunks;
}

function createNodeGroupTarget(
  nodes: AttentionNode[],
  allEdges: GroupEdge[],
  currentData: CachedPullRequestData,
  extraReasons: string[] = [],
): ReviewTarget {
  const sortedNodes = [...nodes].sort(compareAttentionNodes);
  const nodeIds = sortedNodes.map((node) => node.id);
  const nodeIdSet = new Set(nodeIds);
  const paths = uniqueSorted(sortedNodes.map((node) => node.filePath));
  const edgeReasons = allEdges.filter((edge) => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to));
  const stableKey = `nodes:${nodeIds.slice().sort().join("|")}`;
  const reviewThreads = countThreadsForPaths(currentData, paths);
  const fallback = sortedNodes.some((node) => node.kind === "hunk" || node.kind === "file-fallback");

  return {
    id: `target:${stableHash(stableKey)}`,
    stableKey,
    kind: "node-group",
    title: getTargetTitle(sortedNodes, paths),
    priority: reviewThreads > 0 ? "high" : fallback ? "normal" : "normal",
    nodeIds,
    edgeIds: edgeReasons.map((edge) => edge.id).sort(),
    paths,
    filePath: paths.length === 1 ? paths[0] : null,
    modulePath: getCommonDirectory(paths),
    fallback,
    reasoning: [
      ...extraReasons,
      ...edgeReasons.map((edge) => edge.reason),
      `${sortedNodes.length} Attention Node${sortedNodes.length === 1 ? "" : "s"} across ${paths.length} file${paths.length === 1 ? "" : "s"}.`,
      fallback ? "Uses hunk or file fallback context." : "Uses parsed symbol context.",
    ],
    size: {
      nodes: sortedNodes.length,
      files: paths.length,
      changedLines: sortedNodes.reduce((total, node) => total + node.additions + node.deletions, 0),
      relationships: edgeReasons.length,
      reviewThreads,
    },
  };
}

function buildGeneratedClusterTargets(attentionMap: AttentionMapPresentation, hotspots: HotspotScore[]) {
  const generatedHotspots = hotspots.filter((hotspot) => hotspot.kind === "generated-cluster");
  const clusterNodes = attentionMap.nodes.filter((node) => node.kind === "generated-cluster");

  return clusterNodes.flatMap((node) => {
    const hotspot = generatedHotspots.find((candidate) => samePathSet(candidate.paths ?? [], node.paths ?? []));
    if (!hotspot || !generatedClusterIsJustified(hotspot)) {
      return [];
    }

    const paths = uniqueSorted(node.paths ?? []);
    const stableKey = `cluster:${paths.join("|")}`;
    return [
      {
        id: `target:${stableHash(stableKey)}`,
        stableKey,
        kind: "generated-cluster" as const,
        title: `${node.label} (${node.fileCount ?? paths.length} files)`,
        priority: "low" as const,
        nodeIds: [node.id],
        edgeIds: [],
        paths,
        filePath: null,
        modulePath: "Generated Cluster",
        fallback: true,
        reasoning: [
          ...hotspot.reasons,
          "Generated Cluster is promoted only because a review thread or failing check points at it.",
        ],
        size: {
          nodes: 1,
          files: node.fileCount ?? paths.length,
          changedLines: node.changedLines,
          relationships: 0,
          reviewThreads: hotspot.unresolvedThreads,
        },
      },
    ];
  });
}

function isStrongRelationship(relationship: AttentionRelationship) {
  return ["same-file-call", "test-file", "same-file", "module-import", "module-export"].includes(relationship.kind);
}

function getNearbyGroupingReason(left: AttentionNode, right: AttentionNode) {
  if (left.kind === "hunk" && right.kind === "hunk") {
    const leftContext = getHunkContext(left.label);
    const rightContext = getHunkContext(right.label);
    if (leftContext && leftContext === rightContext) {
      return `${left.label} and ${right.label} are same-symbol hunk splits.`;
    }
    if (lineDistance(left, right) <= nearbyLineThreshold) {
      return `${left.label} and ${right.label} are nearby hunk splits in ${left.filePath}.`;
    }
  }

  if (isMixedSymbolHunkPair(left, right) && lineDistance(left, right) <= mixedSymbolHunkThreshold) {
    return `${left.label} and ${right.label} combine parsed symbol and hunk fallback context.`;
  }

  return null;
}

function isMixedSymbolHunkPair(left: AttentionNode, right: AttentionNode) {
  const kinds = new Set([left.kind, right.kind]);
  return kinds.has("symbol") && kinds.has("hunk");
}

function lineDistance(left: AttentionNode, right: AttentionNode) {
  const leftLine = left.lineStart ?? left.lineEnd ?? 0;
  const rightLine = right.lineStart ?? right.lineEnd ?? 0;
  return Math.abs(leftLine - rightLine);
}

function getHunkContext(label: string) {
  const match = label.match(/@@\s*(.+)$/);
  return (match?.[1] ?? label).trim().toLowerCase();
}

function countThreadsForPaths(currentData: CachedPullRequestData, paths: string[]) {
  const pathSet = new Set(paths);
  return currentData.reviewThreads.filter((thread) => pathSet.has(thread.filePath) && thread.state === "unresolved").length;
}

function getTargetTitle(nodes: AttentionNode[], paths: string[]) {
  if (nodes.length === 1) {
    if (nodes[0].label === nodes[0].filePath) {
      return nodes[0].filePath;
    }
    if (nodes[0].kind === "hunk") {
      return `${nodes[0].filePath} hunk review`;
    }
    return `${nodes[0].label} in ${nodes[0].filePath}`;
  }
  if (paths.length === 1) {
    return `${paths[0]} grouped review`;
  }
  return `${getCommonDirectory(paths)} grouped review`;
}

function getCommonDirectory(paths: string[]) {
  if (paths.length === 0) {
    return "Unknown module";
  }

  const splitPaths = paths.map((path) => path.split("/").slice(0, -1));
  const first = splitPaths[0] ?? [];
  const common: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    if (splitPaths.every((parts) => parts[index] === first[index])) {
      common.push(first[index]);
    } else {
      break;
    }
  }

  return common.join("/") || paths[0].split("/")[0] || "root";
}

function generatedClusterIsJustified(hotspot: HotspotScore) {
  return hotspot.unresolvedThreads > 0 || hotspot.reasons.some((reason) => reason.includes("failing check"));
}

function samePathSet(left: string[], right: string[]) {
  return left.length === right.length && uniqueSorted(left).join("|") === uniqueSorted(right).join("|");
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function compareReviewTargets(left: ReviewTarget, right: ReviewTarget) {
  return (
    getPriorityRank(left.priority) - getPriorityRank(right.priority) ||
    left.modulePath.localeCompare(right.modulePath) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

function getPriorityRank(priority: ReviewTargetPriority) {
  if (priority === "high") {
    return 0;
  }
  if (priority === "normal") {
    return 1;
  }
  return 2;
}

function compareAttentionNodes(left: AttentionNode, right: AttentionNode) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    (left.lineStart ?? Number.MAX_SAFE_INTEGER) - (right.lineStart ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id)
  );
}

function stableHash(value: string) {
  let hash = 5381;
  for (const character of value) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }
  return (hash >>> 0).toString(36);
}
