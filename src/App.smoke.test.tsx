import { render, screen, waitFor, within } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import {
  analysisIndexStorageKey,
  buildAnalysisIndex,
  buildAttentionMapPresentation,
  buildOrReuseAnalysisIndex,
  getAnalysisIndexKey,
  isAnalysisIndexCurrent,
  readValidAnalysisIndex,
  writeAnalysisIndex,
  type AnalysisIndex,
  type AttentionNode,
  type AttentionRelationship,
} from "./lib/analysis-index";
import { appReleaseDownloadUrl, lastUpdateCheckStorageKey, type AppUpdateClient } from "./lib/app-updater";
import type { AuthClient, AuthSession } from "./lib/auth";
import {
  buildLazyDiffState,
  diffViewerStorageKey,
  getDefaultLoadedDiffHunkIds,
  getLanguageForPath,
  highlightDiffLines,
  type DiffLine,
} from "./lib/diff-viewer";
import { buildHandoffPacket, renderHandoffMarkdown, selectDiffContextLines } from "./lib/handoff-packet";
import {
  createSyntheticLargePullRequestFixture,
  getBoundedRenderWindow,
  measureLargePrUsability,
} from "./lib/large-pr-performance";
import {
  buildDiagnosticsPreview,
  hasTelemetryEmissionPaths,
  redactOperationalLog,
  renderDiagnosticsExport,
  summarizeFileChangeStore,
  summarizeReviewQueueStore,
  summarizeReviewSessionStore,
  telemetryPolicy,
} from "./lib/privacy-diagnostics";
import {
  buildFileChangeViews,
  fileChangeStorageKey,
  filterFileChanges,
  setFileChangeViewed,
  syncFileChanges,
  type FileChangeFilters,
} from "./lib/file-changes";
import {
  buildIncrementalFetchPlan,
  cacheStats,
  clearFetchedGithubData,
  createCachedPullRequest,
  evictCache,
  networkRequiredFailure,
  prCacheStorageKey,
  readCacheStore,
  setCachedPullRequestPinned,
  type CachedPullRequestData,
  upsertCachedPullRequest,
  writeCachedPullRequestData,
} from "./lib/pr-cache";
import { buildReviewOverview, getMergeReadiness, scoreHotspots, summarizeChecks } from "./lib/review-overview";
import { buildReviewTargets } from "./lib/review-targets";
import {
  buildReviewThreadViews,
  filterReviewThreads,
  reviewQueueStorageKey,
  setReviewThreadReviewed,
  syncReviewThreads,
} from "./lib/review-queue";
import {
  getPullRequestKey,
  parsePullRequestUrl,
  reviewSessionStorageKey,
  type ReviewSessionClient,
  type ReviewSessionSnapshot,
} from "./lib/review-session";
import {
  createThreadActionFailure,
  networkRequiredThreadActionFailure,
  validateReplyBody,
  type ThreadActionClient,
} from "./lib/thread-actions";
import type {
  PullRequestAnalysisInput,
  PullRequestSummary,
  ReviewCloneStatus,
  WorkspaceClient,
  WorkspaceRepository,
} from "./lib/workspace";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

const signedOutSession: AuthSession = {
  state: "signed-out",
  storage: {
    available: true,
    message: null,
  },
  accountLogin: null,
  tokenHint: null,
};

const signedInSession: AuthSession = {
  state: "signed-in",
  storage: {
    available: true,
    message: null,
  },
  accountLogin: "octocat",
  tokenHint: "os-secure-storage",
};

const narviewRepository: WorkspaceRepository = {
  owner: "Resplendent-Data",
  name: "Narview",
  slug: "Resplendent-Data/Narview",
};

const readyReviewCloneStatus: ReviewCloneStatus = {
  repository: narviewRepository,
  state: "ready",
  storagePath: "/Users/octocat/Library/Application Support/com.resplendent-data.narview/review-clones/repositories/resplendent-data/narview",
  storageRoot: "/Users/octocat/Library/Application Support/com.resplendent-data.narview/review-clones",
  remoteUrl: "https://github.com/Resplendent-Data/Narview.git",
  message: "Review Clone is ready for read-only analysis.",
  readOnly: true,
  writePermission: true,
  lastCheckedEpochMs: 1_800_000_000_000,
};

const notClonedReviewCloneStatus: ReviewCloneStatus = {
  ...readyReviewCloneStatus,
  state: "not-cloned",
  message: "No app-managed Review Clone exists for this repository yet.",
  writePermission: false,
};

const readyAnalysisInput: PullRequestAnalysisInput = {
  repository: narviewRepository,
  pullRequestNumber: 12,
  state: "ready",
  reviewClone: readyReviewCloneStatus,
  baseRef: "refs/narview/pr/12/base",
  headRef: "refs/narview/pr/12/head",
  baseSha: "1111111111111111111111111111111111111111",
  headSha: "2222222222222222222222222222222222222222",
  mergeBaseSha: "1111111111111111111111111111111111111111",
  comparisonRef: "1111111111111111111111111111111111111111",
  checkoutMode: "detached-head",
  message: "Prepared a same-repository Pull Request head.",
};

const readyPullRequest: PullRequestSummary = {
  repository: "Resplendent-Data/Narview",
  number: 12,
  title: "Add checkout guard",
  authorLogin: "octocat",
  isDraft: false,
  updatedAt: "2026-05-18T12:00:00Z",
  url: "https://github.com/Resplendent-Data/Narview/pull/12",
};

const draftPullRequest: PullRequestSummary = {
  repository: "Resplendent-Data/Narview",
  number: 13,
  title: "Draft billing sync",
  authorLogin: "monalisa",
  isDraft: true,
  updatedAt: "2026-05-18T13:00:00Z",
  url: "https://github.com/Resplendent-Data/Narview/pull/13",
};

const restoredSnapshot: ReviewSessionSnapshot = {
  activeQueueId: "needs-attention",
  includeDrafts: true,
  focusMode: true,
  threadKey: "coderabbitai:src/auth/session.ts:142",
  filePath: "src/auth/session.ts",
  nearbyLine: 142,
  updatedAtEpochMs: 1_800_000_000_000,
};

const localStorageMock = {
  store: new Map<string, string>(),
  getItem(key: string) {
    return this.store.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    this.store.set(key, value);
  },
  removeItem(key: string) {
    this.store.delete(key);
  },
  clear() {
    this.store.clear();
  },
};

function createAuthClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    getStatus: vi.fn().mockResolvedValue(signedOutSession),
    startSignIn: vi.fn().mockResolvedValue({
      flowId: "flow-1",
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
      verificationUriComplete: "https://github.com/login/device?user_code=ABCD-1234",
      expiresAtEpochSeconds: 1_800_000_000,
      intervalSeconds: 5,
      openedBrowser: true,
    }),
    pollSignIn: vi.fn().mockResolvedValue({
      state: "pending",
      intervalSeconds: 5,
      message: null,
      session: null,
    }),
    signOut: vi.fn().mockResolvedValue(signedOutSession),
    ...overrides,
  };
}

function createWorkspaceClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    listRepositories: vi.fn().mockResolvedValue({ repositories: [] }),
    saveRepository: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
    removeRepository: vi.fn().mockResolvedValue({ repositories: [] }),
    getReviewCloneStatus: vi.fn().mockResolvedValue(notClonedReviewCloneStatus),
    ensureReviewClone: vi.fn().mockResolvedValue(readyReviewCloneStatus),
    preparePullRequestReviewClone: vi.fn().mockResolvedValue(readyAnalysisInput),
    readPullRequestAnalysisFiles: vi.fn().mockImplementation(async (_pullRequest: PullRequestSummary, paths: string[]) => ({
      repository: narviewRepository,
      pullRequestNumber: 12,
      headSha: readyAnalysisInput.headSha,
      files: paths.map((path) => ({
        path,
        state: "unavailable",
        content: null,
        message: "No fixture content.",
      })),
    })),
    refreshPullRequests: vi.fn().mockResolvedValue({
      repositories: [narviewRepository],
      pullRequests: [readyPullRequest],
      status: {
        state: "fresh",
        message: "Fetched 1 open pull requests.",
        rateLimitResetEpochSeconds: null,
        refreshedAtEpochSeconds: 1_800_000_000,
      },
    }),
    fetchPullRequestData: vi.fn().mockResolvedValue(createOverviewFixture()),
    fetchPullRequestChecks: vi.fn().mockResolvedValue({
      checks: createOverviewFixture().checks,
      rateLimit: {
        remaining: 4_990,
        resetEpochSeconds: 1_800_003_600,
      },
      fetchedAtEpochMs: 1_800_000_500_000,
    }),
    ...overrides,
  };
}

function createReviewSessionClient(overrides: Partial<ReviewSessionClient> = {}): ReviewSessionClient {
  return {
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(null),
    loadLastSession: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createThreadActionClient(overrides: Partial<ThreadActionClient> = {}): ThreadActionClient {
  return {
    reply: vi.fn().mockImplementation(async (threadId: string) => ({
      ok: true,
      action: "reply",
      threadId,
      message: "Reply added to GitHub Review Thread.",
      replyUrl: "https://github.com/Resplendent-Data/Narview/pull/12#discussion_r1",
    })),
    resolve: vi.fn().mockImplementation(async (threadId: string) => ({
      ok: true,
      action: "resolve",
      threadId,
      message: "Review Thread resolved on GitHub.",
      replyUrl: null,
    })),
    unresolve: vi.fn().mockImplementation(async (threadId: string) => ({
      ok: true,
      action: "unresolve",
      threadId,
      message: "Review Thread unresolved on GitHub.",
      replyUrl: null,
    })),
    ...overrides,
  };
}

function createUpdaterClient(overrides: Partial<AppUpdateClient> = {}): AppUpdateClient {
  return {
    isDesktopRuntime: vi.fn(() => true),
    getCurrentVersion: vi.fn().mockResolvedValue("0.1.0"),
    checkForUpdate: vi.fn().mockResolvedValue(null),
    relaunch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createOverviewFixture(): CachedPullRequestData {
  const cache = createCachedPullRequest(readyPullRequest, 1_800_000_000_000);

  return {
    ...cache,
    metadata: {
      ...cache.metadata,
      description: "Adds a checkout guard.",
      baseBranch: "main",
      headBranch: "feature/checkout-guard",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
    },
    fileSummaries: [
      { path: "src/auth/session.ts", additions: 160, deletions: 55, status: "modified" },
      { path: "docs/readme.md", additions: 20, deletions: 0, status: "modified" },
    ],
    reviewThreads: [
      {
        id: "thread-1",
        authorLogin: "coderabbitai",
        filePath: "src/auth/session.ts",
        line: 24,
        state: "unresolved",
        body: "Session path needs a stale-cache guard.",
        updatedAt: "2026-05-18T12:00:00Z",
      },
    ],
    checks: [
      {
        name: "build",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/Resplendent-Data/Narview/actions/runs/1",
        startedAt: "2026-05-18T12:00:00Z",
        completedAt: "2026-05-18T12:02:05Z",
      },
    ],
  };
}

function createReviewTargetIndex(nodes: AttentionNode[], relationships: AttentionRelationship[] = []): AnalysisIndex {
  return {
    version: 1,
    analysisVersion: 3,
    repository: readyPullRequest.repository,
    pullRequestNumber: readyPullRequest.number,
    pullRequestKey: getPullRequestKey(readyPullRequest),
    headSha: readyAnalysisInput.state === "ready" ? (readyAnalysisInput.headSha ?? "head-unavailable") : "head-unavailable",
    sourceSignature: "review-target-test",
    storageScope: "local-storage-outside-review-clone",
    generatedAtEpochMs: 1_800_000_000_000,
    nodes,
    relationships,
    fileAnalyses: Object.fromEntries(
      [...new Set(nodes.map((node) => node.filePath))].map((path) => [
        path,
        {
          language: "typescript",
          state: "parsed",
          symbolCount: nodes.filter((node) => node.filePath === path && node.kind === "symbol").length,
          relationshipCount: relationships.filter((relationship) => relationship.filePath === path).length,
          importCount: 0,
          exportCount: 0,
          contextNodeCount: 0,
          contextOverflowCount: 0,
          reasons: ["Synthetic review target fixture."],
        },
      ]),
    ),
  };
}

function createSyntheticAttentionNode(overrides: Partial<AttentionNode> & Pick<AttentionNode, "id" | "filePath" | "label">): AttentionNode {
  return {
    kind: "symbol",
    reason: "changed-symbol",
    fileKind: "text",
    status: "modified",
    hunkId: null,
    lineStart: 1,
    lineEnd: 4,
    additions: 1,
    deletions: 0,
    reviewTarget: true,
    ...overrides,
  };
}

function createQueueThreads(): CachedPullRequestData["reviewThreads"] {
  return [
    {
      id: "thread-coderabbit",
      authorLogin: "coderabbitai",
      filePath: "src/auth/session.ts",
      line: 24,
      state: "unresolved",
      body: "CodeRabbit found a stale session path.",
      updatedAt: "2026-05-18T12:00:00Z",
    },
    {
      id: "thread-human",
      authorLogin: "monalisa",
      filePath: "src/review/queue.ts",
      line: 88,
      state: "resolved",
      body: "Human review resolved this queue concern.",
      updatedAt: "2026-05-18T12:01:00Z",
    },
    {
      id: "thread-outdated",
      authorLogin: "hubot",
      filePath: "src-tauri/src/github.rs",
      line: 44,
      state: "outdated",
      body: "This comment belongs to an older diff hunk.",
      updatedAt: "2026-05-18T12:02:00Z",
    },
  ];
}

function createFileSummaries(): CachedPullRequestData["fileSummaries"] {
  return [
    { path: "src/auth/session.ts", additions: 160, deletions: 55, status: "modified" },
    { path: "assets/review-map.png", additions: 0, deletions: 0, status: "binary" },
    { path: "notebooks/review-findings.ipynb", additions: 0, deletions: 0, status: "modified" },
  ];
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  localStorageMock.clear();
});

async function openPullRequestsDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^pull requests/i }));
  return screen.findByRole("dialog", { name: /open pull requests/i });
}

async function openSettingsDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^settings/i }));
  return screen.findByRole("dialog", { name: /settings/i });
}

