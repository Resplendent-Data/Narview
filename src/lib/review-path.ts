import type { ReviewThreadView } from "./review-queue";
import type { HotspotScore } from "./review-overview";
import type { ReviewTarget } from "./review-targets";

export interface ReviewPathItem {
  id: string;
  order: number;
  target: ReviewTarget;
  hotspotScore: number;
  orderingReasons: string[];
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

export function buildReviewPathItems(targets: ReviewTarget[], hotspots: HotspotScore[]): ReviewPathItem[] {
  return [...targets]
    .map((target) => {
      const targetHotspots = getTargetHotspots(target, hotspots);
      const hotspotScore = getTargetHotspotScore(targetHotspots);
      return {
        id: target.id,
        order: 0,
        target,
        hotspotScore,
        orderingReasons: getOrderingReasons(target, hotspotScore, targetHotspots),
      };
    })
    .sort(compareReviewPathItems)
    .map((item, index) => ({
      ...item,
      order: index + 1,
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

function compareReviewPathItems(left: ReviewPathItem, right: ReviewPathItem) {
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
