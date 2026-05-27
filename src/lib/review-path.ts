import type { AttentionRelationship } from "./analysis-index";
import type { ReviewThreadView } from "./review-queue";
import type { HotspotScore } from "./review-overview";
import type { ReviewTarget } from "./review-targets";

export interface ReviewPathCluster {
  id: string;
  order: number;
  size: number;
  seedTargetId: string;
  distanceFromSeed: number;
}

export interface ReviewPathItem {
  id: string;
  order: number;
  target: ReviewTarget;
  hotspotScore: number;
  cluster: ReviewPathCluster;
  orderingReasons: string[];
}

export interface BuildReviewPathOptions {
  relationships?: AttentionRelationship[];
}

export interface ReviewWorkProgress {
  targets: {
    total: number;
    reviewed: number;
    remaining: number;
  };
  threads: {
    total: number;
    reviewed: number;
    remaining: number;
  };
  combinedRemaining: number;
}

type ReviewPathCandidate = Omit<ReviewPathItem, "cluster" | "order">;

type ClusteredReviewPathCandidate = {
  candidate: ReviewPathCandidate;
  cluster: ReviewPathCluster;
};

type TargetConnectionMap = Map<string, Set<string>>;

export function buildReviewPathItems(
  targets: ReviewTarget[],
  hotspots: HotspotScore[],
  options: BuildReviewPathOptions = {},
): ReviewPathItem[] {
  const candidates = [...targets].map((target) => {
    const targetHotspots = getTargetHotspots(target, hotspots);
    const hotspotScore = getTargetHotspotScore(targetHotspots);
    return {
      id: target.id,
      target,
      hotspotScore,
      orderingReasons: getOrderingReasons(target, hotspotScore, targetHotspots),
    };
  });

  return orderCandidatesByRelatedClusters(candidates, options.relationships ?? []).map(({ candidate, cluster }, index) => ({
    ...candidate,
    order: index + 1,
    cluster,
    orderingReasons: addClusterOrderingReason(candidate.orderingReasons, cluster),
  }));
}

export function moveReviewPathSelection(items: ReviewPathItem[], reviewedTargetIds: Set<string>, currentId: string | null, direction: 1 | -1) {
  const activeItems = items.filter((item) => !reviewedTargetIds.has(item.id));
  if (activeItems.length === 0) {
    return null;
  }

  const currentIndex = currentId ? activeItems.findIndex((item) => item.id === currentId) : -1;
  const baseIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
  const nextIndex = (baseIndex + direction + activeItems.length) % activeItems.length;
  return activeItems[nextIndex].id;
}

export function buildReviewWorkProgress(
  items: ReviewPathItem[],
  reviewedTargetIds: Set<string>,
  threads: ReviewThreadView[],
): ReviewWorkProgress {
  const reviewedTargets = items.filter((item) => reviewedTargetIds.has(item.id)).length;
  const reviewedThreads = threads.filter((view) => view.reviewed).length;
  const targetRemaining = Math.max(0, items.length - reviewedTargets);
  const threadRemaining = Math.max(0, threads.length - reviewedThreads);

  return {
    targets: {
      total: items.length,
      reviewed: reviewedTargets,
      remaining: targetRemaining,
    },
    threads: {
      total: threads.length,
      reviewed: reviewedThreads,
      remaining: threadRemaining,
    },
    combinedRemaining: targetRemaining + threadRemaining,
  };
}

function getTargetHotspots(target: ReviewTarget, hotspots: HotspotScore[]) {
  const pathSet = new Set(target.paths);
  return hotspots.filter((hotspot) => {
    if (target.kind === "generated-cluster" && hotspot.kind === "generated-cluster") {
      return samePathSet(target.paths, hotspot.paths ?? []);
    }
    return pathSet.has(hotspot.path);
  });
}

function getTargetHotspotScore(hotspots: HotspotScore[]) {
  const matchingScores = hotspots.map((hotspot) => hotspot.score);

  return matchingScores.length > 0 ? Math.max(...matchingScores) : 0;
}

