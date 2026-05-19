import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
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
} from "./lib/pr-cache";
import { buildReviewOverview, getMergeReadiness, scoreHotspots, summarizeChecks } from "./lib/review-overview";
import {
  buildReviewThreadViews,
  filterReviewThreads,
  reviewQueueStorageKey,
  setReviewThreadReviewed,
  syncReviewThreads,
} from "./lib/review-queue";
import {
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
import type { PullRequestSummary, WorkspaceClient, WorkspaceRepository } from "./lib/workspace";

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

describe("App shell", () => {
  it("renders the Guided Review Workspace zones", () => {
    render(<App />);

    expect(screen.getByLabelText("Review map")).toBeInTheDocument();
    expect(screen.getByLabelText("Review canvas")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspector")).toBeInTheDocument();
    expect(screen.getAllByText("Needs attention")).toHaveLength(2);
  });

  it("toggles focus mode from the visible control", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /focus/i }));

    expect(screen.queryByLabelText("Review map")).not.toBeInTheDocument();
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

    expect(await screen.findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();

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
    const token = "gho_secretabcdefghijklmnopqrstuvwxyz123456";
    const authClient = createAuthClient({
      getStatus: vi.fn().mockResolvedValue(signedInSession),
    });

    render(<App authClient={authClient} />);

    expect(await screen.findAllByText("@octocat")).toHaveLength(2);
    expect(screen.getByText("OS secure storage")).toBeInTheDocument();
    expect(screen.queryByText(token)).not.toBeInTheDocument();
  });

  it("starts the GitHub OAuth device flow from the sign-in button", async () => {
    const user = userEvent.setup();
    const authClient = createAuthClient();
    render(<App authClient={authClient} />);

    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    expect(authClient.startSignIn).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("ABCD-1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check sign-in/i })).toBeInTheDocument();
  });

  it("signs out through the backend session command", async () => {
    const user = userEvent.setup();
    const authClient = createAuthClient({
      getStatus: vi.fn().mockResolvedValue(signedInSession),
    });

    render(<App authClient={authClient} />);

    await user.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findAllByText("Signed out")).toHaveLength(2);
  });

  it("saves and removes GitHub repositories in the Workspace", async () => {
    const user = userEvent.setup();
    const workspaceClient = createWorkspaceClient();

    render(<App authClient={createAuthClient()} workspaceClient={workspaceClient} />);

    await user.type(screen.getByLabelText("Repository slug"), "Resplendent-Data/Narview");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(workspaceClient.saveRepository).toHaveBeenCalledWith("Resplendent-Data/Narview");
    expect(await screen.findByText("Resplendent-Data/Narview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove resplendent-data\/narview/i }));

    expect(workspaceClient.removeRepository).toHaveBeenCalledWith("Resplendent-Data", "Narview");
    expect(await screen.findByText("No saved repositories.")).toBeInTheDocument();
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

    await user.click(screen.getByLabelText("Include draft Pull Requests"));

    expect(await screen.findByText("Draft billing sync")).toBeInTheDocument();
    expect(workspaceClient.refreshPullRequests).toHaveBeenCalledWith(false);
    expect(workspaceClient.refreshPullRequests).toHaveBeenCalledWith(true);
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

    await user.click(await screen.findByRole("button", { name: /draft billing sync/i }));

    expect(screen.getAllByText("Resplendent-Data/Narview #13").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /draft billing sync/i })).toHaveAttribute("aria-pressed", "true");
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

    expect(await screen.findByText("Rate limited")).toBeInTheDocument();
    expect(screen.getByText(/GitHub rate limit reached/)).toBeInTheDocument();
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

    await user.type(screen.getByLabelText("Pull Request URL"), "https://github.com/Resplendent-Data/Narview/pull/91");
    await user.click(screen.getByRole("button", { name: /open/i }));

    expect(await screen.findAllByText("Resplendent-Data/Narview #91")).toHaveLength(2);
    expect(screen.getByText("No saved repositories.")).toBeInTheDocument();
  });

  it("shows invalid Pull Request URL errors", async () => {
    const user = userEvent.setup();

    render(<App authClient={createAuthClient()} workspaceClient={createWorkspaceClient()} reviewSessionClient={createReviewSessionClient()} />);

    await user.type(screen.getByLabelText("Pull Request URL"), "https://example.com/acme/api/pull/4");
    await user.click(screen.getByRole("button", { name: /open/i }));

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

    await user.type(screen.getByLabelText("Pull Request URL"), readyPullRequest.url);
    await user.click(screen.getByRole("button", { name: /open/i }));

    await user.click(await screen.findByRole("button", { name: /exit focus/i }));
    expect(screen.getByLabelText("Include draft Pull Requests")).toBeChecked();
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

    await user.click(screen.getByRole("button", { name: /^mark reviewed/i }));
    await user.click(within(screen.getByLabelText("File changes")).getByRole("button", { name: /mark src\/auth\/session\.ts viewed/i }));

    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');
    expect(window.localStorage.getItem(fileChangeStorageKey)).toContain('"viewed":true');
    expect(window.localStorage.getItem(reviewSessionStorageKey)).toContain("saved");

    const privacy = screen.getByLabelText("Privacy and diagnostics");
    await user.click(within(privacy).getByRole("button", { name: /reset local review history/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Reset local review history");

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

    const privacy = screen.getByLabelText("Privacy and diagnostics");
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
    expect(hotspots[0].reasons).toEqual(expect.arrayContaining(["215 changed lines", "1 unresolved thread", "critical path"]));
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
          criticalPath: 1,
        },
        criticalPathPatterns: ["infra"],
      },
    );

    expect(hotspots[0].path).toBe("infra/provider.ts");
    expect(hotspots[0].reasons).toContain("critical path");
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
    const fileList = screen.getByLabelText("File changes");

    expect(within(fileList).getByText("assets/review-map.png")).toBeInTheDocument();
    expect(within(fileList).getByText("Image fallback")).toBeInTheDocument();
    expect(within(fileList).getByText("notebooks/review-findings.ipynb")).toBeInTheDocument();
    expect(within(fileList).getByText("Non-text fallback")).toBeInTheDocument();

    await user.click(within(fileList).getByRole("button", { name: /mark src\/auth\/session\.ts viewed/i }));

    expect(window.localStorage.getItem(fileChangeStorageKey)).toContain('"viewed":true');
    expect(JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}").users["local-user"]["thread-1"].reviewed).toBe(false);

    await user.selectOptions(within(fileList).getByLabelText("File viewed"), "viewed");
    expect(within(fileList).getByText("src/auth/session.ts")).toBeInTheDocument();
    expect(within(fileList).queryByText("src/review/queue.ts")).not.toBeInTheDocument();
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

  it("models lazy hunk loading before the whole diff is available", () => {
    const [file] = createFileSummaries();
    const state = buildLazyDiffState(file, {
      mode: "unified",
      repository: "Resplendent-Data/Narview",
      pullRequestNumber: 12,
      loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
    });

    expect(state.hunks[0].loaded).toBe(true);
    expect(state.hunks[1].loaded).toBe(false);
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

    expect(await screen.findAllByText("acme/large-pr #9001")).toHaveLength(2);
    expect(screen.getByText("Showing 80 of 140 matching Review Threads.")).toBeInTheDocument();
    expect(screen.getByText("Showing 120 of 240 matching File Changes.")).toBeInTheDocument();
    expect(screen.getAllByText(/GitHub rate limit reached/).length).toBeGreaterThanOrEqual(2);
  });

  it("loads hunks, expands context, and fetches the whole file on demand", async () => {
    const user = userEvent.setup();
    render(<App />);
    const diffViewer = screen.getByLabelText("Diff viewer");

    expect(within(diffViewer).getByText("Hunk not loaded yet.")).toBeInTheDocument();

    await user.click(within(diffViewer).getByRole("button", { name: /load hunk/i }));

    expect(await within(diffViewer).findByText(/logger.info/)).toBeInTheDocument();

    await user.click(within(diffViewer).getAllByRole("button", { name: /expand context/i })[0]);

    expect(await within(diffViewer).findByText(/context before src\/auth\/session\.ts/)).toBeInTheDocument();

    await user.click(within(diffViewer).getByRole("button", { name: /view whole file/i }));

    expect(await within(diffViewer).findByLabelText("Full file view")).toBeInTheDocument();
  });

  it("shows non-text diff fallback with a GitHub escape hatch", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /view diff for notebooks\/review-findings\.ipynb/i }));

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
    const queue = screen.getByLabelText("Review thread queue");

    await user.click(within(queue).getByRole("button", { name: /src\/review\/queue\.ts/i }));

    const diffViewer = screen.getByLabelText("Diff viewer");
    expect(within(diffViewer).getByText("src/review/queue.ts")).toBeInTheDocument();
    expect(screen.getByText("@monalisa")).toBeInTheDocument();
    expect(screen.getByText("Review Path 2 of 3")).toBeInTheDocument();
  });

  it("presents outdated threads as older diff context in the guided flow", async () => {
    const user = userEvent.setup();
    render(<App />);
    const queue = screen.getByLabelText("Review thread queue");

    await user.click(within(queue).getByRole("button", { name: /src-tauri\/src\/github\.rs/i }));

    expect(screen.getAllByText("Outdated").length).toBeGreaterThan(0);
    expect(screen.getByText("Older diff context from a previous hunk.")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Diff viewer")).getByText("src-tauri/src/github.rs")).toBeInTheDocument();
  });

  it("runs the keyboard review loop with visible shortcut cues", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    render(<App threadActionClient={threadActionClient} />);

    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Open file")).toBeInTheDocument();
    expect(screen.getAllByText("Focus").length).toBeGreaterThan(0);

    await user.keyboard("j");
    expect(within(screen.getByLabelText("Diff viewer")).getByText("src/review/queue.ts")).toBeInTheDocument();

    await user.keyboard("k");
    expect(within(screen.getByLabelText("Diff viewer")).getByText("src/auth/session.ts")).toBeInTheDocument();

    await user.keyboard("r");
    expect(await screen.findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();

    await user.keyboard("e");
    expect(threadActionClient.resolve).toHaveBeenCalledWith("thread-1");

    await user.keyboard("a");
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    await user.keyboard("{Shift>}R{/Shift}");
    expect(screen.getByLabelText("Reply body")).toHaveFocus();
  });

  it("updates Review Session state as the reviewer navigates threads", async () => {
    const user = userEvent.setup();
    const reviewSessionClient = createReviewSessionClient();
    render(<App reviewSessionClient={reviewSessionClient} />);

    await user.type(screen.getByLabelText("Pull Request URL"), readyPullRequest.url);
    await user.click(screen.getByRole("button", { name: /open/i }));
    await screen.findAllByText("Resplendent-Data/Narview #12");

    await user.keyboard("j");

    await waitFor(() => {
      const savedSnapshot = vi.mocked(reviewSessionClient.saveSession).mock.calls.at(-1)?.[2];
      expect(savedSnapshot).toMatchObject({
        threadKey: "thread-2",
        filePath: "src/review/queue.ts",
        nearbyLine: 88,
      });
    });
  });

  it("exposes resolve and unresolve from the inspector for the active thread", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    render(<App threadActionClient={threadActionClient} />);
    const queue = screen.getByLabelText("Review thread queue");

    await user.click(within(queue).getByRole("button", { name: /src\/review\/queue\.ts/i }));
    await user.click(screen.getByRole("button", { name: /^unresolve/i }));

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

    await user.click(screen.getByLabelText("Select src/auth/session.ts"));
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

    const queue = screen.getByLabelText("Review thread queue");
    expect(within(queue).getAllByText("Outdated").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /mark reviewed/i }));

    expect(await screen.findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');

    await user.selectOptions(screen.getByLabelText("Source"), "human");
    await user.selectOptions(screen.getByLabelText("State"), "outdated");

    expect(within(queue).getByText("src-tauri/src/github.rs")).toBeInTheDocument();
    expect(within(queue).queryByText("src/auth/session.ts")).not.toBeInTheDocument();
  });

  it("adds a Reply to the selected GitHub Review Thread", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();

    render(<App threadActionClient={threadActionClient} />);

    await user.type(screen.getByLabelText("Reply body"), "Good catch. I patched this.");
    await user.click(screen.getByRole("button", { name: /^reply/i }));

    expect(threadActionClient.reply).toHaveBeenCalledWith("thread-1", "Good catch. I patched this.");
    expect(await screen.findByText("Reply added to GitHub Review Thread.")).toBeInTheDocument();
    expect(screen.getByLabelText("Reply body")).toHaveValue("");
  });

  it("resolves and unresolves Review Threads while preserving local Reviewed state", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();

    render(<App threadActionClient={threadActionClient} />);
    const inspector = screen.getByLabelText("Inspector");

    await user.click(within(inspector).getByRole("button", { name: /^resolve/i }));

    expect(threadActionClient.resolve).toHaveBeenCalledWith("thread-1");
    expect(await screen.findByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: /^unresolve/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');

    await user.click(within(inspector).getByRole("button", { name: /^unresolve/i }));

    expect(threadActionClient.unresolve).toHaveBeenCalledWith("thread-1");
    expect(await screen.findByText("Review Thread unresolved on GitHub.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark unreviewed/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');
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
    await user.click(screen.getByRole("button", { name: /^reply/i }));

    expect(await screen.findByText("GitHub rejected this Review Thread write. Check account access and token scopes.")).toBeInTheDocument();
  });

  it("bulk marks selected Review Threads reviewed with undoable feedback", async () => {
    const user = userEvent.setup();
    render(<App threadActionClient={createThreadActionClient()} />);
    const queue = screen.getByLabelText("Review thread queue");

    await user.click(screen.getByLabelText("Select src/auth/session.ts"));
    await user.click(screen.getByLabelText("Select src/review/queue.ts"));
    await user.click(within(queue).getByRole("button", { name: /^mark reviewed/i }));

    expect(await within(queue).findByText("Marked 2 threads reviewed.")).toBeInTheDocument();
    expect(window.localStorage.getItem(reviewQueueStorageKey)).toContain('"reviewed":true');

    await user.click(within(queue).getByRole("button", { name: /^undo/i }));

    const store = JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}");
    expect(store.users["local-user"]["thread-1"].reviewed).toBe(false);
    expect(store.users["local-user"]["thread-2"].reviewed).toBe(false);
  });

  it("cancels confirmed bulk GitHub actions before they execute", async () => {
    const user = userEvent.setup();
    const threadActionClient = createThreadActionClient();
    render(<App threadActionClient={threadActionClient} />);
    const queue = screen.getByLabelText("Review thread queue");

    await user.click(screen.getByLabelText("Select src/auth/session.ts"));
    await user.click(within(queue).getByRole("button", { name: /^resolve selected/i }));
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
    const queue = screen.getByLabelText("Review thread queue");

    await user.click(screen.getByLabelText("Select src/auth/session.ts"));
    await user.click(screen.getByLabelText("Select src/review/queue.ts"));
    await user.click(within(queue).getByRole("button", { name: /^resolve selected/i }));
    await user.click(screen.getByRole("button", { name: /^confirm/i }));

    expect(await within(queue).findByText("1 succeeded, 1 failed.")).toBeInTheDocument();
    expect(within(queue).getByText(/thread-2: GitHub could not resolve this thread right now/)).toBeInTheDocument();
    await user.click(within(queue).getByRole("button", { name: /^retry failed/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1 selected Review Thread");

    const store = JSON.parse(window.localStorage.getItem(reviewQueueStorageKey) ?? "{}");
    expect(store.users["local-user"]["thread-1"].reviewed).toBe(true);
    expect(store.users["local-user"]["thread-2"].reviewed).toBe(false);
  });
});
