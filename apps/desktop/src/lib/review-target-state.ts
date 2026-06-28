import type { ReviewTarget } from "./review-targets";
import { setLocalStorageItem } from "./local-storage";

export interface ReviewTargetRecoveryContext {
  pullRequestKey: string;
  stableKey: string;
  fingerprint: string;
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
  needsReReview: boolean;
  reviewedAtEpochMs: number | null;
  reviewedFingerprint: string | null;
  recoveryContext: ReviewTargetRecoveryContext;
}

export interface ReviewTargetStateStore {
  version: 1;
  users: Record<string, Record<string, StoredReviewTargetState>>;
}

export type ReviewTargetReviewState = "unreviewed" | "reviewed" | "needs-re-review";

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
    setLocalStorageItem(reviewTargetStorageKey, JSON.stringify(store));
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
    const reviewedFingerprint = existing?.reviewedFingerprint ?? (existing?.reviewed ? target.fingerprint : null);
    const needsReReview = Boolean(
      (existing?.reviewed || existing?.needsReReview) && reviewedFingerprint !== null && reviewedFingerprint !== target.fingerprint,
    );
    userTargets[target.id] = {
      id: target.id,
      reviewed: needsReReview ? false : (existing?.reviewed ?? false),
      needsReReview,
      reviewedAtEpochMs: needsReReview ? null : (existing?.reviewedAtEpochMs ?? null),
      reviewedFingerprint,
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
          needsReReview: false,
          reviewedAtEpochMs: reviewed ? nowEpochMs : null,
          reviewedFingerprint: reviewed ? existing.recoveryContext.fingerprint : null,
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

export function buildReviewTargetReviewStates(
  userKey: string,
  targets: ReviewTarget[],
  store = readReviewTargetStateStore(),
): Record<string, ReviewTargetReviewState> {
  const userTargets = store.users[userKey] ?? {};
  return Object.fromEntries(
    targets.map((target) => {
      const stored = userTargets[target.id];
      const state: ReviewTargetReviewState = stored?.reviewed
        ? "reviewed"
        : stored?.needsReReview
          ? "needs-re-review"
          : "unreviewed";
      return [target.id, state];
    }),
  );
}

export function buildNeedsReReviewTargetIdSet(
  userKey: string,
  targets: ReviewTarget[],
  store = readReviewTargetStateStore(),
) {
  const states = buildReviewTargetReviewStates(userKey, targets, store);
  return new Set(targets.filter((target) => states[target.id] === "needs-re-review").map((target) => target.id));
}

export function buildReviewTargetRecoveryContext(
  pullRequestKey: string,
  target: ReviewTarget,
): ReviewTargetRecoveryContext {
  return {
    pullRequestKey,
    stableKey: target.stableKey,
    fingerprint: target.fingerprint,
    title: target.title,
    kind: target.kind,
    priority: target.priority,
    paths: target.paths,
    filePath: target.filePath,
    modulePath: target.modulePath,
    fallback: target.fallback,
  };
}
