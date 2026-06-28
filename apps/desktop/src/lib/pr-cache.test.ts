import { beforeEach, describe, expect, it, vi } from "vitest";
import { prCacheStorageKey, readCacheStore, writeCacheStore, type PullRequestCacheStore } from "./pr-cache";

describe("Pull Request cache persistence", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.restoreAllMocks();
  });

  it("compacts cached diff content instead of crashing when WebKit rejects a large rewrite", () => {
    const setItem = vi.fn((key: string, value: string) => {
      if (key === prCacheStorageKey && setItem.mock.calls.length === 1) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }

      storage.set(key, value);
    });

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem,
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    });

    const store: PullRequestCacheStore = {
      version: 1,
      entries: {
        "Resplendent-Data/front-end#2074": {
          pullRequest: {
            repository: "Resplendent-Data/front-end",
            number: 2074,
            title: "feat: complete Eric overhaul",
            authorLogin: "malachibazar",
            isDraft: false,
            updatedAt: "2026-05-25T19:00:00Z",
            url: "https://github.com/Resplendent-Data/front-end/pull/2074",
          },
          metadata: {
            title: "feat: complete Eric overhaul",
            description: null,
            repository: "Resplendent-Data/front-end",
            number: 2074,
            authorLogin: "malachibazar",
            baseBranch: "master",
            headBranch: "feature",
            mergeable: "UNKNOWN",
            mergeStateStatus: "UNKNOWN",
            reviewDecision: null,
            url: "https://github.com/Resplendent-Data/front-end/pull/2074",
            isDraft: false,
            updatedAt: "2026-05-25T19:00:00Z",
          },
          reviewThreads: [],
          fileSummaries: [
            {
              path: "apps/backend/src/scripts/services/ai/learning/service.py",
              additions: 500,
              deletions: 20,
              status: "modified",
              patch: `@@ -1,1 +1,1 @@\n+${"x".repeat(2_500_000)}`,
            },
          ],
          checks: [],
          rateLimit: { remaining: null, resetEpochSeconds: null },
          fetchedAtEpochMs: 1,
          lastAccessedEpochMs: 1,
          pinned: false,
        },
      },
    };

    expect(() => writeCacheStore(store)).not.toThrow();

    const saved = readCacheStore();
    expect(saved.entries["Resplendent-Data/front-end#2074"].fileSummaries[0].patch).toBeNull();
    expect(setItem).toHaveBeenCalledTimes(2);
  });
});
