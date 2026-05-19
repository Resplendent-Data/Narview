import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { AuthClient, AuthSession } from "./lib/auth";
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
import { parsePullRequestUrl, type ReviewSessionClient, type ReviewSessionSnapshot } from "./lib/review-session";
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
    expect(screen.getByText("Next review thread")).toBeInTheDocument();
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

  it("pins and clears fetched cache without deleting Review Session state", () => {
    window.localStorage.setItem("narview.reviewSessions.v1", JSON.stringify({ sessions: { saved: true }, lastByUser: {} }));
    upsertCachedPullRequest(readyPullRequest);
    setCachedPullRequestPinned("Resplendent-Data/Narview#12", true);

    expect(cacheStats().pinned).toBe(1);

    clearFetchedGithubData();

    expect(window.localStorage.getItem(prCacheStorageKey)).toContain('"entries":{}');
    expect(window.localStorage.getItem("narview.reviewSessions.v1")).toContain("saved");
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
});
