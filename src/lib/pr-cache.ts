import type { PullRequestSummary } from "./workspace";
import { getPullRequestKey } from "./review-session";

export type FetchStage = "metadata" | "review-threads" | "file-summaries" | "checks" | "diff-content";
export type RefreshTrigger = "open" | "focus" | "manual" | "background";

export interface CachedReviewThreadComment {
  id: string;
  authorLogin: string | null;
  body: string;
  updatedAt: string;
  url: string | null;
}

export interface CachedReviewThread {
  id: string;
  authorLogin: string | null;
  filePath: string;
  line: number | null;
  state: "unresolved" | "resolved" | "outdated";
  body: string;
  updatedAt: string;
  comments?: CachedReviewThreadComment[];
}

export interface CachedFileSummary {
  path: string;
  previousPath?: string | null;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "removed" | "renamed" | "binary";
  patch?: string | null;
  viewerViewedState?: "VIEWED" | "UNVIEWED" | "UNKNOWN" | string | null;
}

export interface CachedCheckRun {
  name: string;
  status: "queued" | "in-progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed-out" | "action-required" | null;
  url: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface CachedRateLimit {
  remaining: number | null;
  resetEpochSeconds: number | null;
}

export interface CachedPullRequestData {
  pullRequest: PullRequestSummary;
  metadata: {
    title: string;
    description: string | null;
    repository: string;
    number: number;
    authorLogin: string | null;
    nodeId?: string | null;
    baseBranch: string | null;
    headBranch: string | null;
    headSha?: string | null;
    mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null;
    mergeStateStatus:
      | "BEHIND"
      | "BLOCKED"
      | "CLEAN"
      | "DIRTY"
      | "DRAFT"
      | "HAS_HOOKS"
      | "UNKNOWN"
      | "UNSTABLE"
      | null;
    reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
    url: string;
    isDraft: boolean;
    updatedAt: string;
  };
  reviewThreads: CachedReviewThread[];
  fileSummaries: CachedFileSummary[];
  checks: CachedCheckRun[];
  rateLimit: CachedRateLimit;
  fetchedAtEpochMs: number;
  lastAccessedEpochMs: number;
  pinned: boolean;
}

export interface PullRequestCacheStore {
  version: 1;
  entries: Record<string, CachedPullRequestData>;
}

export interface CacheBounds {
  maxEntries: number;
  maxBytes: number;
}

export interface CacheStats {
  entries: number;
  pinned: number;
  bytes: number;
}

export interface NetworkRequiredFailure {
  ok: false;
  queued: false;
  message: string;
}

export const prCacheStorageKey = "narview.githubPrCache.v1";
export const defaultCacheBounds: CacheBounds = {
  maxEntries: 40,
  maxBytes: 8 * 1024 * 1024,
};

export function buildIncrementalFetchPlan(trigger: RefreshTrigger): FetchStage[] {
  if (trigger === "background") {
    return ["metadata", "checks"];
  }

  if (trigger === "focus") {
    return ["metadata", "review-threads", "checks"];
  }

  return ["metadata", "review-threads", "file-summaries", "checks"];
}

export function networkRequiredFailure(action: string): NetworkRequiredFailure {
  return {
    ok: false,
    queued: false,
    message: `${action} requires a live GitHub connection.`,
  };
}

export function createCachedPullRequest(pullRequest: PullRequestSummary, nowEpochMs = Date.now()): CachedPullRequestData {
  return {
    pullRequest,
    metadata: {
      title: pullRequest.title,
      description: null,
      repository: pullRequest.repository,
      number: pullRequest.number,
      authorLogin: pullRequest.authorLogin,
      nodeId: null,
      baseBranch: null,
      headBranch: null,
      headSha: null,
      mergeable: null,
      mergeStateStatus: null,
      reviewDecision: null,
      url: pullRequest.url,
      isDraft: pullRequest.isDraft,
      updatedAt: pullRequest.updatedAt,
    },
    reviewThreads: [],
    fileSummaries: [],
    checks: [],
    rateLimit: {
      remaining: null,
      resetEpochSeconds: null,
    },
    fetchedAtEpochMs: nowEpochMs,
    lastAccessedEpochMs: nowEpochMs,
    pinned: false,
  };
}

export function readCacheStore(): PullRequestCacheStore {
  if (typeof window === "undefined") {
    return { version: 1, entries: {} };
  }

  const raw = window.localStorage.getItem(prCacheStorageKey);
  if (!raw) {
    return { version: 1, entries: {} };
  }

  try {
    return JSON.parse(raw) as PullRequestCacheStore;
  } catch {
    return { version: 1, entries: {} };
  }
}

export function writeCacheStore(store: PullRequestCacheStore) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(prCacheStorageKey, JSON.stringify(store));
    } catch (error) {
      console.warn("Narview could not persist the full Pull Request cache; compacting cached diff content.", error);
      const compacted = evictCache(compactCacheForQuota(store), {
        maxEntries: Math.min(defaultCacheBounds.maxEntries, 10),
        maxBytes: Math.min(defaultCacheBounds.maxBytes, 2 * 1024 * 1024),
      });

      try {
        window.localStorage.removeItem(prCacheStorageKey);
        window.localStorage.setItem(prCacheStorageKey, JSON.stringify(compacted));
      } catch (fallbackError) {
        console.warn("Narview could not persist the compacted Pull Request cache; clearing cached GitHub data.", fallbackError);
        try {
          window.localStorage.removeItem(prCacheStorageKey);
        } catch {
          // Storage is best-effort cache only; startup must not depend on it.
        }
      }
    }
  }
}

