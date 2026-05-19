import { buildLazyDiffState, getDefaultLoadedDiffHunkIds } from "./diff-viewer";
import { buildFileChangeViews, defaultFileChangeFilters, filterFileChanges } from "./file-changes";
import type { CachedFileSummary, CachedPullRequestData, CachedReviewThread } from "./pr-cache";
import { buildReviewOverview } from "./review-overview";
import { getPullRequestKey } from "./review-session";
import { buildReviewThreadViews, defaultReviewQueueFilters, filterReviewThreads } from "./review-queue";

export interface BoundedRenderWindow<T> {
  items: T[];
  total: number;
  rendered: number;
  omitted: number;
  limit: number;
  startIndex: number;
}

export interface LargePullRequestFixtureOptions {
  fileCount?: number;
  threadCount?: number;
  hugeGeneratedLines?: number;
}

export interface LargePrPerformanceReport {
  totalMs: number;
  overviewMs: number;
  queueMs: number;
  fileMs: number;
  diffMs: number;
  renderedThreads: number;
  renderedFiles: number;
  renderedDiffLines: number;
  highlightedDiffLines: number;
  usableBeforeFullDiffContent: boolean;
}

export function getBoundedRenderWindow<T>(
  items: T[],
  options: {
    limit: number;
    startIndex?: number;
  },
): BoundedRenderWindow<T> {
  const limit = Math.max(0, options.limit);
  const maxStart = Math.max(0, items.length - limit);
  const startIndex = Math.min(Math.max(0, options.startIndex ?? 0), maxStart);
  const renderedItems = items.slice(startIndex, startIndex + limit);

  return {
    items: renderedItems,
    total: items.length,
    rendered: renderedItems.length,
    omitted: Math.max(0, items.length - renderedItems.length),
    limit,
    startIndex,
  };
}

export function createSyntheticLargePullRequestFixture(
  options: LargePullRequestFixtureOptions = {},
): CachedPullRequestData {
  const fileCount = options.fileCount ?? 1_200;
  const threadCount = options.threadCount ?? 650;
  const hugeGeneratedLines = options.hugeGeneratedLines ?? 250_000;
  const fileSummaries = createSyntheticFiles(fileCount, hugeGeneratedLines);
  const reviewThreads = createSyntheticThreads(threadCount, fileSummaries);

  return {
    pullRequest: {
      repository: "acme/large-pr",
      number: 9_001,
      title: "Stress a massive generated change",
      authorLogin: "octocat",
      isDraft: false,
      updatedAt: "2026-05-18T12:00:00Z",
      url: "https://github.com/acme/large-pr/pull/9001",
    },
    metadata: {
      title: "Stress a massive generated change",
      description: "Synthetic fixture for large Pull Request performance.",
      repository: "acme/large-pr",
      number: 9_001,
      authorLogin: "octocat",
      baseBranch: "main",
      headBranch: "perf/large-pr",
      mergeable: "UNKNOWN",
      mergeStateStatus: "UNSTABLE",
      reviewDecision: "REVIEW_REQUIRED",
      url: "https://github.com/acme/large-pr/pull/9001",
      isDraft: false,
      updatedAt: "2026-05-18T12:00:00Z",
    },
    reviewThreads,
    fileSummaries,
    checks: [
      {
        name: "metadata fetch",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/acme/large-pr/actions/runs/1",
        startedAt: "2026-05-18T12:00:00Z",
        completedAt: "2026-05-18T12:00:04Z",
      },
      {
        name: "diff hydrate",
        status: "in-progress",
        conclusion: null,
        url: "https://github.com/acme/large-pr/actions/runs/2",
        startedAt: "2026-05-18T12:00:05Z",
        completedAt: null,
      },
    ],
    rateLimit: {
      remaining: 0,
      resetEpochSeconds: 1_800_001_200,
    },
    fetchedAtEpochMs: 1_800_000_000_000,
    lastAccessedEpochMs: 1_800_000_000_000,
    pinned: false,
  };
}