function getOrderingReasons(target: ReviewTarget, hotspotScore: number, hotspots: HotspotScore[]) {
  const reasons = [];
  if (hotspotScore > 0) {
    reasons.push(`Hotspot score ${hotspotScore}`);
  }
  const checkReasons = hotspots.flatMap((hotspot) => hotspot.reasons.filter((reason) => reason.includes("failing check")));
  reasons.push(...new Set(checkReasons));
  if (target.size.reviewThreads > 0) {
    reasons.push(`${target.size.reviewThreads} unresolved target thread${target.size.reviewThreads === 1 ? "" : "s"}`);
  }
  if (target.fallback) {
    reasons.push("Fallback context");
  }
  return reasons.length > 0 ? reasons : ["Deterministic target order"];
}

function orderCandidatesByRelatedClusters(
  candidates: ReviewPathCandidate[],
  relationships: AttentionRelationship[],
): ClusteredReviewPathCandidate[] {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const connections = buildTargetConnections(candidates, relationships);
  const clusters = buildReviewPathClusters(candidates, connections);

  return clusters
    .sort((left, right) => compareReviewPathCandidates(left.seed, right.seed))
    .flatMap((cluster, clusterIndex) => {
      const distances = getClusterDistances(cluster.seed.id, cluster.ids, connections);
      return cluster.ids
        .map((id) => candidateById.get(id))
        .filter((candidate): candidate is ReviewPathCandidate => Boolean(candidate))
        .sort((left, right) => {
          const leftDistance = distances.get(left.id) ?? Number.POSITIVE_INFINITY;
          const rightDistance = distances.get(right.id) ?? Number.POSITIVE_INFINITY;
          return leftDistance - rightDistance || compareReviewPathCandidates(left, right);
        })
        .map((candidate) => ({
          candidate,
          cluster: {
            id: cluster.id,
            order: clusterIndex + 1,
            size: cluster.ids.length,
            seedTargetId: cluster.seed.id,
            distanceFromSeed: distances.get(candidate.id) ?? 0,
          },
        }));
    });
}

function buildTargetConnections(candidates: ReviewPathCandidate[], relationships: AttentionRelationship[]): TargetConnectionMap {
  const connections: TargetConnectionMap = new Map(candidates.map((candidate) => [candidate.id, new Set()]));
  const targetIdsByNodeId = new Map<string, Set<string>>();
  const targetIdsByPath = new Map<string, Set<string>>();
  const targetIdsByReviewThreadId = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    for (const nodeId of candidate.target.nodeIds) {
      addMapSetValue(targetIdsByNodeId, nodeId, candidate.id);
    }
    for (const path of candidate.target.paths) {
      addMapSetValue(targetIdsByPath, path, candidate.id);
    }
    for (const threadId of candidate.target.reviewThreadIds) {
      addMapSetValue(targetIdsByReviewThreadId, threadId, candidate.id);
    }
  }

  for (const targetIds of targetIdsByPath.values()) {
    connectTargetSet(connections, targetIds);
  }
  for (const targetIds of targetIdsByReviewThreadId.values()) {
    connectTargetSet(connections, targetIds);
  }

  for (const relationship of relationships) {
    const relatedTargetIds = new Set<string>();
    addTargetIds(relatedTargetIds, relationship.fromNodeId, targetIdsByNodeId);
    addTargetIds(relatedTargetIds, relationship.toNodeId, targetIdsByNodeId);
    addTargetIds(relatedTargetIds, relationship.targetFilePath, targetIdsByPath);

    if (relatedTargetIds.size < 2) {
      addTargetIds(relatedTargetIds, relationship.filePath, targetIdsByPath);
    }

    connectTargetSet(connections, relatedTargetIds);
  }

  return connections;
}

