import {
  buildAnalysisIndex,
  buildAttentionMapPresentation,
} from "./analysis-index";
import type { AnalysisFileSource } from "./deep-analysis";
import { buildLazyDiffState, getDefaultLoadedDiffHunkIds } from "./diff-viewer";
import { buildFileChangeViews, defaultFileChangeFilters, filterFileChanges } from "./file-changes";
import { buildHumanFeedbackPacket } from "./handoff-packet";
import type { CachedFileSummary, CachedPullRequestData, CachedReviewThread } from "./pr-cache";
import { buildReviewOverview, scoreHotspots } from "./review-overview";
import { buildReviewPathItems, moveReviewPathSelection } from "./review-path";
import { getPullRequestKey } from "./review-session";
import { buildReviewThreadViews, defaultReviewQueueFilters, filterReviewThreads } from "./review-queue";
import { buildReviewTargets } from "./review-targets";
import type { PullRequestAnalysisInput } from "./workspace";

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
  contextReferenceCount?: number;
}

export interface SyntheticLargeAnalysisFixture {
  analysisInput: PullRequestAnalysisInput;
  fileContents: AnalysisFileSource[];
}

export interface LargePrPerformanceReport {
  totalMs: number;
  overviewMs: number;
  queueMs: number;
  fileMs: number;
  diffMs: number;
  attentionMapMs: number;
  reviewTargetMs: number;
  reviewPathMs: number;
  renderedThreads: number;
  renderedFiles: number;
  renderedDiffLines: number;
  highlightedDiffLines: number;
  analysisNodes: number;
  attentionMapNodes: number;
  attentionMapEdges: number;
  contextNodes: number;
  maxContextNodesPerFile: number;
  contextOverflowFiles: number;
  fallbackFiles: number;
  generatedClusters: number;
  reviewTargets: number;
  reviewPathItems: number;
  reviewPathMoves: number;
  humanFeedbackPacketThreads: number;
  usableBeforeFullDiffContent: boolean;
  usesLlm: false;
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
  const contextReferenceCount = options.contextReferenceCount ?? Math.min(80, Math.max(20, Math.floor(fileCount / 8)));
  const fileSummaries = createSyntheticFiles(fileCount, hugeGeneratedLines, contextReferenceCount);
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

export function createSyntheticLargeAnalysisFixture(cache: CachedPullRequestData): SyntheticLargeAnalysisFixture {
  const [owner = "acme", name = "large-pr"] = cache.metadata.repository.split("/");

  return {
    analysisInput: {
      repository: {
        owner,
        name,
        slug: cache.metadata.repository,
      },
      pullRequestNumber: cache.metadata.number,
      state: "ready",
      reviewClone: {
        repository: {
          owner,
          name,
          slug: cache.metadata.repository,
        },
        state: "ready",
        storagePath: "app-data/review-clones/repositories/acme/large-pr",
        storageRoot: "app-data/review-clones",
        remoteUrl: "https://github.com/acme/large-pr.git",
        message: null,
        readOnly: true,
        writePermission: false,
        lastCheckedEpochMs: cache.fetchedAtEpochMs,
      },
      baseRef: cache.metadata.baseBranch,
      headRef: cache.metadata.headBranch,
      baseSha: "1111111111111111111111111111111111111111",
      headSha: "2222222222222222222222222222222222222222",
      mergeBaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      comparisonRef: `${cache.metadata.baseBranch ?? "main"}...${cache.metadata.headBranch ?? "head"}`,
      checkoutMode: "read-only-analysis",
      message: null,
    },
    fileContents: cache.fileSummaries.flatMap(createSyntheticFileContent),
  };
}

export function measureLargePrUsability(
  cache: CachedPullRequestData,
  analysisFixture = createSyntheticLargeAnalysisFixture(cache),
): LargePrPerformanceReport {
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

  const attentionMapStart = now();
  const analysisIndex = buildAnalysisIndex({
    pullRequest: cache.pullRequest,
    files: cache.fileSummaries,
    analysisInput: analysisFixture.analysisInput,
    fileContents: analysisFixture.fileContents,
    nowEpochMs: cache.fetchedAtEpochMs,
  });
  const attentionMap = buildAttentionMapPresentation(analysisIndex, cache);
  const hotspots = scoreHotspots(cache.fileSummaries, cache.reviewThreads, {}, analysisIndex, cache.checks);
  const attentionMapMs = now() - attentionMapStart;

  const reviewTargetStart = now();
  const reviewTargets = buildReviewTargets({
    analysisIndex,
    attentionMap,
    currentData: cache,
    hotspots,
  });
  const reviewTargetMs = now() - reviewTargetStart;

  const reviewPathStart = now();
  const reviewPathItems = buildReviewPathItems(reviewTargets, hotspots, { relationships: analysisIndex.relationships });
  let selectedTargetId: string | null = null;
  const reviewPathMoves = Math.min(100, reviewPathItems.length);
  for (let index = 0; index < reviewPathMoves; index += 1) {
    selectedTargetId = moveReviewPathSelection(reviewPathItems, new Set(), selectedTargetId, 1);
  }
  const reviewPathMs = now() - reviewPathStart;

  const humanFeedbackPacket = buildHumanFeedbackPacket({
    pullRequest: cache.metadata,
    threads: cache.reviewThreads,
    files: cache.fileSummaries,
    diffContextByPath: {},
    generatedAt: new Date(cache.fetchedAtEpochMs).toISOString(),
    githubDataFetchedAtEpochMs: cache.fetchedAtEpochMs,
    sourceRevision: analysisFixture.analysisInput.headSha,
  });
  const contextNodesByFile = getContextNodeCountsByFile(analysisIndex.nodes);
  const maxContextNodesPerFile = Math.max(0, ...contextNodesByFile.values());

  return {
    totalMs: now() - startedAt,
    overviewMs,
    queueMs,
    fileMs,
    diffMs,
    attentionMapMs,
    reviewTargetMs,
    reviewPathMs,
    renderedThreads: threadWindow.rendered,
    renderedFiles: fileWindow.rendered,
    renderedDiffLines: diffLines.length,
    highlightedDiffLines: diffLines.filter((line) => line.highlighted).length,
    analysisNodes: analysisIndex.nodes.length,
    attentionMapNodes: attentionMap.nodes.length,
    attentionMapEdges: attentionMap.edges.length,
    contextNodes: analysisIndex.nodes.filter((node) => node.kind === "context").length,
    maxContextNodesPerFile,
    contextOverflowFiles: Object.values(analysisIndex.fileAnalyses).filter((analysis) => analysis.contextOverflowCount > 0).length,
    fallbackFiles: analysisIndex.nodes.filter((node) => node.kind === "file-fallback").length,
    generatedClusters: attentionMap.summary.generatedClusters,
    reviewTargets: reviewTargets.length,
    reviewPathItems: reviewPathItems.length,
    reviewPathMoves,
    humanFeedbackPacketThreads: humanFeedbackPacket.threads.length,
    usableBeforeFullDiffContent:
      overview.counts.changedFiles > 0 &&
      overview.counts.reviewThreads > 0 &&
      threadWindow.rendered > 0 &&
      fileWindow.rendered > 0 &&
      attentionMap.nodes.length > 0 &&
      reviewPathItems.length > 0 &&
      diffState?.fullFileLines === null,
    usesLlm: false,
  };
}

function createSyntheticFiles(
  fileCount: number,
  hugeGeneratedLines: number,
  contextReferenceCount: number,
): CachedFileSummary[] {
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
    if (index <= contextReferenceCount) {
      const group = Math.ceil(index / 2);
      if (index % 2 === 1) {
        files.push({
          path: `src/domain/context-${group}.ts`,
          additions: 2,
          deletions: 1,
          status: "modified",
          patch: createContextImplementationPatch(group),
        });
      } else {
        files.push({
          path: `src/domain/context-${group}.test.ts`,
          additions: 1,
          deletions: 0,
          status: "modified",
          patch: createContextTestPatch(group),
        });
      }
      continue;
    }

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

function createSyntheticFileContent(file: CachedFileSummary): AnalysisFileSource[] {
  const implementationMatch = /^src\/domain\/context-(\d+)\.ts$/.exec(file.path);
  if (implementationMatch?.[1]) {
    return [
      {
        path: file.path,
        state: "loaded",
        content: createContextImplementationContent(Number(implementationMatch[1])),
        message: null,
      },
    ];
  }

  const testMatch = /^src\/domain\/context-(\d+)\.test\.ts$/.exec(file.path);
  if (testMatch?.[1]) {
    return [
      {
        path: file.path,
        state: "loaded",
        content: createContextTestContent(Number(testMatch[1])),
        message: null,
      },
    ];
  }

  return [];
}

function createContextImplementationPatch(index: number) {
  return [
    "@@ -1,8 +1,9 @@",
    ` export function contextFeature${index}(input: string) {`,
    `-  return contextHelper${index}A(input);`,
    `+  if (input.length > 0) return contextHelper${index}A(input);`,
    `+  return [contextHelper${index}B(), contextHelper${index}C(), contextHelper${index}D(), contextHelper${index}E()].join(":");`,
    " }",
    ` function contextHelper${index}A(input: string) { return input.trim(); }`,
    ` function contextHelper${index}B() { return "b"; }`,
  ].join("\n");
}

function createContextImplementationContent(index: number) {
  return [
    `export function contextFeature${index}(input: string) {`,
    `  if (input.length > 0) return contextHelper${index}A(input);`,
    `  return [contextHelper${index}B(), contextHelper${index}C(), contextHelper${index}D(), contextHelper${index}E()].join(":");`,
    "}",
    `function contextHelper${index}A(input: string) { return input.trim(); }`,
    `function contextHelper${index}B() { return "b"; }`,
    `function contextHelper${index}C() { return "c"; }`,
    `function contextHelper${index}D() { return "d"; }`,
    `function contextHelper${index}E() { return "e"; }`,
  ].join("\n");
}

function createContextTestPatch(index: number) {
  return [
    "@@ -1,3 +1,4 @@",
    ` import { contextFeature${index} } from "./context-${index}";`,
    `+contextFeature${index}("ok");`,
  ].join("\n");
}

function createContextTestContent(index: number) {
  return [
    `import { contextFeature${index} } from "./context-${index}";`,
    `contextFeature${index}("ok");`,
  ].join("\n");
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

function getContextNodeCountsByFile(nodes: Array<{ kind: string; filePath: string }>) {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind !== "context") {
      continue;
    }
    counts.set(node.filePath, (counts.get(node.filePath) ?? 0) + 1);
  }
  return counts;
}