export function cacheStats(store = readCacheStore()): CacheStats {
  return {
    entries: Object.keys(store.entries).length,
    pinned: Object.values(store.entries).filter((entry) => entry.pinned).length,
    bytes: estimateStoreBytes(store),
  };
}

export function readCachedPullRequest(key: string): CachedPullRequestData | null {
  const store = readCacheStore();
  const entry = store.entries[key];

  if (!entry) {
    return null;
  }

  const touched = {
    ...entry,
    lastAccessedEpochMs: Date.now(),
  };
  store.entries[key] = touched;
  writeCacheStore(store);

  return touched;
}

export function upsertCachedPullRequest(
  pullRequest: PullRequestSummary,
  patch: Partial<Omit<CachedPullRequestData, "pullRequest" | "metadata">> = {},
  bounds = defaultCacheBounds,
) {
  const store = readCacheStore();
  const key = getPullRequestKey(pullRequest);
  const existing = store.entries[key] ?? createCachedPullRequest(pullRequest);
  const now = Date.now();

  store.entries[key] = {
    ...existing,
    ...patch,
    pullRequest,
    metadata: {
      title: pullRequest.title,
      description: existing.metadata.description,
      repository: pullRequest.repository,
      number: pullRequest.number,
      authorLogin: pullRequest.authorLogin,
      nodeId: existing.metadata.nodeId ?? null,
      baseBranch: existing.metadata.baseBranch,
      headBranch: existing.metadata.headBranch,
      headSha: existing.metadata.headSha ?? null,
      mergeable: existing.metadata.mergeable,
      mergeStateStatus: existing.metadata.mergeStateStatus,
      reviewDecision: existing.metadata.reviewDecision,
      url: pullRequest.url,
      isDraft: pullRequest.isDraft,
      updatedAt: pullRequest.updatedAt,
    },
    reviewThreads: patch.reviewThreads ?? existing.reviewThreads,
    fileSummaries: patch.fileSummaries ?? existing.fileSummaries,
    checks: patch.checks ?? existing.checks,
    rateLimit: patch.rateLimit ?? existing.rateLimit,
    fetchedAtEpochMs: patch.fetchedAtEpochMs ?? now,
    lastAccessedEpochMs: now,
    pinned: patch.pinned ?? existing.pinned,
  };

  writeCacheStore(evictCache(store, bounds));
}

export function writeCachedPullRequestData(data: CachedPullRequestData, bounds = defaultCacheBounds) {
  const store = readCacheStore();
  const key = getPullRequestKey(data.pullRequest);
  const existing = store.entries[key];
  const now = Date.now();

  store.entries[key] = {
    ...data,
    pinned: existing?.pinned ?? data.pinned,
    lastAccessedEpochMs: now,
  };

  writeCacheStore(evictCache(store, bounds));
}

export function setCachedPullRequestPinned(key: string, pinned: boolean) {
  const store = readCacheStore();
  const entry = store.entries[key];
  if (!entry) {
    return;
  }

  store.entries[key] = {
    ...entry,
    pinned,
    lastAccessedEpochMs: Date.now(),
  };
  writeCacheStore(store);
}

export function clearFetchedGithubData() {
  writeCacheStore({ version: 1, entries: {} });
}

export function evictCache(store: PullRequestCacheStore, bounds = defaultCacheBounds): PullRequestCacheStore {
  const next: PullRequestCacheStore = {
    version: 1,
    entries: { ...store.entries },
  };

  let candidates = Object.entries(next.entries)
    .filter(([, entry]) => !entry.pinned)
    .sort(([, left], [, right]) => left.lastAccessedEpochMs - right.lastAccessedEpochMs);

  while (Object.keys(next.entries).length > bounds.maxEntries && candidates.length > 0) {
    const [key] = candidates.shift()!;
    delete next.entries[key];
  }

  while (estimateStoreBytes(next) > bounds.maxBytes && candidates.length > 0) {
    const [key] = candidates.shift()!;
    delete next.entries[key];
  }

  return next;
}

function compactCacheForQuota(store: PullRequestCacheStore): PullRequestCacheStore {
  return {
    version: 1,
    entries: Object.fromEntries(
      Object.entries(store.entries).map(([key, entry]) => [
        key,
        {
          ...entry,
          fileSummaries: entry.fileSummaries.map((file) => {
            const { patch: _patch, ...summary } = file;
            return summary;
          }),
        },
      ]),
    ),
  };
}

function estimateStoreBytes(store: PullRequestCacheStore) {
  return new TextEncoder().encode(JSON.stringify(store)).length;
}