export function measureLargePrUsability(cache: CachedPullRequestData): LargePrPerformanceReport {
  const startedAt = now();
  const overviewStart = now();
  const overview = buildReviewOverview(cache);
  const overviewMs = now() - overviewStart;

  const pullRequestKey = getPullRequestKey(cache.pullRequest);
  const queueStart = now();
  const reviewThreadViews = buildReviewThreadViews("perf-user", pullRequestKey, cache.reviewThreads, { version: 1, users: {} });
  const filteredThreads = filterReviewThreads(reviewThreadViews, defaultReviewQueueFilters);
  const threadWindow = getBoundedRenderWindow(filteredThreads, { limit: 80 });
  const queueMs = now() - queueStart;

  const fileStart = now();
  const fileChangeViews = buildFileChangeViews("perf-user", pullRequestKey, cache.fileSummaries, { version: 1, users: {} });
  const filteredFiles = filterFileChanges(fileChangeViews, defaultFileChangeFilters);
  const fileWindow = getBoundedRenderWindow(filteredFiles, { limit: 120 });
  const fileMs = now() - fileStart;

  const diffStart = now();
  const largestTextFile = cache.fileSummaries.find((file) => file.status !== "binary") ?? cache.fileSummaries[0];
  const diffState = largestTextFile
    ? buildLazyDiffState(largestTextFile, {
        mode: "unified",
        repository: cache.metadata.repository,
        pullRequestNumber: cache.metadata.number,
        loadedHunkIds: getDefaultLoadedDiffHunkIds(largestTextFile),
        fullFileLoaded: false,
      })
    : null;
  const diffLines = diffState?.hunks.flatMap((hunk) => hunk.lines) ?? [];
  const diffMs = now() - diffStart;

  return {
    totalMs: now() - startedAt,
    overviewMs,
    queueMs,
    fileMs,
    diffMs,
    renderedThreads: threadWindow.rendered,
    renderedFiles: fileWindow.rendered,
    renderedDiffLines: diffLines.length,
    highlightedDiffLines: diffLines.filter((line) => line.highlighted).length,
    usableBeforeFullDiffContent:
      overview.counts.changedFiles > 0 &&
      overview.counts.reviewThreads > 0 &&
      threadWindow.rendered > 0 &&
      fileWindow.rendered > 0 &&
      diffState?.fullFileLines === null,
  };
}

function createSyntheticFiles(fileCount: number, hugeGeneratedLines: number): CachedFileSummary[] {
  const statuses: CachedFileSummary["status"][] = ["modified", "added", "modified", "renamed", "binary"];
  const files: CachedFileSummary[] = [
    {
      path: "generated/huge-schema.ts",
      additions: hugeGeneratedLines,
      deletions: Math.floor(hugeGeneratedLines / 5),
      status: "modified",
    },
  ];

  for (let index = 1; index < fileCount; index += 1) {
    const status = statuses[index % statuses.length];
    const extension = index % 19 === 0 ? "png" : index % 23 === 0 ? "ipynb" : index % 7 === 0 ? "rs" : "ts";
    files.push({
      path: `${index % 11 === 0 ? "packages/generated" : "src/domain"}/file-${index}.${extension}`,
      additions: status === "binary" ? 0 : (index % 97) + 1,
      deletions: status === "added" || status === "binary" ? 0 : index % 53,
      status,
    });
  }

  return files;
}

function createSyntheticThreads(threadCount: number, files: CachedFileSummary[]): CachedReviewThread[] {
  return Array.from({ length: threadCount }, (_, index) => {
    const file = files[index % files.length];
    const state: CachedReviewThread["state"] = index % 13 === 0 ? "outdated" : index % 5 === 0 ? "resolved" : "unresolved";

    return {
      id: `synthetic-thread-${index}`,
      authorLogin: index % 3 === 0 ? "coderabbitai" : `reviewer-${index % 17}`,
      filePath: file.path,
      line: file.status === "binary" ? null : (index % 180) + 1,
      state,
      body: `Synthetic Review Thread ${index} for large Pull Request queue stress.`,
      updatedAt: "2026-05-18T12:00:00Z",
    };
  });
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