describe("App shell", () => {
  it("renders the Guided Review Workspace zones", () => {
    render(<App />);

    expect(screen.getByLabelText("File explorer")).toBeInTheDocument();
    expect(screen.getByLabelText("Review canvas")).toBeInTheDocument();
    expect(screen.getByLabelText("Review queue summary")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspector")).toBeInTheDocument();
    expect(screen.getByAltText("Narview logo")).toHaveAttribute("src", "/app-logo.png");
    expect(screen.getAllByText("Needs attention").length).toBeGreaterThan(0);
  });

  it("keeps the main review panes as independent scroll containers", () => {
    render(<App />);

    expect(screen.getByRole("main")).toHaveClass("overflow-hidden");
    expect(screen.getByLabelText("File explorer")).toHaveClass("pane-scroll-y");
    expect(screen.getByLabelText("Review canvas scroll area")).toHaveClass("pane-scroll");
    expect(screen.getByLabelText("Inspector")).toHaveClass("pane-scroll-y");
  });

  it("uses the sidebar as a file explorer while moving review controls into dialogs and the queue strip", () => {
    render(<App />);

    const fileExplorer = screen.getByLabelText("File explorer");
    const queueSummary = screen.getByLabelText("Review queue summary");

    expect(within(fileExplorer).getByRole("heading", { name: "Files" })).toBeInTheDocument();
    expect(within(fileExplorer).getByLabelText("File tree")).toBeInTheDocument();
    expect(within(fileExplorer).queryByText("Open Pull Requests")).not.toBeInTheDocument();
    expect(within(fileExplorer).queryByText("Workspace")).not.toBeInTheDocument();
    expect(within(queueSummary).getByText("Queues")).toBeInTheDocument();
    expect(within(queueSummary).getByRole("button", { name: /browse threads/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pull requests/i })).toBeInTheDocument();
  });

  it("keeps account, cache, update, and diagnostics controls in Settings instead of the Inspector", async () => {
    const user = userEvent.setup();
    render(<App />);

    const inspector = screen.getByLabelText("Inspector");
    expect(within(inspector).getByLabelText("Live checks")).toBeInTheDocument();
    expect(within(inspector).getByLabelText("Merge readiness context")).toBeInTheDocument();
    expect(within(inspector).queryByLabelText("GitHub session details")).not.toBeInTheDocument();
    expect(within(inspector).queryByLabelText("App updates")).not.toBeInTheDocument();
    expect(within(inspector).queryByLabelText("Pull Request cache")).not.toBeInTheDocument();
    expect(within(inspector).queryByLabelText("Privacy and diagnostics")).not.toBeInTheDocument();

    const settings = await openSettingsDialog(user);
    expect(within(settings).getByLabelText("GitHub session details")).toBeInTheDocument();
    expect(within(settings).getByLabelText("App updates")).toBeInTheDocument();
    expect(within(settings).getByLabelText("Pull Request cache")).toBeInTheDocument();
    expect(within(settings).getByLabelText("Privacy and diagnostics")).toBeInTheDocument();
  });

  it("keeps the full Pull Request summary in a compact markdown accordion without the old clamp", async () => {
    const user = userEvent.setup();
    render(<App />);

    const overview = screen.getByLabelText("Review overview");
    const summaryDisclosure = screen.getByLabelText("Pull Request summary");

    expect(within(overview).getByRole("heading", { name: "PR Summary" })).toBeInTheDocument();
    expect(summaryDisclosure).not.toHaveAttribute("open");
    expect(within(overview).getByText("Remote-first PR review workspace shell with deterministic overview signals.")).toBeInTheDocument();

    await user.click(within(summaryDisclosure).getByText("PR Summary"));

    expect(summaryDisclosure).toHaveAttribute("open");
    expect(within(summaryDisclosure).getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(within(overview).getByText("high-level review state").tagName).toBe("STRONG");
    expect(overview).toHaveTextContent("The reviewer should be able to read the whole Pull Request summary");
    expect(overview.querySelector(".line-clamp-2")).toBeNull();
  });

  it("renders CodeRabbit-style Review Thread markdown with copyable code blocks", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    const thread = screen.getByLabelText("Active review thread");
    const summary = within(thread).getByText("Suggested migration hardening");

    expect(within(thread).queryByRole("heading", { level: 3, name: /rotated token path/i })).not.toBeInTheDocument();
    expect(within(thread).getAllByText(/Potential issue/).some((element) => element.tagName === "EM")).toBe(true);
    expect(summary.tagName).toBe("SUMMARY");
    expect(within(thread).getByText(/sessionCache\.invalidate/)).toBeInTheDocument();
    expect(thread).not.toHaveTextContent("<summary>");
    expect(thread).not.toHaveTextContent("```ts");

    await user.click(summary);
    await user.click(within(thread).getByRole("button", { name: /copy code/i }));

    expect(writeText).toHaveBeenCalledWith("sessionCache.invalidate(previousSession.id);\nreturn nextCredential;");
    expect(within(thread).getByRole("button", { name: /code copied/i })).toBeInTheDocument();
  });

  it("renders Review Thread replies under the initial comment", async () => {
    const user = userEvent.setup();
    const fetchedPullRequestData = createOverviewFixture();
    fetchedPullRequestData.reviewThreads = [
      {
        ...fetchedPullRequestData.reviewThreads[0],
        body: "Initial review concern.",
        comments: [
          {
            id: "comment-initial",
            authorLogin: "coderabbitai",
            body: "Initial review concern.",
            updatedAt: "2026-05-18T12:00:00Z",
            url: "https://github.com/Resplendent-Data/Narview/pull/12#discussion_r1",
          },
          {
            id: "comment-reply",
            authorLogin: "monalisa",
            body: "I pushed a follow-up fix for this thread.",
            updatedAt: "2026-05-18T12:05:00Z",
            url: "https://github.com/Resplendent-Data/Narview/pull/12#discussion_r2",
          },
        ],
      },
    ];
    const workspaceClient = createWorkspaceClient({
      fetchPullRequestData: vi.fn().mockResolvedValue(fetchedPullRequestData),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    const dialog = await openPullRequestsDialog(user);
    await user.type(within(dialog).getByLabelText("Pull Request URL"), readyPullRequest.url);
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));

    const thread = await screen.findByLabelText("Active review thread");
    expect(within(thread).getByText("Initial review concern.")).toBeInTheDocument();
    expect(within(thread).getByLabelText("Review thread replies")).toHaveTextContent("I pushed a follow-up fix for this thread.");
    expect(within(thread).getByText(/@monalisa replied/i)).toBeInTheDocument();
  });

  it("places the active Review Thread inline at the commented diff line", async () => {
    const fetchedPullRequestData = createOverviewFixture();
    fetchedPullRequestData.fileSummaries = [
      {
        path: "src/auth/session.ts",
        additions: 1,
        deletions: 1,
        status: "modified",
        patch: [
          "@@ -22,4 +22,4 @@",
          " export function updateSession() {",
          "   const previous = sessionCache.read();",
          "-  const cached = previous;",
          "+  const cached = nextSession;",
          " }",
        ].join("\n"),
      },
    ];
    fetchedPullRequestData.reviewThreads = [
      {
        id: "thread-inline",
        authorLogin: "coderabbitai",
        filePath: "src/auth/session.ts",
        line: 24,
        state: "unresolved",
        body: "The active review comment should sit next to this replacement.\n\n```ts\nconst cached = nextSession;\n```",
        updatedAt: "2026-05-18T12:04:00Z",
      },
    ];
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockResolvedValue({
        repositories: [narviewRepository],
        pullRequests: [readyPullRequest],
        status: {
          state: "fresh",
          message: "Fetched 1 open pull request.",
          rateLimitResetEpochSeconds: null,
          refreshedAtEpochSeconds: 1_800_000_000,
        },
      }),
      fetchPullRequestData: vi.fn().mockResolvedValue(fetchedPullRequestData),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(1));

    const diffViewer = screen.getByLabelText("Diff viewer");
    const inlineThread = within(diffViewer).getByLabelText("Inline review thread");
    const diffCodeLine = Array.from(diffViewer.querySelectorAll<HTMLElement>(".diff-code-line")).find(
      (line) => line.textContent === "  const cached = nextSession;",
    );

    expect(screen.queryByLabelText("Active review thread")).not.toBeInTheDocument();
    expect(inlineThread).toHaveTextContent("Review Path 1 of 1");
    expect(inlineThread).toHaveTextContent("line 24");
    expect(inlineThread).toHaveTextContent("The active review comment should sit next to this replacement.");
    expect(diffCodeLine?.closest(".diff-row")).toHaveClass("diff-row-comment-anchor");
  });

  it("scrolls to the top review thread card when the active thread has no diff anchor", async () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    try {
      const fetchedPullRequestData = createOverviewFixture();
      fetchedPullRequestData.reviewThreads = [
        {
          id: "thread-top-of-file",
          authorLogin: "coderabbitai",
          filePath: "src/auth/session.ts",
          line: 10_333,
          state: "resolved",
          body: "This thread belongs at the top of the file because no diff anchor matches it.",
          updatedAt: "2026-05-18T12:04:00Z",
        },
      ];
      const workspaceClient = createWorkspaceClient({
        listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
        refreshPullRequests: vi.fn().mockResolvedValue({
          repositories: [narviewRepository],
          pullRequests: [readyPullRequest],
          status: {
            state: "fresh",
            message: "Fetched 1 open pull request.",
            rateLimitResetEpochSeconds: null,
            refreshedAtEpochSeconds: 1_800_000_000,
          },
        }),
        fetchPullRequestData: vi.fn().mockResolvedValue(fetchedPullRequestData),
      });

      render(
        <App
          authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
          workspaceClient={workspaceClient}
        />,
      );

      await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(1));

      expect(screen.getByLabelText("Active review thread")).toHaveTextContent("This thread belongs at the top of the file");
      expect(within(screen.getByLabelText("Diff viewer")).queryByLabelText("Inline review thread")).not.toBeInTheDocument();
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" }));
    } finally {
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
          configurable: true,
          value: originalScrollTo,
        });
      } else {
        delete (HTMLElement.prototype as { scrollTo?: HTMLElement["scrollTo"] }).scrollTo;
      }
    }
  });

  it("toggles focus mode from the visible control", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /focus/i }));

    expect(screen.queryByLabelText("File explorer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Inspector")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /exit focus/i })).toBeInTheDocument();
  });

  it("opens the command palette from the button and keyboard shortcut", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /command/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Next Review Thread")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}k{/Control}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Copy Handoff Packet Markdown")).toBeInTheDocument();
    expect(screen.getAllByText("J").length).toBeGreaterThan(0);
    expect(screen.getAllByText("H").length).toBeGreaterThan(0);
  });

  it("searches command palette commands and runs queue filters", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /command/i }));
    await user.type(screen.getByLabelText("Search commands"), "human threads");

    expect(screen.queryByText("Next Review Thread")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /filter queue: human threads/i }));

    expect(screen.getByLabelText("Source")).toHaveValue("human");
  });

  it("explains unavailable command palette actions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /command/i }));
    await user.type(screen.getByLabelText("Search commands"), "bulk resolve");

    const bulkResolve = screen.getByRole("button", { name: /bulk resolve selected on github/i });
    expect(bulkResolve).toHaveAttribute("aria-disabled", "true");
    expect(bulkResolve).toHaveTextContent("Select one or more Review Threads first.");

    await user.click(bulkResolve);
    expect(screen.queryByText("Confirm bulk resolve")).not.toBeInTheDocument();
  });

  it("runs command palette actions through the same review handlers as visible controls", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    render(<App threadActionClient={threadActionClient} />);

    await user.click(screen.getByRole("button", { name: /command/i }));
    await user.type(screen.getByLabelText("Search commands"), "mark active reviewed");
    await user.click(screen.getByRole("button", { name: /mark active review thread reviewed/i }));

    expect(await within(screen.getByLabelText("Inspector")).findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /command/i }));
    await user.type(screen.getByLabelText("Search commands"), "resolve active");
    await user.click(screen.getByRole("button", { name: /resolve active review thread/i }));

    expect(threadActionClient.resolve).toHaveBeenCalledWith("thread-1");
  });

  it("toggles dark theme from the theme control", async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggle = screen.getByRole("button", { name: /switch to/i });
    await user.click(toggle);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores a signed-in session without rendering the token", async () => {
    const user = userEvent.setup();
    const token = "gho_secretabcdefghijklmnopqrstuvwxyz123456";
    const authClient = createAuthClient({
      getStatus: vi.fn().mockResolvedValue(signedInSession),
    });

    render(<App authClient={authClient} />);

    expect(await screen.findByText("@octocat")).toBeInTheDocument();
    const settings = await openSettingsDialog(user);
    expect(within(settings).getByText("OS secure storage")).toBeInTheDocument();
    expect(screen.queryByText(token)).not.toBeInTheDocument();
  });

  it("starts the GitHub OAuth device flow from the sign-in button", async () => {
    const user = userEvent.setup();
    const authClient = createAuthClient();
    render(<App authClient={authClient} />);

    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    expect(authClient.startSignIn).toHaveBeenCalledTimes(1);
    const dialog = await screen.findByRole("dialog", { name: /enter this code in github/i });
    expect(within(dialog).getByLabelText("GitHub device code")).toHaveTextContent("ABCD-1234");
    await user.click(within(dialog).getByRole("button", { name: /open github/i }));
    expect(openUrl).toHaveBeenCalledWith("https://github.com/login/device?user_code=ABCD-1234");
    expect(within(dialog).getByRole("button", { name: /i entered it/i })).toBeInTheDocument();
  });

  it("signs out through the backend session command", async () => {
    const user = userEvent.setup();
    const authClient = createAuthClient({
      getStatus: vi.fn().mockResolvedValue(signedInSession),
    });

    render(<App authClient={authClient} />);

    await user.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Signed out")).toBeInTheDocument();
  });

  it("saves and removes GitHub repositories in the Workspace", async () => {
    const user = userEvent.setup();
    const workspaceClient = createWorkspaceClient();

    render(<App authClient={createAuthClient()} workspaceClient={workspaceClient} />);

    const dialog = await openPullRequestsDialog(user);
    await user.type(within(dialog).getByLabelText("Repository slug"), "Resplendent-Data/Narview");
    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    expect(workspaceClient.saveRepository).toHaveBeenCalledWith("Resplendent-Data/Narview");
    expect(await within(dialog).findByText("Resplendent-Data/Narview")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /remove resplendent-data\/narview/i }));

    expect(workspaceClient.removeRepository).toHaveBeenCalledWith("Resplendent-Data", "Narview");
    expect(await within(dialog).findByText("No saved repositories.")).toBeInTheDocument();
  });

  it("initializes and reuses a managed Review Clone from a saved repository", async () => {
    const user = userEvent.setup();
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      getReviewCloneStatus: vi.fn().mockResolvedValue(notClonedReviewCloneStatus),
      ensureReviewClone: vi.fn().mockResolvedValue(readyReviewCloneStatus),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    await waitFor(() => expect(workspaceClient.getReviewCloneStatus).toHaveBeenCalledWith("Resplendent-Data/Narview"));
    const dialog = await openPullRequestsDialog(user);
    await user.click(within(dialog).getByLabelText("Initialize Review Clone for Resplendent-Data/Narview"));

    expect(workspaceClient.ensureReviewClone).toHaveBeenCalledWith("Resplendent-Data/Narview");
    const cloneHealth = await screen.findByLabelText("Review clone health");
    await waitFor(() => expect(within(cloneHealth).getByText("Ready")).toBeInTheDocument());
    expect(cloneHealth).toHaveTextContent("App-managed");
    expect(cloneHealth).toHaveTextContent("Read-only analysis");
    expect(cloneHealth).toHaveTextContent("GitHub writes available");
  });

  it("shows Read-Only Mode when GitHub write permission is unavailable", async () => {
    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedOutSession) })}
        workspaceClient={createWorkspaceClient()}
      />,
    );

    const cloneHealth = await screen.findByLabelText("Review clone health");
    await waitFor(() => expect(cloneHealth).toHaveTextContent("Read-Only Mode"));
  });

  it("prepares the Pull Request head as the Review Clone analysis input when a PR opens", async () => {
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      getReviewCloneStatus: vi.fn().mockResolvedValue(readyReviewCloneStatus),
      preparePullRequestReviewClone: vi.fn().mockResolvedValue(readyAnalysisInput),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    await waitFor(() => expect(workspaceClient.preparePullRequestReviewClone).toHaveBeenCalledWith(readyPullRequest));
    const analysisInput = await screen.findByLabelText("Pull Request analysis input");
    expect(analysisInput).toHaveTextContent("Prepared");
    expect(analysisInput).toHaveTextContent("Head 2222222");
    expect(analysisInput).toHaveTextContent("Compare 1111111");
  });

  it("keeps GitHub review data visible when Pull Request head preparation is unavailable", async () => {
    const unavailableInput: PullRequestAnalysisInput = {
      ...readyAnalysisInput,
      state: "unavailable",
      headSha: null,
      mergeBaseSha: null,
      comparisonRef: null,
      message: "Could not fetch the Pull Request head ref.",
    };
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      preparePullRequestReviewClone: vi.fn().mockResolvedValue(unavailableInput),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    expect((await screen.findAllByText("Add checkout guard")).length).toBeGreaterThan(0);
    const analysisInput = await screen.findByLabelText("Pull Request analysis input");
    await waitFor(() => expect(analysisInput).toHaveTextContent("Unavailable"));
  });

  it("builds an Analysis Index with parsed hunks and deterministic fallbacks", () => {
    const files: CachedPullRequestData["fileSummaries"] = [
      {
        path: "src/auth/session.ts",
        additions: 1,
        deletions: 1,
        status: "modified",
        patch: "@@ -1,2 +1,2 @@\n-export const stale = true;\n+export const stale = false;",
      },
      {
        path: "src/parser.ts",
        additions: 4,
        deletions: 1,
        status: "modified",
        patch: "parser output was unavailable",
      },
      {
        path: "assets/review-map.png",
        additions: 0,
        deletions: 0,
        status: "binary",
        patch: null,
      },
      {
        path: "docs/generated.md",
        additions: 3,
        deletions: 0,
        status: "modified",
        patch: null,
      },
    ];

    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files,
      analysisInput: readyAnalysisInput,
      nowEpochMs: 123,
    });

    expect(index.storageScope).toBe("local-storage-outside-review-clone");
    expect(index.headSha).toBe(readyAnalysisInput.headSha);
    expect(index.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/auth/session.ts",
          kind: "hunk",
          reason: "diff-hunk",
        }),
        expect.objectContaining({
          filePath: "src/parser.ts",
          kind: "hunk",
          reason: "generated-hunk-fallback",
        }),
        expect.objectContaining({
          filePath: "assets/review-map.png",
          kind: "file-fallback",
          reason: "unsupported-file",
        }),
        expect.objectContaining({
          filePath: "docs/generated.md",
          kind: "file-fallback",
          reason: "missing-text-diff",
        }),
      ]),
    );
  });

  it("persists, reuses, and invalidates Analysis Index entries by head and version", () => {
    const files = createOverviewFixture().fileSummaries;
    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files,
      analysisInput: readyAnalysisInput,
      nowEpochMs: 456,
    });

    writeAnalysisIndex(index);
    const stored = JSON.parse(window.localStorage.getItem(analysisIndexStorageKey) ?? "{}");
    const key = getAnalysisIndexKey(readyPullRequest.repository, readyPullRequest.number, index.headSha);
    expect(stored.entries[key].generatedAtEpochMs).toBe(456);

    const reused = buildOrReuseAnalysisIndex({
      pullRequest: readyPullRequest,
      files,
      analysisInput: readyAnalysisInput,
    });
    expect(reused.generatedAtEpochMs).toBe(456);

    const nextHead = {
      ...readyAnalysisInput,
      headSha: "3333333333333333333333333333333333333333",
    };
    expect(
      readValidAnalysisIndex({
        pullRequest: readyPullRequest,
        files,
        analysisInput: nextHead,
      }),
    ).toBeNull();
    expect(
      isAnalysisIndexCurrent(index, {
        pullRequest: readyPullRequest,
        files,
        analysisInput: readyAnalysisInput,
        analysisVersion: 4,
      }),
    ).toBe(false);
  });

  it("rebuilds the Attention Map presentation from the Analysis Index and current PR data", () => {
    const currentData = createOverviewFixture();
    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files: currentData.fileSummaries,
      analysisInput: readyAnalysisInput,
    });
    const presentation = buildAttentionMapPresentation(index, currentData);

    expect(presentation.summary.files).toBe(currentData.fileSummaries.length);
    expect(presentation.summary.hunkNodes).toBe(index.nodes.filter((node) => node.kind === "hunk").length);
    expect(presentation.summary.reviewThreads).toBe(currentData.reviewThreads.length);
    expect(presentation.edges.length).toBeGreaterThanOrEqual(index.nodes.length);
    expect(presentation.nodes.find((node) => node.id === "file:src/auth/session.ts")).toEqual(
      expect.objectContaining({
        threadCount: 1,
      }),
    );
  });

  it("creates symbol Attention Nodes for TypeScript, JavaScript, and Python content", () => {
    const files: CachedPullRequestData["fileSummaries"] = [
      {
        path: "src/session.tsx",
        additions: 1,
        deletions: 1,
        status: "modified",
        patch: "@@ -3,3 +3,3 @@\n export function rotateSession() {\n-  return previousToken();\n+  return refreshToken();\n }",
      },
      {
        path: "src/components/Banner.jsx",
        additions: 1,
        deletions: 0,
        status: "modified",
        patch: "@@ -2,3 +2,4 @@\n export function Banner() {\n+  trackBanner();\n   return <div />;\n }",
      },
      {
        path: "tools/analyze.py",
        additions: 1,
        deletions: 1,
        status: "modified",
        patch: "@@ -3,3 +3,3 @@\n def analyze_review():\n-    return parse_old()\n+    return parse_next()",
      },
    ];

    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files,
      analysisInput: readyAnalysisInput,
      fileContents: [
        {
          path: "src/session.tsx",
          state: "loaded",
          content:
            'import { refreshToken } from "./tokens";\n\nexport function rotateSession() {\n  return refreshToken();\n}\n\nfunction refreshToken() {\n  return "next";\n}\n',
          message: null,
        },
        {
          path: "src/components/Banner.jsx",
          state: "loaded",
          content:
            'import { trackBanner } from "../analytics";\nexport function Banner() {\n  trackBanner();\n  return <div />;\n}\n',
          message: null,
        },
        {
          path: "tools/analyze.py",
          state: "loaded",
          content:
            "from .parser import parse_next\n\n\ndef analyze_review():\n    return parse_next()\n\nclass ReviewAnalyzer:\n    def inspect(self):\n        return analyze_review()\n",
          message: null,
        },
      ],
    });

    expect(index.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "symbol", label: "rotateSession", language: "typescript" }),
        expect.objectContaining({ kind: "symbol", label: "Banner", symbolKind: "component", language: "javascript" }),
        expect.objectContaining({ kind: "symbol", label: "analyze_review", language: "python" }),
      ]),
    );
    expect(index.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "same-file-call", fromSymbolName: "rotateSession", toSymbolName: "refreshToken" }),
        expect.objectContaining({ kind: "module-import", targetModule: "./tokens" }),
        expect.objectContaining({ kind: "module-import", targetModule: ".parser" }),
      ]),
    );
  });

  it("falls back to hunk nodes when supported-language parsing fails", () => {
    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files: [
        {
          path: "src/broken.ts",
          additions: 1,
          deletions: 1,
          status: "modified",
          patch: "@@ -1,2 +1,2 @@\n-export function broken() {}\n+export function broken(",
        },
      ],
      analysisInput: readyAnalysisInput,
      fileContents: [
        {
          path: "src/broken.ts",
          state: "loaded",
          content: "export function broken(",
          message: null,
        },
      ],
    });

    expect(index.nodes).toEqual([
      expect.objectContaining({
        kind: "hunk",
        reason: "diff-hunk",
      }),
    ]);
    expect(index.fileAnalyses["src/broken.ts"]).toEqual(
      expect.objectContaining({
        language: "typescript",
        state: "fallback",
      }),
    );
  });

  it("adds capped Context Nodes and explainable graph edges around changed symbols", () => {
    const files: CachedPullRequestData["fileSummaries"] = [
      {
        path: "src/session.ts",
        additions: 2,
        deletions: 2,
        status: "modified",
        patch:
          "@@ -1,7 +1,7 @@\n export function rotateSession() {\n-  const token = previousToken();\n+  const token = refreshToken();\n   auditSession();\n@@ -15,1 +15,1 @@\n-export const SESSION_KIND = 'old';\n+export const SESSION_KIND = 'rotated';",
      },
      {
        path: "src/session.test.ts",
        additions: 1,
        deletions: 0,
        status: "modified",
        patch: "@@ -1,2 +1,3 @@\n import { rotateSession } from './session';\n+rotateSession();",
      },
    ];
    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files,
      analysisInput: readyAnalysisInput,
      fileContents: [
        {
          path: "src/session.ts",
          state: "loaded",
          content:
            "export function rotateSession() {\n  const token = refreshToken();\n  auditSession();\n  loadSession();\n  invalidateSession();\n  return token;\n}\n\nfunction refreshToken() {\n  return 'next';\n}\nfunction auditSession() {}\nfunction loadSession() {}\nfunction invalidateSession() {}\nexport const SESSION_KIND = 'rotated';\n",
          message: null,
        },
        {
          path: "src/session.test.ts",
          state: "loaded",
          content: "import { rotateSession } from './session';\nrotateSession();\n",
          message: null,
        },
      ],
    });

    expect(index.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "symbol", label: "rotateSession", reviewTarget: true }),
        expect.objectContaining({ kind: "symbol", label: "SESSION_KIND", reviewTarget: true }),
        expect.objectContaining({ kind: "context", label: "refreshToken", reviewTarget: false }),
      ]),
    );
    expect(index.fileAnalyses["src/session.ts"]).toEqual(
      expect.objectContaining({
        contextNodeCount: 3,
        contextOverflowCount: 1,
      }),
    );
    expect(index.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "same-file", fromSymbolName: "rotateSession", toSymbolName: "SESSION_KIND" }),
        expect.objectContaining({ kind: "test-file", targetFilePath: "src/session.ts" }),
      ]),
    );

    const presentation = buildAttentionMapPresentation(index, {
      ...createOverviewFixture(),
      fileSummaries: files,
      reviewThreads: [
        {
          id: "thread-session",
          authorLogin: "monalisa",
          filePath: "src/session.ts",
          line: 2,
          state: "unresolved",
          body: "Please verify the rotation logic.",
          updatedAt: "2026-05-18T12:00:00Z",
        },
      ],
    });
    expect(presentation.summary.contextNodes).toBe(3);
    expect(presentation.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "review-thread", reason: expect.stringContaining("thread-session") }),
        expect.objectContaining({ kind: "test-file", reason: expect.stringContaining("deterministic test naming") }),
      ]),
    );
    expect(presentation.edges.every((edge) => edge.reason.length > 0)).toBe(true);
  });

  it("renders and persists the Analysis Index-backed Attention Map", async () => {
    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={createWorkspaceClient({
          listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
          getReviewCloneStatus: vi.fn().mockResolvedValue(readyReviewCloneStatus),
          preparePullRequestReviewClone: vi.fn().mockResolvedValue(readyAnalysisInput),
          readPullRequestAnalysisFiles: vi.fn().mockImplementation(async (_pullRequest: PullRequestSummary, paths: string[]) => ({
            repository: narviewRepository,
            pullRequestNumber: 12,
            headSha: readyAnalysisInput.headSha,
            files: paths.map((path) => ({
              path,
              state: path === "src/auth/session.ts" ? "loaded" : "unsupported",
              content:
                path === "src/auth/session.ts"
                  ? "export function rotateSession() {\n  return refreshToken();\n}\n\nfunction refreshToken() {\n  return 'next';\n}\n"
                  : null,
              message: path === "src/auth/session.ts" ? null : "Unsupported fixture file.",
            })),
          })),
          fetchPullRequestData: vi.fn().mockResolvedValue({
            ...createOverviewFixture(),
            fileSummaries: [
              {
                path: "src/auth/session.ts",
                additions: 1,
                deletions: 1,
                status: "modified",
                patch: "@@ -1,3 +1,3 @@\n export function rotateSession() {\n-  return previousToken();\n+  return refreshToken();\n }",
              },
              {
                path: "assets/review-map.png",
                additions: 0,
                deletions: 0,
                status: "binary",
                patch: null,
              },
            ],
          }),
        })}
      />,
    );

    const attentionMap = await screen.findByLabelText("Attention map");
    await waitFor(() => expect(attentionMap).toHaveTextContent("Head 2222222"));
    await waitFor(() => expect(attentionMap).toHaveTextContent("rotateSession"));
    expect(attentionMap).toHaveTextContent("Symbols");
    expect(attentionMap).toHaveTextContent("Context");
    expect(attentionMap).toHaveTextContent("Hunks");
    expect(attentionMap).toHaveTextContent("Fallbacks");
    expect(attentionMap).toHaveTextContent("Edges");
    expect(attentionMap).toHaveTextContent("assets/review-map.png");
    expect(window.localStorage.getItem(analysisIndexStorageKey)).toContain(readyAnalysisInput.headSha);
  });

  it("loads non-draft Pull Requests by default and includes drafts when filtered", async () => {
    const user = userEvent.setup();
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockImplementation(async (includeDrafts: boolean) => ({
        repositories: [narviewRepository],
        pullRequests: includeDrafts ? [draftPullRequest, readyPullRequest] : [readyPullRequest],
        status: {
          state: "fresh",
          message: `Fetched ${includeDrafts ? 2 : 1} open pull requests.`,
          rateLimitResetEpochSeconds: null,
          refreshedAtEpochSeconds: 1_800_000_000,
        },
      })),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    expect((await screen.findAllByText("Add checkout guard")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Draft billing sync")).not.toBeInTheDocument();

    const dialog = await openPullRequestsDialog(user);
    await user.click(within(dialog).getByLabelText("Include draft Pull Requests"));

    expect(await within(dialog).findByText("Draft billing sync")).toBeInTheDocument();
    expect(workspaceClient.refreshPullRequests).toHaveBeenCalledWith(false);
    expect(workspaceClient.refreshPullRequests).toHaveBeenCalledWith(true);
  });

  it("manual refresh reloads selected Pull Request review thread states", async () => {
    const user = userEvent.setup();
    const initialData = createOverviewFixture();
    const refreshedData = createOverviewFixture();
    refreshedData.reviewThreads = refreshedData.reviewThreads.map((thread) => ({
      ...thread,
      state: "resolved",
      updatedAt: "2026-05-18T12:05:00Z",
    }));
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockResolvedValue({
        repositories: [narviewRepository],
        pullRequests: [readyPullRequest],
        status: {
          state: "fresh",
          message: "Fetched 1 open pull request.",
          rateLimitResetEpochSeconds: null,
          refreshedAtEpochSeconds: 1_800_000_000,
        },
      }),
      fetchPullRequestData: vi.fn().mockResolvedValueOnce(initialData).mockResolvedValueOnce(refreshedData),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(1));
    expect(within(screen.getByLabelText("Inspector")).getByText("Unresolved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh current pull request/i }));

    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(2));
    expect(within(screen.getByLabelText("Inspector")).getByText("Resolved")).toBeInTheDocument();
    expect(screen.getAllByText(/Refreshed GitHub Pull Request review data/).length).toBeGreaterThan(0);
  });

  it("shows the current Pull Request in the canvas header and refreshes it with Control+R", async () => {
    const user = userEvent.setup();
    const initialData = createOverviewFixture();
    const refreshedData = createOverviewFixture();
    refreshedData.reviewThreads = refreshedData.reviewThreads.map((thread) => ({
      ...thread,
      state: "resolved",
      updatedAt: "2026-05-18T12:05:00Z",
    }));
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockResolvedValue({
        repositories: [narviewRepository],
        pullRequests: [readyPullRequest],
        status: {
          state: "fresh",
          message: "Fetched 1 open pull request.",
          rateLimitResetEpochSeconds: null,
          refreshedAtEpochSeconds: 1_800_000_000,
        },
      }),
      fetchPullRequestData: vi.fn().mockResolvedValueOnce(initialData).mockResolvedValueOnce(refreshedData),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(1));
    const currentPullRequest = screen.getByRole("group", { name: /current pull request/i });
    expect(within(currentPullRequest).getByText("Add checkout guard")).toBeInTheDocument();
    expect(within(currentPullRequest).getByText("#12")).toBeInTheDocument();
    expect(within(currentPullRequest).getByText("Resplendent-Data/Narview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh current pull request/i })).toHaveTextContent("⌃R");

    await user.keyboard("{Control>}r{/Control}");

    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(2));
    expect(within(screen.getByLabelText("Inspector")).getByText("Resolved")).toBeInTheDocument();
  });

  it("refreshes the whole Pull Request after pending checks finish", async () => {
    const user = userEvent.setup();
    const initialData = createOverviewFixture();
    initialData.checks = [
      {
        name: "build",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/Resplendent-Data/Narview/actions/runs/1",
        startedAt: "2026-05-18T12:00:00Z",
        completedAt: "2026-05-18T12:02:05Z",
      },
      {
        name: "preview",
        status: "in-progress",
        conclusion: null,
        url: "https://github.com/Resplendent-Data/Narview/actions/runs/2",
        startedAt: "2026-05-18T12:03:00Z",
        completedAt: null,
      },
      {
        name: "lint",
        status: "completed",
        conclusion: "failure",
        url: null,
        startedAt: "2026-05-18T12:00:00Z",
        completedAt: "2026-05-18T12:00:20Z",
      },
    ];
    const completedChecks = [
      { ...initialData.checks[0] },
      {
        ...initialData.checks[1],
        status: "completed" as const,
        conclusion: "success" as const,
        completedAt: "2026-05-18T12:04:20Z",
      },
      {
        ...initialData.checks[2],
        conclusion: "success" as const,
      },
    ];
    const refreshedData = createOverviewFixture();
    refreshedData.checks = completedChecks;
    refreshedData.reviewThreads = refreshedData.reviewThreads.map((thread) => ({
      ...thread,
      state: "resolved",
      updatedAt: "2026-05-18T12:06:00Z",
    }));
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockResolvedValue({
        repositories: [narviewRepository],
        pullRequests: [readyPullRequest],
        status: {
          state: "fresh",
          message: "Fetched 1 open pull request.",
          rateLimitResetEpochSeconds: null,
          refreshedAtEpochSeconds: 1_800_000_000,
        },
      }),
      fetchPullRequestData: vi.fn().mockResolvedValueOnce(initialData).mockResolvedValueOnce(refreshedData),
      fetchPullRequestChecks: vi.fn().mockResolvedValue({
        checks: completedChecks,
        rateLimit: {
          remaining: 4_989,
          resetEpochSeconds: 1_800_003_600,
        },
        fetchedAtEpochMs: 1_800_000_500_000,
      }),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(1));

    const liveChecks = screen.getByLabelText("Live checks");
    expect(liveChecks).toHaveTextContent("Live Checks");
    expect(liveChecks).toHaveTextContent("1 failing");
    expect(liveChecks).toHaveTextContent("preview");
    expect(liveChecks).toHaveTextContent("Running");

    await user.click(within(liveChecks).getByRole("button", { name: /refresh live checks/i }));

    await waitFor(() => expect(workspaceClient.fetchPullRequestChecks).toHaveBeenCalledWith(readyPullRequest));
    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(liveChecks).toHaveTextContent("3/3 passing"));
    expect(within(screen.getByLabelText("Inspector")).getByText("Resolved")).toBeInTheDocument();
  });

  it("switches between Pull Requests without clone assumptions", async () => {
    const user = userEvent.setup();
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockResolvedValue({
        repositories: [narviewRepository],
        pullRequests: [readyPullRequest, draftPullRequest],
        status: {
          state: "fresh",
          message: "Fetched 2 open pull requests.",
          rateLimitResetEpochSeconds: null,
          refreshedAtEpochSeconds: 1_800_000_000,
        },
      }),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    const dialog = await openPullRequestsDialog(user);
    const results = within(dialog).getByLabelText("Open Pull Request results");
    expect(results.parentElement).toHaveClass("pane-scroll-y");
    expect(await within(dialog).findByRole("button", { name: /draft billing sync/i })).toHaveTextContent("2");

    await user.keyboard("2");

    expect(screen.getAllByText("Resplendent-Data/Narview #13").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: /draft billing sync/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("background refreshes Pull Request data when switching to cached PRs", async () => {
    const user = userEvent.setup();
    const cachedReady = createOverviewFixture();
    const cachedDraft = createOverviewFixture();
    cachedDraft.pullRequest = draftPullRequest;
    cachedDraft.metadata = {
      ...cachedDraft.metadata,
      title: draftPullRequest.title,
      repository: draftPullRequest.repository,
      number: draftPullRequest.number,
      authorLogin: draftPullRequest.authorLogin,
      url: draftPullRequest.url,
      isDraft: draftPullRequest.isDraft,
      updatedAt: draftPullRequest.updatedAt,
    };
    writeCachedPullRequestData(cachedReady);
    writeCachedPullRequestData(cachedDraft);

    const fetchPullRequestData = vi.fn().mockImplementation(async (pullRequest: PullRequestSummary) => {
      const data = createOverviewFixture();
      data.pullRequest = pullRequest;
      data.metadata = {
        ...data.metadata,
        title: `${pullRequest.title} refreshed`,
        repository: pullRequest.repository,
        number: pullRequest.number,
        authorLogin: pullRequest.authorLogin,
        url: pullRequest.url,
        isDraft: pullRequest.isDraft,
        updatedAt: pullRequest.updatedAt,
      };
      return data;
    });
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockResolvedValue({
        repositories: [narviewRepository],
        pullRequests: [readyPullRequest, draftPullRequest],
        status: {
          state: "fresh",
          message: "Fetched 2 open pull requests.",
          rateLimitResetEpochSeconds: null,
          refreshedAtEpochSeconds: 1_800_000_000,
        },
      }),
      fetchPullRequestData,
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    await waitFor(() => expect(fetchPullRequestData).toHaveBeenCalledWith(readyPullRequest));

    const dialog = await openPullRequestsDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: /draft billing sync/i }));

    await waitFor(() => expect(fetchPullRequestData).toHaveBeenCalledWith(draftPullRequest));
  });

  it("surfaces rate-limit refresh status", async () => {
    const workspaceClient = createWorkspaceClient({
      listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
      refreshPullRequests: vi.fn().mockResolvedValue({
        repositories: [narviewRepository],
        pullRequests: [],
        status: {
          state: "rate-limited",
          message: "GitHub rate limit reached. Refresh later.",
          rateLimitResetEpochSeconds: 1_800_000_500,
          refreshedAtEpochSeconds: null,
        },
      }),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={workspaceClient}
      />,
    );

    const dialog = await openPullRequestsDialog(userEvent.setup());

    expect((await within(dialog).findAllByText("Rate limited")).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/GitHub rate limit reached/)).toBeInTheDocument();
  });

  it("parses github.com Pull Request URLs", () => {
    expect(parsePullRequestUrl("github.com/Resplendent-Data/Narview/pull/91").repository).toBe("Resplendent-Data/Narview");
    expect(() => parsePullRequestUrl("https://gitlab.com/acme/api/pull/91")).toThrow("github.com");
  });

  it("quick-opens a Pull Request URL without saving a repository", async () => {
    const user = userEvent.setup();

    render(
      <App
        authClient={createAuthClient()}
        workspaceClient={createWorkspaceClient()}
        reviewSessionClient={createReviewSessionClient()}
      />,
    );

    const dialog = await openPullRequestsDialog(user);
    await user.type(within(dialog).getByLabelText("Pull Request URL"), "https://github.com/Resplendent-Data/Narview/pull/91");
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));

    expect((await screen.findAllByText("Resplendent-Data/Narview #91")).length).toBeGreaterThan(0);
    await openPullRequestsDialog(user);
    expect(screen.getByText("No saved repositories.")).toBeInTheDocument();
  });

  it("shows invalid Pull Request URL errors", async () => {
    const user = userEvent.setup();

    render(<App authClient={createAuthClient()} workspaceClient={createWorkspaceClient()} reviewSessionClient={createReviewSessionClient()} />);

    const dialog = await openPullRequestsDialog(user);
    await user.type(within(dialog).getByLabelText("Pull Request URL"), "https://example.com/acme/api/pull/4");
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));

    expect(await screen.findByText("Narview v1 supports github.com Pull Request URLs.")).toBeInTheDocument();
  });

  it("restores Review Session context for a Pull Request without progress flags", async () => {
    const user = userEvent.setup();
    const reviewSessionClient = createReviewSessionClient({
      loadSession: vi.fn().mockResolvedValue({
        pullRequest: readyPullRequest,
        snapshot: restoredSnapshot,
      }),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={createWorkspaceClient()}
        reviewSessionClient={reviewSessionClient}
      />,
    );

    const dialog = await openPullRequestsDialog(user);
    await user.type(within(dialog).getByLabelText("Pull Request URL"), readyPullRequest.url);
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));

    await user.click(await screen.findByRole("button", { name: /exit focus/i }));
    const reopenedDialog = await openPullRequestsDialog(user);
    expect(within(reopenedDialog).getByLabelText("Include draft Pull Requests")).toBeChecked();
    await waitFor(() => expect(reviewSessionClient.saveSession).toHaveBeenCalled());
    const savedSnapshot = vi.mocked(reviewSessionClient.saveSession).mock.calls.at(-1)?.[2];
    expect(JSON.stringify(savedSnapshot)).not.toMatch(/reviewed|viewed/i);
  });

  it("restores the last active Pull Request after app restart", async () => {
    const reviewSessionClient = createReviewSessionClient({
      loadLastSession: vi.fn().mockResolvedValue({
        pullRequest: readyPullRequest,
        snapshot: restoredSnapshot,
      }),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={createWorkspaceClient()}
        reviewSessionClient={reviewSessionClient}
      />,
    );

    expect(await screen.findByRole("button", { name: /exit focus/i })).toBeInTheDocument();
    expect(screen.getAllByText("Resplendent-Data/Narview #12").length).toBeGreaterThan(0);
  });

  it("plans incremental fetches before diff content", () => {
    expect(buildIncrementalFetchPlan("manual")).toEqual(["metadata", "review-threads", "file-summaries", "checks"]);
    expect(buildIncrementalFetchPlan("manual")).not.toContain("diff-content");
    expect(buildIncrementalFetchPlan("background")).toEqual(["metadata", "checks"]);
  });

  it("keeps cached Pull Request data readable offline", () => {
    upsertCachedPullRequest(readyPullRequest);

    const stored = readCacheStore().entries["Resplendent-Data/Narview#12"];

    expect(stored.metadata.title).toBe("Add checkout guard");
    expect(stored.reviewThreads).toEqual([]);
    expect(stored.fileSummaries).toEqual([]);
    expect(stored.checks).toEqual([]);
  });

  it("evicts by recency while protecting pinned Pull Requests", () => {
    const pinned = createCachedPullRequest(readyPullRequest, 10);
    const old = createCachedPullRequest({ ...readyPullRequest, number: 14, title: "Old" }, 20);
    const fresh = createCachedPullRequest({ ...readyPullRequest, number: 15, title: "Fresh" }, 30);
    pinned.pinned = true;
    pinned.lastAccessedEpochMs = 10;
    old.lastAccessedEpochMs = 20;
    fresh.lastAccessedEpochMs = 30;

    const evicted = evictCache(
      {
        version: 1,
        entries: {
          "Resplendent-Data/Narview#12": pinned,
          "Resplendent-Data/Narview#14": old,
          "Resplendent-Data/Narview#15": fresh,
        },
      },
      { maxEntries: 2, maxBytes: Number.MAX_SAFE_INTEGER },
    );

    expect(evicted.entries["Resplendent-Data/Narview#12"]).toBeDefined();
    expect(evicted.entries["Resplendent-Data/Narview#14"]).toBeUndefined();
    expect(evicted.entries["Resplendent-Data/Narview#15"]).toBeDefined();
  });

  it("pins and clears fetched cache without deleting local review memory", () => {
    window.localStorage.setItem(reviewSessionStorageKey, JSON.stringify({ sessions: { saved: true }, lastByUser: {} }));
    syncReviewThreads("octocat", "Resplendent-Data/Narview#12", createOverviewFixture().reviewThreads);
    setReviewThreadReviewed("octocat", "thread-1", true, 1_800_000_000_000);
    syncFileChanges("octocat", "Resplendent-Data/Narview#12", createOverviewFixture().fileSummaries);
    setFileChangeViewed("octocat", "Resplendent-Data/Narview#12:src/auth/session.ts", true, 1_800_000_000_000);
    upsertCachedPullRequest(readyPullRequest);
    setCachedPullRequestPinned("Resplendent-Data/Narview#12", true);

    expect(cacheStats().pinned).toBe(1);

    clearFetchedGithubData();

    expect(window.localStorage.getItem(prCacheStorageKey)).toContain('"entries":{}');
    expect(window.localStorage.getItem(reviewSessionStorageKey)).toContain("saved");
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');
    expect(window.localStorage.getItem(fileChangeStorageKey)).toContain('"viewed":true');
  });

  it("resets local review history only after explicit confirmation", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(reviewSessionStorageKey, JSON.stringify({ sessions: { saved: true }, lastByUser: { "local-user": "saved" } }));
    render(<App reviewSessionClient={createReviewSessionClient()} />);

    await user.click(within(screen.getByLabelText("Inspector")).getByRole("button", { name: /^mark reviewed/i }));
    await user.click(within(screen.getByLabelText("Diff viewer")).getByRole("button", { name: /mark src\/auth\/session\.ts viewed/i }));

    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');
    expect(window.localStorage.getItem(fileChangeStorageKey)).toContain('"viewed":true');
    expect(window.localStorage.getItem(reviewSessionStorageKey)).toContain("saved");

    const settings = await openSettingsDialog(user);
    const privacy = within(settings).getByLabelText("Privacy and diagnostics");
    await user.click(within(privacy).getByRole("button", { name: /reset local review history/i }));
    expect(screen.getByRole("dialog", { name: /reset local review history/i })).toHaveTextContent("Reset local review history");

    await user.click(screen.getByRole("button", { name: /^reset$/i }));

    const reviewStore = JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}");
    const fileStore = JSON.parse(window.localStorage.getItem(fileChangeStorageKey) ?? "{}");
    expect(Object.values(reviewStore.users["local-user"]).every((state) => !(state as { reviewed: boolean }).reviewed)).toBe(true);
    expect(Object.values(fileStore.users["local-user"]).every((state) => !(state as { viewed: boolean }).viewed)).toBe(true);
    expect(window.localStorage.getItem(reviewSessionStorageKey)).toContain('"sessions":{}');
    expect(within(privacy).getByText("Local review history reset.")).toBeInTheDocument();
  });

  it("previews and copies redacted diagnostics on explicit user action", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    const settings = await openSettingsDialog(user);
    const privacy = within(settings).getByLabelText("Privacy and diagnostics");
    expect(within(privacy).getByText("Telemetry off")).toBeInTheDocument();
    expect(within(privacy).getByRole("button", { name: /copy export/i })).toBeDisabled();

    await user.click(within(privacy).getByRole("button", { name: /preview diagnostics/i }));

    const preview = within(privacy).getByLabelText("Diagnostics preview");
    expect(preview).toHaveTextContent('"telemetry"');
    expect(preview).toHaveTextContent('"oauthTokens": "redacted"');
    expect(preview).not.toHaveTextContent("The rotated token path");

    await user.click(within(privacy).getByRole("button", { name: /copy export/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('"requestDetails": "redacted"');
    expect(writeText.mock.calls[0][0]).not.toContain("The rotated token path");
  });

  it("redacts operational logs and exposes no telemetry emission paths", () => {
    const redacted = redactOperationalLog({
      message: "safe summary",
      token: "gho_secretabcdefghijklmnopqrstuvwxyz",
      diffHunk: "@@ -1,1 +1,1 @@\n-  const oldValue = token;\n+  const newValue = token;",
      reviewThreadBody: "Raw review feedback should not leave diagnostics.",
      nested: {
        requestHeaders: {
          authorization: "Bearer secret",
        },
        safeCount: 4,
      },
    }) as unknown as {
      message: string;
      token: string;
      diffHunk: string;
      reviewThreadBody: string;
      nested: { requestHeaders: string; safeCount: number };
    };
    const preview = buildDiagnosticsPreview({
      cache: { entries: 1, pinned: 0, bytes: 128 },
      reviewQueue: summarizeReviewQueueStore({ version: 1, users: {} }),
      fileChanges: summarizeFileChangeStore({ version: 1, users: {} }),
      reviewSessions: summarizeReviewSessionStore({ sessions: {}, lastByUser: {} }),
      generatedAt: "2026-05-18T00:00:00.000Z",
    });
    const exportText = renderDiagnosticsExport(preview);

    expect(redacted.message).toBe("safe summary");
    expect(redacted.token).toBe("[redacted]");
    expect(redacted.diffHunk).toBe("[redacted]");
    expect(redacted.reviewThreadBody).toBe("[redacted]");
    expect(redacted.nested.requestHeaders).toBe("[redacted]");
    expect(redacted.nested.safeCount).toBe(4);
    expect(exportText).toContain('"rawCode": "redacted"');
    expect(hasTelemetryEmissionPaths()).toBe(false);
    expect(telemetryPolicy.analyticsSinks).toEqual([]);
  });

  it("checks for desktop updates from the updater panel", async () => {
    const user = userEvent.setup();
    const updaterClient = createUpdaterClient();
    render(<App updaterClient={updaterClient} />);

    const settings = await openSettingsDialog(user);
    const updates = within(settings).getByLabelText("App updates");
    expect(within(updates).getByText("Ready")).toBeInTheDocument();
    expect(within(updates).getByText("Never")).toBeInTheDocument();

    await user.click(within(updates).getByRole("button", { name: /check updates/i }));

    await waitFor(() => expect(updaterClient.checkForUpdate).toHaveBeenCalledTimes(1));
    expect(within(updates).getByText("You're up to date")).toBeInTheDocument();
    expect(window.localStorage.getItem(lastUpdateCheckStorageKey)).toMatch(/^\d+$/);

    vi.mocked(openUrl).mockClear();
    await user.click(within(updates).getByRole("button", { name: /open releases/i }));
    expect(openUrl).toHaveBeenCalledWith(appReleaseDownloadUrl);
  });

  it("explains when desktop updater metadata has not been published", async () => {
    const user = userEvent.setup();
    const updaterClient = createUpdaterClient({
      checkForUpdate: vi.fn().mockRejectedValue(new Error("404 not found")),
    });
    render(<App updaterClient={updaterClient} />);

    const settings = await openSettingsDialog(user);
    const updates = within(settings).getByLabelText("App updates");
    await user.click(within(updates).getByRole("button", { name: /check updates/i }));

    await waitFor(() => expect(updaterClient.checkForUpdate).toHaveBeenCalledTimes(1));
    expect(within(updates).getByText("Signed update metadata unavailable")).toBeInTheDocument();
    expect(within(updates).getByText(/Install the latest Narview release manually/i)).toBeInTheDocument();
  });

  it("does not queue GitHub writes while offline", () => {
    expect(networkRequiredFailure("Resolve thread")).toMatchObject({
      ok: false,
      queued: false,
      message: "Resolve thread requires a live GitHub connection.",
    });
  });

  it("shows the Review Overview metadata and high-level counts", () => {
    render(<App />);

    const overview = screen.getByLabelText("Review overview");

    expect(overview).toHaveTextContent("acme/payments-web #482 by @coderabbitai");
    expect(overview).toHaveTextContent("Remote-first PR review workspace shell");
    expect(overview).toHaveTextContent("feature/review-workspace -> main");
    expect(overview).toHaveTextContent("Files");
    expect(overview).toHaveTextContent("Checks");
  });

  it("ranks hotspots with deterministic explainable signals", () => {
    const hotspots = scoreHotspots(createOverviewFixture().fileSummaries, createOverviewFixture().reviewThreads);

    expect(hotspots[0].path).toBe("src/auth/session.ts");
    expect(hotspots[0].reasons).toEqual(expect.arrayContaining(["215 changed lines", "1 unresolved thread"]));
    expect(hotspots[0].reasons).not.toContain("critical path");
    expect(hotspots[0].score).toBeGreaterThan(hotspots[1].score);
  });

  it("applies repository hotspot overrides when provided", () => {
    const hotspots = scoreHotspots(
      [
        { path: "docs/large-guide.md", additions: 300, deletions: 0, status: "modified" },
        { path: "infra/provider.ts", additions: 5, deletions: 0, status: "modified" },
      ],
      [],
      {
        weights: {
          changedLines: 0,
          fileStatus: 0,
          configuredPath: 1,
        },
        configuredPathPatterns: ["infra"],
      },
    );

    expect(hotspots[0].path).toBe("infra/provider.ts");
    expect(hotspots[0].reasons).toContain("configured path pattern");
  });

  it("does not use domain keywords as default hotspot inputs", () => {
    const hotspots = scoreHotspots(
      [
        { path: "src/auth/login.ts", additions: 1, deletions: 0, status: "modified" },
        { path: "src/plain/large.ts", additions: 80, deletions: 0, status: "modified" },
      ],
      [],
    );

    expect(hotspots[0].path).toBe("src/plain/large.ts");
    expect(hotspots.find((hotspot) => hotspot.path === "src/auth/login.ts")?.reasons).not.toContain("critical path");
  });

  it("ranks structural hotspots from graph, control-flow, tests, checks, and change size", () => {
    const files: CachedPullRequestData["fileSummaries"] = [
      {
        path: "src/review/orchestrator.ts",
        additions: 2,
        deletions: 1,
        status: "modified",
        patch:
          "@@ -1,7 +1,8 @@\n export function orchestrateReview() {\n-  if (oldFlag()) return buildPlan();\n+  if (newFlag()) return buildPlan();\n+  return auditPlan();\n }\n function buildPlan() { return 'plan'; }\n function auditPlan() { return buildPlan(); }",
      },
      {
        path: "src/review/orchestrator.test.ts",
        additions: 1,
        deletions: 0,
        status: "modified",
        patch: "@@ -1,2 +1,3 @@\n import { orchestrateReview } from './orchestrator';\n+orchestrateReview();",
      },
      { path: "src/plain/large.ts", additions: 90, deletions: 0, status: "modified" },
    ];
    const analysisIndex = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files,
      analysisInput: readyAnalysisInput,
      fileContents: [
        {
          path: "src/review/orchestrator.ts",
          state: "loaded",
          content:
            "export function orchestrateReview() {\n  if (newFlag()) return buildPlan();\n  return auditPlan();\n}\nfunction buildPlan() { return 'plan'; }\nfunction auditPlan() { return buildPlan(); }\nfunction newFlag() { return true; }\n",
          message: null,
        },
        {
          path: "src/review/orchestrator.test.ts",
          state: "loaded",
          content: "import { orchestrateReview } from './orchestrator';\norchestrateReview();\n",
          message: null,
        },
      ],
    });
    const hotspots = scoreHotspots(files, [], {}, analysisIndex, [
      { name: "src/review/orchestrator.ts tests", status: "completed", conclusion: "failure", url: null },
    ]);

    expect(hotspots[0].path).toBe("src/review/orchestrator.ts");
    expect(hotspots[0].reasons).toEqual(
      expect.arrayContaining([
        "1 changed symbol node",
        expect.stringMatching(/graph edge/),
        "3 control-flow changes",
        "1 related test change",
        "1 failing check",
      ]),
    );
  });

  it("collapses generated hotspots while preserving expansion paths", () => {
    const hotspots = scoreHotspots(
      [
        { path: "src/generated/client.ts", additions: 500, deletions: 0, status: "modified" },
        { path: "dist/bundle.min.js", additions: 300, deletions: 40, status: "modified" },
        { path: "vendor/sdk.ts", additions: 120, deletions: 0, status: "modified" },
        { path: "src/review/logic.ts", additions: 30, deletions: 0, status: "modified" },
      ],
      [
        {
          id: "logic-thread",
          authorLogin: "monalisa",
          filePath: "src/review/logic.ts",
          line: 3,
          state: "unresolved",
          body: "Please verify this branch.",
          updatedAt: "2026-05-18T12:00:00Z",
        },
      ],
    );
    const cluster = hotspots.find((hotspot) => hotspot.kind === "generated-cluster");

    expect(cluster).toMatchObject({
      path: "Generated Cluster",
      collapsed: true,
      fileCount: 3,
      changedLines: 960,
      paths: ["dist/bundle.min.js", "src/generated/client.ts", "vendor/sdk.ts"],
    });
    expect(cluster?.score).toBeLessThan(hotspots.find((hotspot) => hotspot.path === "src/review/logic.ts")?.score ?? 0);
    expect(cluster?.reasons).toEqual(expect.arrayContaining(["3 generated/vendor/build files", "960 changed lines collapsed"]));
  });

  it("keeps generated files with review threads visible in the Attention Map while clustering lower-signal generated files", () => {
    const currentData: CachedPullRequestData = {
      ...createOverviewFixture(),
      fileSummaries: [
        { path: "src/generated/client.ts", additions: 50, deletions: 0, status: "modified" },
        { path: "dist/bundle.min.js", additions: 60, deletions: 0, status: "modified" },
        { path: "src/generated/threaded.ts", additions: 10, deletions: 0, status: "modified" },
      ],
      reviewThreads: [
        {
          id: "thread-generated",
          authorLogin: "monalisa",
          filePath: "src/generated/threaded.ts",
          line: 1,
          state: "unresolved",
          body: "This generated output has a real reviewer note.",
          updatedAt: "2026-05-18T12:00:00Z",
        },
      ],
    };
    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files: currentData.fileSummaries,
      analysisInput: readyAnalysisInput,
    });
    const presentation = buildAttentionMapPresentation(index, currentData);

    expect(presentation.summary.generatedClusters).toBe(1);
    expect(presentation.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "generated-cluster",
          collapsed: true,
          fileCount: 2,
          paths: ["dist/bundle.min.js", "src/generated/client.ts"],
        }),
        expect.objectContaining({
          filePath: "src/generated/threaded.ts",
        }),
      ]),
    );
    expect(presentation.nodes.some((node) => node.filePath === "src/generated/client.ts")).toBe(false);
  });

  it("builds Review Targets from mixed symbol and hunk Attention Nodes with test relationships", () => {
    const files: CachedPullRequestData["fileSummaries"] = [
      {
        path: "src/session.ts",
        additions: 2,
        deletions: 1,
        status: "modified",
        patch:
          "@@ -1,5 +1,6 @@\n export function rotateSession() {\n-  return oldToken();\n+  return refreshToken();\n }\n function refreshToken() { return 'next'; }",
      },
      {
        path: "src/session.test.ts",
        additions: 1,
        deletions: 0,
        status: "modified",
        patch: "@@ -1,2 +1,3 @@\n import { rotateSession } from './session';\n+rotateSession();",
      },
    ];
    const currentData: CachedPullRequestData = {
      ...createOverviewFixture(),
      fileSummaries: files,
      reviewThreads: [
        {
          id: "session-thread",
          authorLogin: "monalisa",
          filePath: "src/session.ts",
          line: 2,
          state: "unresolved",
          body: "Please verify rotation and coverage together.",
          updatedAt: "2026-05-18T12:00:00Z",
        },
      ],
    };
    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files,
      analysisInput: readyAnalysisInput,
      fileContents: [
        {
          path: "src/session.ts",
          state: "loaded",
          content:
            "export function rotateSession() {\n  return refreshToken();\n}\nfunction refreshToken() { return 'next'; }\n",
          message: null,
        },
        {
          path: "src/session.test.ts",
          state: "loaded",
          content: "import { rotateSession } from './session';\nrotateSession();\n",
          message: null,
        },
      ],
    });
    const targets = buildReviewTargets({
      analysisIndex: index,
      attentionMap: buildAttentionMapPresentation(index, currentData),
      currentData,
    });
    const grouped = targets.find((target) => target.paths.includes("src/session.ts") && target.paths.includes("src/session.test.ts"));

    expect(grouped).toMatchObject({
      priority: "high",
      fallback: true,
      size: expect.objectContaining({
        files: 2,
        reviewThreads: 1,
      }),
    });
    expect(grouped?.reasoning).toEqual(expect.arrayContaining([expect.stringContaining("deterministic test naming")]));
  });

  it("groups same-symbol hunk splits and splits oversized weakly related groups", () => {
    const hunkOne = createSyntheticAttentionNode({
      id: "src/session.ts:hunk-1",
      kind: "hunk",
      reason: "diff-hunk",
      filePath: "src/session.ts",
      label: "@@ rotateSession",
      lineStart: 10,
      lineEnd: 14,
    });
    const hunkTwo = createSyntheticAttentionNode({
      id: "src/session.ts:hunk-2",
      kind: "hunk",
      reason: "diff-hunk",
      filePath: "src/session.ts",
      label: "@@ rotateSession",
      lineStart: 80,
      lineEnd: 84,
    });
    const distant = createSyntheticAttentionNode({
      id: "src/session.ts:hunk-3",
      kind: "hunk",
      reason: "diff-hunk",
      filePath: "src/session.ts",
      label: "@@ auditSession",
      lineStart: 400,
      lineEnd: 404,
    });
    const groupedIndex = createReviewTargetIndex([hunkTwo, distant, hunkOne]);
    const groupedTargets = buildReviewTargets({
      analysisIndex: groupedIndex,
      attentionMap: buildAttentionMapPresentation(groupedIndex, createOverviewFixture()),
      currentData: createOverviewFixture(),
    });

    expect(groupedTargets.some((target) => target.nodeIds.includes(hunkOne.id) && target.nodeIds.includes(hunkTwo.id))).toBe(true);
    expect(groupedTargets.find((target) => target.nodeIds.includes(distant.id))?.nodeIds).toEqual([distant.id]);

    const oversizedNodes = Array.from({ length: 5 }, (_, index) =>
      createSyntheticAttentionNode({
        id: `src/large.ts:symbol-${index}`,
        filePath: "src/large.ts",
        label: `change${index}`,
        lineStart: index + 1,
        lineEnd: index + 1,
      }),
    );
    const oversizedRelationships: AttentionRelationship[] = oversizedNodes.slice(1).map((node, index) => ({
      id: `same-file:${oversizedNodes[0].id}:${node.id}`,
      kind: "same-file",
      filePath: "src/large.ts",
      fromNodeId: oversizedNodes[0].id,
      toNodeId: node.id,
      fromSymbolName: "change0",
      toSymbolName: node.label,
      targetModule: null,
      targetFilePath: node.filePath,
      line: index + 1,
      reason: "Synthetic tight same-module relationship.",
    }));
    const oversizedIndex = createReviewTargetIndex(oversizedNodes, oversizedRelationships);
    const splitTargets = buildReviewTargets({
      analysisIndex: oversizedIndex,
      attentionMap: buildAttentionMapPresentation(oversizedIndex, createOverviewFixture()),
      currentData: createOverviewFixture(),
      maxNodesPerTarget: 4,
    });

    expect(splitTargets).toHaveLength(2);
    expect(splitTargets[0].reasoning).toEqual(expect.arrayContaining([expect.stringContaining("Split from an oversized")]));
    expect(splitTargets.every((target) => target.size.nodes <= 4)).toBe(true);
  });

  it("promotes justified generated clusters to stable low-priority Review Targets", () => {
    const currentData: CachedPullRequestData = {
      ...createOverviewFixture(),
      fileSummaries: [
        { path: "src/generated/client.ts", additions: 120, deletions: 0, status: "modified" },
        { path: "dist/bundle.min.js", additions: 80, deletions: 0, status: "modified" },
      ],
      reviewThreads: [],
    };
    const index = buildAnalysisIndex({
      pullRequest: readyPullRequest,
      files: currentData.fileSummaries,
      analysisInput: readyAnalysisInput,
    });
    const attentionMap = buildAttentionMapPresentation(index, currentData);
    const unjustifiedTargets = buildReviewTargets({
      analysisIndex: index,
      attentionMap,
      currentData,
      hotspots: [
        {
          kind: "generated-cluster",
          path: "Generated Cluster",
          score: 2,
          changedLines: 200,
          unresolvedThreads: 0,
          reasons: ["2 generated/vendor/build files", "200 changed lines collapsed"],
          collapsed: true,
          fileCount: 2,
          paths: ["dist/bundle.min.js", "src/generated/client.ts"],
        },
      ],
    });
    const justifiedTargets = buildReviewTargets({
      analysisIndex: index,
      attentionMap,
      currentData,
      hotspots: [
        {
          kind: "generated-cluster",
          path: "Generated Cluster",
          score: 20,
          changedLines: 200,
          unresolvedThreads: 1,
          reasons: ["2 generated/vendor/build files", "200 changed lines collapsed", "1 unresolved thread"],
          collapsed: true,
          fileCount: 2,
          paths: ["src/generated/client.ts", "dist/bundle.min.js"],
        },
      ],
    });

    expect(unjustifiedTargets.some((target) => target.kind === "generated-cluster")).toBe(false);
    expect(justifiedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "generated-cluster",
          priority: "low",
          paths: ["dist/bundle.min.js", "src/generated/client.ts"],
          size: expect.objectContaining({ files: 2, reviewThreads: 1 }),
        }),
      ]),
    );
  });

  it("keeps Review Target identities stable when source node order changes", () => {
    const firstNode = createSyntheticAttentionNode({
      id: "src/session.ts:symbol:rotateSession",
      filePath: "src/session.ts",
      label: "rotateSession",
      lineStart: 1,
    });
    const secondNode = createSyntheticAttentionNode({
      id: "src/session.ts:symbol:refreshToken",
      filePath: "src/session.ts",
      label: "refreshToken",
      lineStart: 8,
    });
    const relationship: AttentionRelationship = {
      id: `call:${firstNode.id}:${secondNode.id}`,
      kind: "same-file-call",
      filePath: "src/session.ts",
      fromNodeId: firstNode.id,
      toNodeId: secondNode.id,
      fromSymbolName: "rotateSession",
      toSymbolName: "refreshToken",
      targetModule: null,
      targetFilePath: null,
      line: 2,
      reason: "rotateSession calls refreshToken in the same file.",
    };
    const firstIndex = createReviewTargetIndex([firstNode, secondNode], [relationship]);
    const secondIndex = createReviewTargetIndex([secondNode, firstNode], [relationship]);
    const firstTargets = buildReviewTargets({
      analysisIndex: firstIndex,
      attentionMap: buildAttentionMapPresentation(firstIndex, createOverviewFixture()),
      currentData: createOverviewFixture(),
    });
    const secondTargets = buildReviewTargets({
      analysisIndex: secondIndex,
      attentionMap: buildAttentionMapPresentation(secondIndex, createOverviewFixture()),
      currentData: createOverviewFixture(),
    });

    expect(firstTargets[0].stableKey).toBe(secondTargets[0].stableKey);
    expect(firstTargets[0].id).toBe(secondTargets[0].id);
  });

  it("summarizes checks with names, timing, and detail links", () => {
    const summary = summarizeChecks([
      {
        name: "build",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/Resplendent-Data/Narview/actions/runs/1",
        startedAt: "2026-05-18T12:00:00Z",
        completedAt: "2026-05-18T12:02:05Z",
      },
      { name: "lint", status: "completed", conclusion: "failure", url: null },
      { name: "preview", status: "in-progress", conclusion: null, url: null, startedAt: "2026-05-18T12:03:00Z" },
    ]);

    expect(summary).toMatchObject({
      total: 3,
      passing: 1,
      failing: 1,
      pending: 1,
      failingNames: ["lint"],
      detailUrls: ["https://github.com/Resplendent-Data/Narview/actions/runs/1"],
    });
    expect(summary.details[0]).toMatchObject({ name: "build", timingLabel: "2m 5s" });
    expect(summary.details[2]).toMatchObject({ name: "preview", timingLabel: "Running" });
  });

  it("excludes skipped checks from failing checks count", () => {
    const summary = summarizeChecks([
      { name: "build", status: "completed", conclusion: "success", url: null },
      { name: "lint", status: "completed", conclusion: "skipped", url: null },
      { name: "test", status: "completed", conclusion: "failure", url: null },
    ]);

    expect(summary).toMatchObject({
      total: 3,
      passing: 1,
      failing: 1,
      failingNames: ["test"],
    });
  });

  it("deduplicates check runs by name, keeping only the latest run", () => {
    const summary = summarizeChecks([
      { name: "build", status: "completed", conclusion: "failure", url: null, startedAt: "2026-05-18T12:00:00Z" },
      { name: "build", status: "completed", conclusion: "success", url: null, startedAt: "2026-05-18T12:10:00Z" },
      { name: "lint", status: "completed", conclusion: "failure", url: null, startedAt: "2026-05-18T12:05:00Z" },
      { name: "lint", status: "completed", conclusion: "failure", url: null, startedAt: "2026-05-18T12:02:00Z" },
    ]);

    expect(summary).toMatchObject({
      total: 2,
      passing: 1,
      failing: 1,
      failingNames: ["lint"],
    });
  });

  it("surfaces merge readiness states from GitHub-visible blockers", () => {
    const blocked = createOverviewFixture();
    blocked.metadata.mergeable = "CONFLICTING";
    blocked.metadata.reviewDecision = "CHANGES_REQUESTED";
    blocked.checks = [{ name: "lint", status: "completed", conclusion: "failure", url: null }];

    expect(getMergeReadiness(blocked)).toMatchObject({
      state: "blocked",
      blockers: expect.arrayContaining([
        "Pull Request has merge conflicts.",
        "Changes requested by reviewers.",
        "1 failing check.",
        "1 unresolved review thread.",
      ]),
    });

    const ready = createOverviewFixture();
    ready.reviewThreads = [];

    expect(getMergeReadiness(ready)).toEqual({
      state: "ready",
      blockers: ["No visible blockers from cached GitHub data."],
    });
  });

  it("builds the overview without LLM behavior", () => {
    const overview = buildReviewOverview(createOverviewFixture(), {
      weights: {
        unresolvedThreads: 0.5,
      },
    });

    expect(overview.usesLlm).toBe(false);
    expect(overview.branch).toBe("feature/checkout-guard -> main");
    expect(JSON.stringify(overview)).not.toMatch(/gemini|openai/i);
  });

  it("stores reviewed state per user and GitHub review thread ID with recovery context", () => {
    const threads = createQueueThreads();
    syncReviewThreads("octocat", "Resplendent-Data/Narview#12", threads);
    setReviewThreadReviewed("octocat", "thread-coderabbit", true, 1_800_000_000_000);

    const store = JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}");
    const storedThread = store.users.octocat["thread-coderabbit"];

    expect(storedThread.reviewed).toBe(true);
    expect(storedThread.recoveryContext).toMatchObject({
      pullRequestKey: "Resplendent-Data/Narview#12",
      filePath: "src/auth/session.ts",
      line: 24,
      authorLogin: "coderabbitai",
    });

    const octocatViews = buildReviewThreadViews("octocat", "Resplendent-Data/Narview#12", threads);
    const monalisaViews = buildReviewThreadViews("monalisa", "Resplendent-Data/Narview#12", threads);

    expect(octocatViews.find((view) => view.id === "thread-coderabbit")?.reviewed).toBe(true);
    expect(monalisaViews.find((view) => view.id === "thread-coderabbit")?.reviewed).toBe(false);
  });

  it("filters Review Queues across source, reviewed state, and thread state", () => {
    const threads = createQueueThreads();
    syncReviewThreads("octocat", "Resplendent-Data/Narview#12", threads);
    setReviewThreadReviewed("octocat", "thread-human", true, 1_800_000_000_000);
    const views = buildReviewThreadViews("octocat", "Resplendent-Data/Narview#12", threads);

    expect(filterReviewThreads(views, { origin: "coderabbit", reviewed: "unreviewed", state: "unresolved" }).map((view) => view.id)).toEqual([
      "thread-coderabbit",
    ]);
    expect(filterReviewThreads(views, { origin: "human", reviewed: "reviewed", state: "resolved" }).map((view) => view.id)).toEqual([
      "thread-human",
    ]);
    expect(filterReviewThreads(views, { origin: "human", reviewed: "unreviewed", state: "outdated" }).map((view) => view.id)).toEqual([
      "thread-outdated",
    ]);
    expect(filterReviewThreads(views, { origin: "all", reviewed: "all", state: "current" }).map((view) => view.id)).not.toContain(
      "thread-outdated",
    );
  });

  it("stores viewed state per user and File Change identity with recovery context", () => {
    const files = createFileSummaries();
    syncFileChanges("octocat", "Resplendent-Data/Narview#12", files);
    const views = buildFileChangeViews("octocat", "Resplendent-Data/Narview#12", files);
    setFileChangeViewed("octocat", views[0].id, true, 1_800_000_000_000);

    const store = JSON.parse(window.localStorage.getItem(fileChangeStorageKey) ?? "{}");
    const storedFile = store.users.octocat[views[0].id];

    expect(storedFile.viewed).toBe(true);
    expect(storedFile.recoveryContext).toMatchObject({
      pullRequestKey: "Resplendent-Data/Narview#12",
      path: "src/auth/session.ts",
      status: "modified",
      additions: 160,
      deletions: 55,
      kind: "text",
    });
    expect(buildFileChangeViews("monalisa", "Resplendent-Data/Narview#12", files)[0].viewed).toBe(false);
  });

  it("filters File Changes by viewed state and binary or non-text awareness", () => {
    const files = createFileSummaries();
    syncFileChanges("octocat", "Resplendent-Data/Narview#12", files);
    const initialViews = buildFileChangeViews("octocat", "Resplendent-Data/Narview#12", files);
    setFileChangeViewed("octocat", initialViews[0].id, true, 1_800_000_000_000);
    const views = buildFileChangeViews("octocat", "Resplendent-Data/Narview#12", files);
    const selectPaths = (filters: FileChangeFilters) => filterFileChanges(views, filters).map((view) => view.file.path);

    expect(selectPaths({ viewed: "viewed", kind: "all" })).toEqual(["src/auth/session.ts"]);
    expect(selectPaths({ viewed: "unviewed", kind: "all" })).toEqual(["assets/review-map.png", "notebooks/review-findings.ipynb"]);
    expect(selectPaths({ viewed: "all", kind: "image" })).toEqual(["assets/review-map.png"]);
    expect(selectPaths({ viewed: "all", kind: "non-text" })).toEqual(["notebooks/review-findings.ipynb"]);
  });

  it("marks File Changes viewed locally without marking Review Threads reviewed", async () => {
    const user = userEvent.setup();
    render(<App />);
    const fileExplorer = screen.getByLabelText("File explorer");
    const diffViewer = screen.getByLabelText("Diff viewer");

    expect(within(fileExplorer).getByText("review-map.png")).toBeInTheDocument();
    expect(within(fileExplorer).getByText("review-findings.ipynb")).toBeInTheDocument();

    await user.click(within(diffViewer).getByRole("button", { name: /mark src\/auth\/session\.ts viewed/i }));

    expect(window.localStorage.getItem(fileChangeStorageKey)).toContain('"viewed":true');
    expect(JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}").users["local-user"]["thread-1"].reviewed).toBe(false);

    await user.selectOptions(within(fileExplorer).getByLabelText("File viewed"), "viewed");
    expect(within(fileExplorer).getByText("session.ts")).toBeInTheDocument();
    expect(within(fileExplorer).queryByText("review-map.png")).not.toBeInTheDocument();
  });

  it("persists the diff mode preference across app mounts", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole("button", { name: /side-by-side/i }));

    expect(window.localStorage.getItem(diffViewerStorageKey)).toContain("side-by-side");

    unmount();
    render(<App />);

    expect(screen.getByRole("button", { name: /side-by-side/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("loads every cached hunk before the whole file is opened", () => {
    const [file] = createFileSummaries();
    const state = buildLazyDiffState(file, {
      mode: "unified",
      repository: "Resplendent-Data/Narview",
      pullRequestNumber: 12,
      loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
    });

    expect(state.hunks).toHaveLength(2);
    expect(state.hunks.every((hunk) => hunk.loaded)).toBe(true);
    expect(state.fullFileLines).toBeNull();
  });

  it("keeps syntax metadata on deep rows in long cached hunks", () => {
    const patchLines = [
      "@@ -104,0 +128,45 @@ async def _load_run_user_message(",
      ...Array.from({ length: 45 }, (_, index) =>
        index === 35 ? "+        return str(finish_reason)" : `+        value_${index} = ${index}`,
      ),
    ];
    const state = buildLazyDiffState(
      {
        path: "apps/backend/src/ai_worker.py",
        additions: 45,
        deletions: 0,
        status: "modified",
        patch: patchLines.join("\n"),
      },
      {
        mode: "unified",
        repository: "Resplendent-Data/front-end",
        pullRequestNumber: 2074,
      },
    );
    const deepLine = state.hunks[0].lines.find((line) => line.content.includes("finish_reason"));

    expect(deepLine).toMatchObject({
      highlighted: true,
      language: "python",
    });
    expect(state.hunks[0].lines.at(-1)?.highlighted).toBe(true);
  });

  it("bounds syntax highlighting to visible and near-visible diff lines across languages", () => {
    const lines: DiffLine[] = Array.from({ length: 12 }, (_, index) => ({
      oldLine: index + 1,
      newLine: index + 1,
      kind: "context",
      content: `line ${index + 1}`,
      highlighted: false,
      language: "text",
    }));

    const highlighted = highlightDiffLines(lines, "src/App.tsx", { visibleStart: 4, visibleEnd: 5, overscan: 1 });

    expect(highlighted[2].highlighted).toBe(false);
    expect(highlighted[3].highlighted).toBe(true);
    expect(highlighted[6].highlighted).toBe(true);
    expect(highlighted[7].highlighted).toBe(false);
    expect(highlighted[4].language).toBe("typescript");
    expect(getLanguageForPath("tools/analyze.py")).toBe("python");
    expect(getLanguageForPath("src-tauri/src/lib.rs")).toBe("rust");
    expect(getLanguageForPath("lib/main.dart")).toBe("dart");
  });

  it("preserves indentation and renders syntax tokens inside diff code lines", () => {
    render(<App />);

    const diffViewer = screen.getByLabelText("Diff viewer");
    const codeLines = Array.from(diffViewer.querySelectorAll<HTMLElement>(".diff-code-line"));
    const indentedLine = codeLines.find((line) => line.textContent?.startsWith("  const value"));
    const row = indentedLine?.closest(".diff-row");

    expect(diffViewer).toHaveClass("diff-shell");
    expect(diffViewer.querySelector(".diff-file-header")).toBeInTheDocument();
    expect(diffViewer.querySelector(".diff-hunk-header")).toBeInTheDocument();
    expect(diffViewer.querySelector(".diff-gutter")).toBeInTheDocument();
    expect(diffViewer.querySelector(".diff-marker")).toBeInTheDocument();
    expect(indentedLine).toBeDefined();
    expect(indentedLine?.textContent?.startsWith("  ")).toBe(true);
    expect(indentedLine?.querySelector(".diff-token-keyword")).toHaveTextContent("const");
    expect(row).toHaveClass("grid-cols-[52px_52px_24px_max-content]");
  });

  it("creates synthetic large Pull Request fixtures with files, threads, generated files, and huge totals", () => {
    const fixture = createSyntheticLargePullRequestFixture({
      fileCount: 1_000,
      threadCount: 600,
      hugeGeneratedLines: 1_000_000,
    });
    const changedLines = fixture.fileSummaries.reduce((total, file) => total + file.additions + file.deletions, 0);

    expect(fixture.fileSummaries).toHaveLength(1_000);
    expect(fixture.reviewThreads).toHaveLength(600);
    expect(fixture.fileSummaries.some((file) => file.path.includes("generated/huge-schema"))).toBe(true);
    expect(fixture.fileSummaries.some((file) => file.status === "binary")).toBe(true);
    expect(changedLines).toBeGreaterThan(1_000_000);
  });

  it("bounds list rendering windows for large queues and file lists", () => {
    const items = Array.from({ length: 10_000 }, (_, index) => index);
    const firstWindow = getBoundedRenderWindow(items, { limit: 80 });
    const middleWindow = getBoundedRenderWindow(items, { limit: 80, startIndex: 5_000 });

    expect(firstWindow.rendered).toBe(80);
    expect(firstWindow.omitted).toBe(9_920);
    expect(middleWindow.items[0]).toBe(5_000);
    expect(middleWindow.items.at(-1)).toBe(5_079);
  });

  it("keeps large Pull Request overview, queues, files, and lazy diff usable within performance thresholds", () => {
    const fixture = createSyntheticLargePullRequestFixture({
      fileCount: 1_200,
      threadCount: 650,
      hugeGeneratedLines: 250_000,
    });

    const report = measureLargePrUsability(fixture);

    expect(report.usableBeforeFullDiffContent).toBe(true);
    expect(report.renderedThreads).toBeLessThanOrEqual(80);
    expect(report.renderedFiles).toBeLessThanOrEqual(120);
    expect(report.renderedDiffLines).toBeLessThanOrEqual(16);
    expect(report.highlightedDiffLines).toBeLessThanOrEqual(report.renderedDiffLines);
    expect(report.totalMs).toBeLessThan(500);
    expect(report.queueMs).toBeLessThan(150);
  });

  it("renders bounded large Pull Request windows and rate-limit context in the app", async () => {
    const large = createSyntheticLargePullRequestFixture({
      fileCount: 240,
      threadCount: 140,
      hugeGeneratedLines: 20_000,
    });
    upsertCachedPullRequest(large.pullRequest, {
      reviewThreads: large.reviewThreads,
      fileSummaries: large.fileSummaries,
      checks: large.checks,
      rateLimit: large.rateLimit,
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        workspaceClient={createWorkspaceClient({
          listRepositories: vi.fn().mockResolvedValue({ repositories: [narviewRepository] }),
          refreshPullRequests: vi.fn().mockResolvedValue({
            repositories: [narviewRepository],
            pullRequests: [large.pullRequest],
            status: {
              state: "rate-limited",
              message: "GitHub rate limit reached; showing cached partial data.",
              rateLimitResetEpochSeconds: 1_800_001_200,
              refreshedAtEpochSeconds: 1_800_000_000,
            },
          }),
        })}
      />,
    );

    expect((await screen.findAllByText("acme/large-pr #9001")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Review queue summary")).toHaveTextContent("140 matching filters");
    expect(screen.getByLabelText("File explorer")).toHaveTextContent("0/240 viewed");
    const dialog = await openPullRequestsDialog(userEvent.setup());
    expect(within(dialog).getByText(/GitHub rate limit reached/)).toBeInTheDocument();
  });

  it("loads cached hunks, expands context, and fetches the whole file on demand", async () => {
    const user = userEvent.setup();
    render(<App />);
    const diffViewer = screen.getByLabelText("Diff viewer");

    expect(within(diffViewer).queryByText("Hunk not loaded yet.")).not.toBeInTheDocument();
    expect(within(diffViewer).queryByRole("button", { name: /load hunk/i })).not.toBeInTheDocument();
    expect(Array.from(diffViewer.querySelectorAll(".diff-code-line")).some((line) => line.textContent?.includes("logger.info"))).toBe(true);

    await user.click(within(diffViewer).getAllByRole("button", { name: /expand context/i })[0]);

    expect(await within(diffViewer).findByText(/context before src\/auth\/session\.ts/)).toBeInTheDocument();

    await user.click(within(diffViewer).getByRole("button", { name: /view whole file/i }));

    expect(await within(diffViewer).findByLabelText("Full file view")).toBeInTheDocument();
  });

  it("shows non-text diff fallback with a GitHub escape hatch", async () => {
    const user = userEvent.setup();
    render(<App />);

    const fileExplorer = screen.getByLabelText("File explorer");
    await user.click(within(fileExplorer).getByText("review-findings.ipynb").closest("button") as HTMLElement);

    const diffViewer = screen.getByLabelText("Diff viewer");
    expect(within(diffViewer).getByText("Non-text fallback")).toBeInTheDocument();
    expect(within(diffViewer).getByRole("link", { name: /open in github/i })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-web/pull/482/files",
    );
  });

  it("selects Review Queue items into matching thread detail and diff context", async () => {
    const user = userEvent.setup();
    render(<App />);
    const queueSummary = screen.getByLabelText("Review queue summary");

    expect(screen.queryByLabelText("Review thread queue")).not.toBeInTheDocument();
    await user.click(within(queueSummary).getByRole("button", { name: /browse threads/i }));
    const dialog = await screen.findByRole("dialog", { name: /review threads/i });
    await user.type(within(dialog).getByLabelText("Search review threads"), "queue");
    await user.click(within(dialog).getByRole("button", { name: /src\/review\/queue\.ts/i }));

    const diffViewer = screen.getByLabelText("Diff viewer");
    expect(within(diffViewer).getByText("src/review/queue.ts")).toBeInTheDocument();
    expect(screen.getByText("@monalisa")).toBeInTheDocument();
    expect(screen.getByText("Review Path 2 of 3")).toBeInTheDocument();
  });

  it("opens a searchable Review Threads dialog with the T shortcut", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard("t");

    const dialog = await screen.findByRole("dialog", { name: /review threads/i });
    expect(dialog).toHaveClass("z-50");
    expect(within(dialog).getByText(/acme\/payments-web #482 · 3 matching threads/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /src\/auth\/session\.ts/i })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Review thread search results")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Search review threads"), "queue");

    expect(within(dialog).queryByRole("button", { name: /src\/auth\/session\.ts/i })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /src\/review\/queue\.ts/i }));

    expect(screen.queryByRole("dialog", { name: /review threads/i })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Diff viewer")).getByText("src/review/queue.ts")).toBeInTheDocument();
  });

  it("presents outdated threads as older diff context in the guided flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard("t");
    const dialog = await screen.findByRole("dialog", { name: /review threads/i });
    await user.type(within(dialog).getByLabelText("Search review threads"), "github.rs");
    await user.click(within(dialog).getByRole("button", { name: /src-tauri\/src\/github\.rs/i }));

    expect(screen.getAllByText("Outdated").length).toBeGreaterThan(0);
    expect(screen.getByText("Older diff context from a previous hunk.")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Diff viewer")).getByText("src-tauri/src/github.rs")).toBeInTheDocument();
  });

  it("runs the keyboard review loop with visible shortcut cues", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    render(<App threadActionClient={threadActionClient} />);

    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getAllByText("Threads").length).toBeGreaterThan(0);
    expect(screen.getByText("Open file")).toBeInTheDocument();
    expect(screen.getAllByText("Focus").length).toBeGreaterThan(0);

    await user.keyboard("k");
    expect(within(screen.getByLabelText("Diff viewer")).getByText("src/review/queue.ts")).toBeInTheDocument();

    await user.keyboard("j");
    expect(within(screen.getByLabelText("Diff viewer")).getByText("src/auth/session.ts")).toBeInTheDocument();

    await user.keyboard("r");
    expect(await within(screen.getByLabelText("Inspector")).findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();

    await user.keyboard("e");
    expect(threadActionClient.resolve).toHaveBeenCalledWith("thread-1");

    await user.keyboard("a");
    expect(screen.getByLabelText("Review queue summary")).toHaveTextContent("3 selected");

    await user.keyboard("{Shift>}R{/Shift}");
    expect(screen.getByLabelText("Reply body")).toHaveFocus();
  });

  it("updates Review Session state as the reviewer navigates threads", async () => {
    const user = userEvent.setup();
    const reviewSessionClient = createReviewSessionClient();
    const fetchedPullRequestData = createOverviewFixture();
    fetchedPullRequestData.reviewThreads = [
      ...fetchedPullRequestData.reviewThreads,
      {
        id: "thread-2",
        authorLogin: "monalisa",
        filePath: "src/review/queue.ts",
        line: 88,
        state: "resolved",
        body: "The queue filter path should remain available after GitHub resolves a thread.",
        updatedAt: "2026-05-18T12:01:00Z",
      },
    ];
    fetchedPullRequestData.fileSummaries = [
      ...fetchedPullRequestData.fileSummaries,
      { path: "src/review/queue.ts", additions: 94, deletions: 21, status: "modified" },
    ];
    const workspaceClient = createWorkspaceClient({
      fetchPullRequestData: vi.fn().mockResolvedValue(fetchedPullRequestData),
    });
    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        reviewSessionClient={reviewSessionClient}
        workspaceClient={workspaceClient}
      />,
    );

    const dialog = await openPullRequestsDialog(user);
    await user.type(within(dialog).getByLabelText("Pull Request URL"), readyPullRequest.url);
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));
    await screen.findAllByText("Resplendent-Data/Narview #12");
    await waitFor(() => {
      expect(workspaceClient.fetchPullRequestData).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: readyPullRequest.repository,
          number: readyPullRequest.number,
        }),
      );
      expect(readCacheStore().entries[getPullRequestKey(readyPullRequest)]?.reviewThreads).toHaveLength(2);
    });
    await waitFor(() => expect(screen.getByLabelText("Review queue summary")).toHaveTextContent("2 matching filters"));

    await user.keyboard("k");

    await waitFor(() => {
      const savedSnapshot = vi.mocked(reviewSessionClient.saveSession).mock.calls.at(-1)?.[2];
      expect(savedSnapshot).toMatchObject({
        threadKey: "thread-2",
        filePath: "src/review/queue.ts",
        nearbyLine: 88,
      });
    });
  }, 10_000);

  it("exposes resolve and unresolve from the inspector for the active thread", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    render(<App threadActionClient={threadActionClient} />);

    await user.keyboard("t");
    const dialog = await screen.findByRole("dialog", { name: /review threads/i });
    await user.type(within(dialog).getByLabelText("Search review threads"), "queue");
    await user.click(within(dialog).getByRole("button", { name: /src\/review\/queue\.ts/i }));
    await user.click(within(screen.getByLabelText("Inspector")).getByRole("button", { name: /^unresolve/i }));

    expect(threadActionClient.unresolve).toHaveBeenCalledWith("thread-2");
  });

  it("builds structured handoff packets without LLM behavior or code mutation", () => {
    const cache = createOverviewFixture();
    const diffContextByPath = {
      "src/auth/session.ts": [
        { oldLine: 23, newLine: 23, kind: "context", content: "before", highlighted: true, language: "typescript" },
        { oldLine: 24, newLine: null, kind: "deletion", content: "const cached = previous;", highlighted: true, language: "typescript" },
        { oldLine: null, newLine: 24, kind: "addition", content: "const cached = next;", highlighted: true, language: "typescript" },
      ] satisfies DiffLine[],
    };

    const packet = buildHandoffPacket({
      intent: "Fix selected feedback",
      pullRequest: cache.metadata,
      threads: cache.reviewThreads,
      files: cache.fileSummaries,
      diffContextByPath,
      contextRadius: 1,
    });

    expect(packet).toMatchObject({
      intent: "Fix selected feedback",
      usesLlm: false,
      appliesChanges: false,
      pullRequest: {
        repository: "Resplendent-Data/Narview",
        number: 12,
      },
    });
    expect(packet.threads[0]).toMatchObject({
      id: "thread-1",
      filePath: "src/auth/session.ts",
      line: 24,
    });
    expect(JSON.stringify(packet)).not.toMatch(/openai|gemini|anthropic/i);
  });

  it("renders handoff Markdown with selected thread context boundaries", () => {
    const cache = createOverviewFixture();
    const lines: DiffLine[] = Array.from({ length: 7 }, (_, index) => ({
      oldLine: index + 20,
      newLine: index + 20,
      kind: "context",
      content: `line ${index + 20}`,
      highlighted: true,
      language: "typescript",
    }));
    const selected = selectDiffContextLines(lines, 23, 1);

    expect(selected).toEqual(["   22 line 22", "   23 line 23", "   24 line 24"]);

    const markdown = renderHandoffMarkdown(
      buildHandoffPacket({
        intent: "Audit risky PR areas",
        pullRequest: cache.metadata,
        threads: cache.reviewThreads,
        files: cache.fileSummaries,
        diffContextByPath: { "src/auth/session.ts": lines },
        contextRadius: 1,
      }),
    );

    expect(markdown).toContain("Intent: Audit risky PR areas");
    expect(markdown).toContain("### thread-1");
    expect(markdown).toContain("```diff");
    expect(markdown).toContain("- src/auth/session.ts");
  });

  it("captures custom handoff intent and copies Markdown for selected Review Threads", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await user.type(screen.getByLabelText("Custom handoff intent"), "Fix only the stale session cache issue");
    await user.click(screen.getByRole("button", { name: /copy markdown/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const markdown = writeText.mock.calls[0][0] as string;
    expect(markdown).toContain("Intent: Fix only the stale session cache issue");
    expect(markdown).toContain("### thread-1");
    expect(markdown).toContain("File: src/auth/session.ts:142");
    expect(markdown).toContain("LLM used: false");
    expect(markdown).toContain("Applies code changes: false");
    expect(await screen.findByText("Copied 1 thread to Markdown.")).toBeInTheDocument();
  });

  it("marks Review Threads reviewed locally and distinguishes outdated threads in the UI", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard("t");
    const dialog = await screen.findByRole("dialog", { name: /review threads/i });
    expect(within(dialog).getAllByText("Outdated").length).toBeGreaterThan(0);
    await user.keyboard("{Escape}");

    await user.click(within(screen.getByLabelText("Inspector")).getByRole("button", { name: /mark reviewed/i }));

    expect(await within(screen.getByLabelText("Inspector")).findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');

    await user.selectOptions(screen.getByLabelText("Source"), "human");
    await user.selectOptions(screen.getByLabelText("State"), "outdated");

    const queueSummary = screen.getByLabelText("Review queue summary");
    expect(queueSummary).toHaveTextContent("1 matching filters");
    await user.click(within(queueSummary).getByRole("button", { name: /browse threads/i }));
    const filteredDialog = await screen.findByRole("dialog", { name: /review threads/i });
    expect(within(filteredDialog).getByRole("button", { name: /src-tauri\/src\/github\.rs/i })).toBeInTheDocument();
    expect(within(filteredDialog).queryByRole("button", { name: /src\/auth\/session\.ts/i })).not.toBeInTheDocument();
  });

  it("adds a Reply to the selected GitHub Review Thread", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    const workspaceClient = createWorkspaceClient({
      fetchPullRequestData: vi.fn().mockResolvedValue(createOverviewFixture()),
    });

    render(
      <App
        authClient={createAuthClient({ getStatus: vi.fn().mockResolvedValue(signedInSession) })}
        threadActionClient={threadActionClient}
        workspaceClient={workspaceClient}
      />,
    );

    const dialog = await openPullRequestsDialog(user);
    await user.type(within(dialog).getByLabelText("Pull Request URL"), readyPullRequest.url);
    await user.click(within(dialog).getByRole("button", { name: /^open$/i }));
    await waitFor(() => expect(workspaceClient.fetchPullRequestData).toHaveBeenCalled());

    await user.type(screen.getByLabelText("Reply body"), "Good catch. I patched this.");
    await user.click(screen.getByRole("button", { name: /submit reply/i }));

    expect(threadActionClient.reply).toHaveBeenCalledWith("thread-1", "Good catch. I patched this.");
    expect(await screen.findByText("Reply added to GitHub Review Thread.")).toBeInTheDocument();
    expect(screen.getByLabelText("Reply body")).toHaveValue("");
    expect(await screen.findByText("Good catch. I patched this.")).toBeInTheDocument();
  });

  it("resolves and unresolves Review Threads while preserving local Reviewed state", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();

    render(<App threadActionClient={threadActionClient} />);
    const inspector = screen.getByLabelText("Inspector");

    await user.click(within(inspector).getByRole("button", { name: /^resolve/i }));

    expect(threadActionClient.resolve).toHaveBeenCalledWith("thread-1");
    expect(await within(inspector).findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: /^unresolve/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');

    await user.click(within(inspector).getByRole("button", { name: /^unresolve/i }));

    expect(threadActionClient.unresolve).toHaveBeenCalledWith("thread-1");
    expect(await screen.findByText("Review Thread unresolved on GitHub.")).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');
  });

  it("marks a Review Thread reviewed when resolving it from the keyboard", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();

    render(<App threadActionClient={threadActionClient} />);

    await user.keyboard("e");

    expect(threadActionClient.resolve).toHaveBeenCalledWith("thread-1");
    expect(await screen.findByText("Review Thread resolved on GitHub.")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}").users["local-user"]["thread-1"].reviewed).toBe(true);
    expect(within(screen.getByLabelText("Inspector")).getByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();
  });

  it("surfaces retryable and terminal GitHub write failures clearly", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient({
      reply: vi.fn().mockResolvedValue(
        createThreadActionFailure(
          "reply",
          "thread-1",
          "github-thread-permission-error",
          "GitHub rejected this Review Thread write. Check account access and token scopes.",
        ),
      ),
    });

    expect(validateReplyBody("   ")).toBe("Reply body is required.");
    expect(networkRequiredThreadActionFailure("resolve", "thread-1")).toMatchObject({
      ok: false,
      code: "network-required",
      retryable: true,
      message: "Resolve thread requires a live GitHub connection.",
    });

    render(<App threadActionClient={threadActionClient} />);

    await user.type(screen.getByLabelText("Reply body"), "Trying a reply.");
    await user.click(screen.getByRole("button", { name: /submit reply/i }));

    expect(await screen.findByText("GitHub rejected this Review Thread write. Check account access and token scopes.")).toBeInTheDocument();
  });

  it("bulk marks selected Review Threads reviewed with undoable feedback", async () => {
    const user = userEvent.setup();
    render(<App threadActionClient={createThreadActionClient()} />);
    const queueSummary = screen.getByLabelText("Review queue summary");

    await user.keyboard("a");
    expect(queueSummary).toHaveTextContent("3 selected");
    await user.click(within(queueSummary).getByRole("button", { name: /^bulk mark reviewed/i }));

    expect(await within(queueSummary).findByText("Marked 3 threads reviewed.")).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');

    await user.click(within(queueSummary).getByRole("button", { name: /^undo/i }));

    const store = JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}");
    expect(store.users["local-user"]["thread-1"].reviewed).toBe(false);
    expect(store.users["local-user"]["thread-2"].reviewed).toBe(false);
    expect(store.users["local-user"]["thread-3"].reviewed).toBe(false);
  });

  it("cancels confirmed bulk GitHub actions before they execute", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    render(<App threadActionClient={threadActionClient} />);
    const queueSummary = screen.getByLabelText("Review queue summary");

    await user.keyboard("a");
    await user.click(within(queueSummary).getByRole("button", { name: /^resolve selected/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Confirm bulk resolve");

    await user.click(screen.getByRole("button", { name: /^cancel/i }));

    expect(threadActionClient.resolve).not.toHaveBeenCalled();
  });

  it("reports partial failures for confirmed bulk GitHub actions and applies local side effects only to successes", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient({
      resolve: vi.fn().mockImplementation(async (threadId: string) =>
        threadId === "thread-1"
          ? {
              ok: true,
              action: "resolve",
              threadId,
              message: "Review Thread resolved on GitHub.",
              replyUrl: null,
            }
          : createThreadActionFailure("resolve", threadId, "github-thread-server-error", "GitHub could not resolve this thread right now."),
      ),
    });
    render(<App threadActionClient={threadActionClient} />);
    const queueSummary = screen.getByLabelText("Review queue summary");

    await user.keyboard("a");
    await user.click(within(queueSummary).getByRole("button", { name: /^resolve selected/i }));
    await user.click(screen.getByRole("button", { name: /^confirm/i }));

    expect(await within(queueSummary).findByText("1 succeeded, 2 failed.")).toBeInTheDocument();
    expect(within(queueSummary).getByText(/thread-2: GitHub could not resolve this thread right now/)).toBeInTheDocument();
    expect(within(queueSummary).getByText(/thread-3: GitHub could not resolve this thread right now/)).toBeInTheDocument();
    await user.click(within(queueSummary).getByRole("button", { name: /^retry failed/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("2 selected Review Threads");

    const store = JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}");
    expect(store.users["local-user"]["thread-1"].reviewed).toBe(true);
    expect(store.users["local-user"]["thread-2"].reviewed).toBe(false);
    expect(store.users["local-user"]["thread-3"].reviewed).toBe(false);
  });
});