function buildReviewPathClusters(candidates: ReviewPathCandidate[], connections: TargetConnectionMap) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  const clusters: Array<{ id: string; ids: string[]; seed: ReviewPathCandidate }> = [];

  for (const candidate of [...candidates].sort(compareReviewPathCandidates)) {
    if (visited.has(candidate.id)) {
      continue;
    }

    const ids = getConnectedTargetIds(candidate.id, connections, visited);
    const clusterCandidates = ids
      .map((id) => candidateById.get(id))
      .filter((clusterCandidate): clusterCandidate is ReviewPathCandidate => Boolean(clusterCandidate))
      .sort(compareReviewPathCandidates);
    const seed = clusterCandidates[0] ?? candidate;
    const sortedIds = ids.slice().sort();
    clusters.push({
      id: `cluster:${stableHash(sortedIds.join("|"))}`,
      ids: sortedIds,
      seed,
    });
  }

  return clusters;
}

function getConnectedTargetIds(startId: string, connections: TargetConnectionMap, visited: Set<string>) {
  const queue = [startId];
  const ids: string[] = [];
  visited.add(startId);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    ids.push(currentId);
    for (const nextId of [...(connections.get(currentId) ?? [])].sort()) {
      if (visited.has(nextId)) {
        continue;
      }
      visited.add(nextId);
      queue.push(nextId);
    }
  }

  return ids;
}

function getClusterDistances(seedTargetId: string, clusterIds: string[], connections: TargetConnectionMap) {
  const clusterIdSet = new Set(clusterIds);
  const distances = new Map([[seedTargetId, 0]]);
  const queue = [seedTargetId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentDistance = distances.get(currentId) ?? 0;
    for (const nextId of [...(connections.get(currentId) ?? [])].sort()) {
      if (!clusterIdSet.has(nextId) || distances.has(nextId)) {
        continue;
      }
      distances.set(nextId, currentDistance + 1);
      queue.push(nextId);
    }
  }

  return distances;
}

function connectTargetSet(connections: TargetConnectionMap, targetIds: Set<string>) {
  const ids = [...targetIds].sort();
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const leftId = ids[leftIndex];
      const rightId = ids[rightIndex];
      connections.get(leftId)?.add(rightId);
      connections.get(rightId)?.add(leftId);
    }
  }
}

function addTargetIds(targetIds: Set<string>, key: string | null, source: Map<string, Set<string>>) {
  if (!key) {
    return;
  }

  for (const targetId of source.get(key) ?? []) {
    targetIds.add(targetId);
  }
}

function addMapSetValue(map: Map<string, Set<string>>, key: string, value: string) {
  map.set(key, new Set([...(map.get(key) ?? []), value]));
}

function addClusterOrderingReason(reasons: string[], cluster: ReviewPathCluster) {
  if (cluster.size <= 1) {
    return reasons;
  }

  const clusterReason =
    cluster.distanceFromSeed === 0
      ? `Starts related cluster (${cluster.size} targets)`
      : `Connected cluster target ${cluster.distanceFromSeed + 1} of ${cluster.size}`;
  const meaningfulReasons = reasons.filter((reason) => reason !== "Deterministic target order");
  return meaningfulReasons.length > 0 ? [...meaningfulReasons, clusterReason] : [clusterReason];
}

function compareReviewPathCandidates(left: ReviewPathCandidate, right: ReviewPathCandidate) {
  return (
    right.hotspotScore - left.hotspotScore ||
    getPriorityRank(left.target.priority) - getPriorityRank(right.target.priority) ||
    right.target.size.reviewThreads - left.target.size.reviewThreads ||
    right.target.size.changedLines - left.target.size.changedLines ||
    left.target.modulePath.localeCompare(right.target.modulePath) ||
    left.target.title.localeCompare(right.target.title) ||
    left.target.id.localeCompare(right.target.id)
  );
}

function getPriorityRank(priority: ReviewTarget["priority"]) {
  if (priority === "high") {
    return 0;
  }
  if (priority === "normal") {
    return 1;
  }
  return 2;
}

function samePathSet(left: string[], right: string[]) {
  return left.length === right.length && [...left].sort().join("|") === [...right].sort().join("|");
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
