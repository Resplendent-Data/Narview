import type { ReviewTarget } from "./review-targets";

export interface ReviewTargetRecoveryContext {
  pullRequestKey: string;
  stableKey: string;
  title: string;
  kind: ReviewTarget["kind"];
  priority: ReviewTarget["priority"];
  paths: string[];
  filePath: string | null;
  modulePath: string;
  fallback: boolean;
}

export interface StoredReviewTargetState {
  id: string;
  reviewed: boolean;
  reviewedAtEpochMs: number | null;
  recoveryContext: ReviewTargetRecoveryContext;
}

export interface ReviewTargetStateStore {
  version: 1;
  users: Record<string, Record<string, StoredReviewTargetState>>;
}

export const reviewTargetStorageKey = "narview.reviewTargetState.v1";

export function readReviewTargetStateStore(): ReviewTargetStateStore {
  if (typeof window === "undefined") {
    return { version: 1, users: {} };
  }

  const raw = window.localStorage.getItem(reviewTargetStorageKey);
  if (!raw) {
    return { version: 1, users: {} };
  }

  try {
    return JSON.parse(raw) as ReviewTargetStateStore;
  } catch {
    return { version: 1, users: {} };
  }
}

export function writeReviewTargetStateStore(store: ReviewTargetStateStore) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(reviewTargetStorageKey, JSON.stringify(store));
  }
}

export function clearReviewTargetStateStore() {
  writeReviewTargetStateStore({ version: 1, users: {} });
}

export function syncReviewTargets(
  userKey: string,
  pullRequestKey: string,
  targets: ReviewTarget[],
  store = readReviewTargetStateStore(),
) {
  const next: ReviewTargetStateStore = {
    version: 1,
    users: {
      ...store.users,
      [userKey]: {
        ...(store.users[userKey] ?? {}),
      },
    },
  };
  const userTargets = next.users[userKey];

  for (const target of targets) {
    const existing = userTargets[target.id];
    userTargets[target.id] = {
      id: target.id,
      reviewed: existing?.reviewed ?? false,
      reviewedAtEpochMs: existing?.reviewedAtEpochMs ?? null,
      recoveryContext: buildReviewTargetRecoveryContext(pullRequestKey, target),
    };
  }

  writeReviewTargetStateStore(next);
  return next;
}

export function setReviewTargetReviewed(
  userKey: string,
  targetId: string,
  reviewed: boolean,
  nowEpochMs = Date.now(),
  store = readReviewTargetStateStore(),
) {
  const existing = store.users[userKey]?.[targetId];
  if (!existing) {
    return store;
  }

  const next: ReviewTargetStateStore = {
    version: 1,
    users: {
      ...store.users,
      [userKey]: {
        ...store.users[userKey],
        [targetId]: {
          ...existing,
          reviewed,
          reviewedAtEpochMs: reviewed ? nowEpochMs : null,
        },
      },
    },
  };

  writeReviewTargetStateStore(next);
  return next;
}

export function buildReviewedTargetIdSet(
  userKey: string,
  targets: ReviewTarget[],
  store = readReviewTargetStateStore(),
) {
  const userTargets = store.users[userKey] ?? {};
  return new Set(targets.filter((target) => userTargets[target.id]?.reviewed).map((target) => target.id));
}

export function buildReviewTargetRecoveryContext(
  pullRequestKey: string,
  target: ReviewTarget,
): ReviewTargetRecoveryContext {
  return {
    pullRequestKey,
    stableKey: target.stableKey,
    title: target.title,
    kind: target.kind,
    priority: target.priority,
    paths: target.paths,
    filePath: target.filePath,
    modulePath: target.modulePath,
    fallback: target.fallback,
  };
}
