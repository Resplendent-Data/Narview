import type { CachedReviewThread } from "./pr-cache";
import { setLocalStorageItem } from "./local-storage";

export type ReviewThreadOrigin = "coderabbit" | "human";
export type ReviewOriginFilter = "all" | ReviewThreadOrigin;
export type ReviewReviewedFilter = "all" | "reviewed" | "unreviewed";
export type ReviewStateFilter = "all" | "unresolved" | "resolved" | "outdated" | "current";

export interface ReviewQueueFilters {
  origin: ReviewOriginFilter;
  reviewed: ReviewReviewedFilter;
  state: ReviewStateFilter;
}

export interface ReviewThreadRecoveryContext {
  pullRequestKey: string;
  filePath: string;
  line: number | null;
  authorLogin: string | null;
  bodyExcerpt: string;
  state: CachedReviewThread["state"];
  updatedAt: string;
}

export interface StoredReviewThreadState {
  id: string;
  reviewed: boolean;
  reviewedAtEpochMs: number | null;
  recoveryContext: ReviewThreadRecoveryContext;
}

export interface ReviewQueueStore {
  version: 1;
  users: Record<string, Record<string, StoredReviewThreadState>>;
}

export interface ReviewThreadView {
  id: string;
  origin: ReviewThreadOrigin;
  reviewed: boolean;
  outdated: boolean;
  thread: CachedReviewThread;
  recoveryContext: ReviewThreadRecoveryContext;
}

export interface ReviewQueueCounts {
  needsAttention: number;
  coderabbit: number;
  humans: number;
  resolvedUnreviewed: number;
}

export const reviewQueueStorageKey = "narview.reviewQueueState.v1";

export const defaultReviewQueueFilters: ReviewQueueFilters = {
  origin: "all",
  reviewed: "all",
  state: "all",
};

export function readReviewQueueStore(): ReviewQueueStore {
  if (typeof window === "undefined") {
    return { version: 1, users: {} };
  }

  const raw = window.localStorage.getItem(reviewQueueStorageKey);
  if (!raw) {
    return { version: 1, users: {} };
  }

  try {
    return JSON.parse(raw) as ReviewQueueStore;
  } catch {
    return { version: 1, users: {} };
  }
}

export function writeReviewQueueStore(store: ReviewQueueStore) {
  if (typeof window !== "undefined") {
    setLocalStorageItem(reviewQueueStorageKey, JSON.stringify(store));
  }
}

export function clearReviewQueueStore() {
  writeReviewQueueStore({ version: 1, users: {} });
}

export function syncReviewThreads(
  userKey: string,
  pullRequestKey: string,
  threads: CachedReviewThread[],
  store = readReviewQueueStore(),
) {
  const next: ReviewQueueStore = {
    version: 1,
    users: {
      ...store.users,
      [userKey]: {
        ...(store.users[userKey] ?? {}),
      },
    },
  };
  const userThreads = next.users[userKey];

  for (const thread of threads) {
    const existing = userThreads[thread.id];
    userThreads[thread.id] = {
      id: thread.id,
      reviewed: existing?.reviewed ?? false,
      reviewedAtEpochMs: existing?.reviewedAtEpochMs ?? null,
      recoveryContext: buildRecoveryContext(pullRequestKey, thread),
    };
  }

  writeReviewQueueStore(next);
  return next;
}

export function setReviewThreadReviewed(
  userKey: string,
  threadId: string,
  reviewed: boolean,
  nowEpochMs = Date.now(),
  store = readReviewQueueStore(),
) {
  const existing = store.users[userKey]?.[threadId];
  if (!existing) {
    return store;
  }

  const next: ReviewQueueStore = {
    version: 1,
    users: {
      ...store.users,
      [userKey]: {
        ...store.users[userKey],
        [threadId]: {
          ...existing,
          reviewed,
          reviewedAtEpochMs: reviewed ? nowEpochMs : null,
        },
      },
    },
  };

  writeReviewQueueStore(next);
  return next;
}

export function buildReviewThreadViews(
  userKey: string,
  pullRequestKey: string,
  threads: CachedReviewThread[],
  store = readReviewQueueStore(),
): ReviewThreadView[] {
  const userThreads = store.users[userKey] ?? {};

  return threads.map((thread) => {
    const stored = userThreads[thread.id];

    return {
      id: thread.id,
      origin: getReviewThreadOrigin(thread),
      reviewed: stored?.reviewed ?? false,
      outdated: thread.state === "outdated",
      thread,
      recoveryContext: stored?.recoveryContext ?? buildRecoveryContext(pullRequestKey, thread),
    };
  });
}

export function filterReviewThreads(threads: ReviewThreadView[], filters: ReviewQueueFilters) {
  return threads.filter((view) => {
    if (filters.origin !== "all" && view.origin !== filters.origin) {
      return false;
    }
    if (filters.reviewed === "reviewed" && !view.reviewed) {
      return false;
    }
    if (filters.reviewed === "unreviewed" && view.reviewed) {
      return false;
    }
    if (filters.state === "current" && view.outdated) {
      return false;
    }
    if (filters.state !== "all" && filters.state !== "current" && view.thread.state !== filters.state) {
      return false;
    }

    return true;
  });
}

export function buildReviewQueueCounts(threads: ReviewThreadView[]): ReviewQueueCounts {
  return {
    needsAttention: threads.filter((view) => !view.reviewed && view.thread.state !== "resolved").length,
    coderabbit: threads.filter((view) => view.origin === "coderabbit").length,
    humans: threads.filter((view) => view.origin === "human").length,
    resolvedUnreviewed: threads.filter((view) => !view.reviewed && view.thread.state === "resolved").length,
  };
}

export function buildRecoveryContext(pullRequestKey: string, thread: CachedReviewThread): ReviewThreadRecoveryContext {
  return {
    pullRequestKey,
    filePath: thread.filePath,
    line: thread.line,
    authorLogin: thread.authorLogin,
    bodyExcerpt: thread.body.slice(0, 180),
    state: thread.state,
    updatedAt: thread.updatedAt,
  };
}

export function getReviewThreadOrigin(thread: CachedReviewThread): ReviewThreadOrigin {
  return thread.authorLogin?.toLowerCase() === "coderabbitai" ? "coderabbit" : "human";
}
