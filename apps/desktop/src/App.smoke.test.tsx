import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { AppUpdateClient } from "./lib/app-updater";
import type { AuthClient, AuthSession } from "./lib/auth";
import {
  createCachedPullRequest,
  prCacheStorageKey,
  writeCachedPullRequestData,
  type CachedPullRequestData,
  type CachedReviewThread,
} from "./lib/pr-cache";
import type {
  AddPendingReviewThreadInput,
  DiscardPendingReviewInput,
  FileViewedActionResult,
  ReviewActionClient,
  SetFileViewedInput,
  SubmitPendingReviewInput,
} from "./lib/review-actions";
import { getPullRequestKey, type ReviewSessionClient } from "./lib/review-session";
import type { ThreadActionClient } from "./lib/thread-actions";
import type { PullRequestChecksResponse, PullRequestSummary, WorkspaceClient, WorkspaceRepository } from "./lib/workspace";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

const signedInSession: AuthSession = {
  state: "signed-in",
  storage: {
    available: true,
    message: null,
  },
  accountLogin: "octocat",
  tokenHint: "os-secure-storage",
};

const repository: WorkspaceRepository = {
  owner: "Resplendent-Data",
  name: "Narview",
  slug: "Resplendent-Data/Narview",
};

const pullRequest: PullRequestSummary = {
  repository: repository.slug,
  number: 42,
  title: "Add billing review stack",
  authorLogin: "octocat",
  assigneeLogins: ["octocat"],
  requestedReviewerLogins: ["monalisa"],
  baseBranch: "main",
  headBranch: "billing-stack",
  isDraft: false,
  updatedAt: "2026-06-18T12:00:00Z",
  url: "https://github.com/Resplendent-Data/Narview/pull/42",
};

const blockedPullRequest: PullRequestSummary = {
  repository: repository.slug,
  number: 77,
  title: "Stabilize export queue",
  authorLogin: "monalisa",
  assigneeLogins: ["hubot"],
  requestedReviewerLogins: ["octocat"],
  baseBranch: "main",
  headBranch: "export-queue",
  isDraft: false,
  updatedAt: "2026-06-18T13:00:00Z",
  url: "https://github.com/Resplendent-Data/Narview/pull/77",
};

let rejectPullRequestCacheWrites = false;

const localStorageMock = {
  store: new Map<string, string>(),
  getItem(key: string) {
    return this.store.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    if (rejectPullRequestCacheWrites && key === prCacheStorageKey) {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    }
    this.store.set(key, value);
  },
  removeItem(key: string) {
    this.store.delete(key);
  },
  clear() {
    this.store.clear();
  },
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  localStorageMock.clear();
  rejectPullRequestCacheWrites = false;
  vi.clearAllMocks();
});

function createAuthClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    getStatus: vi.fn().mockResolvedValue(signedInSession),
    startSignIn: vi.fn(),
    pollSignIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ ...signedInSession, state: "signed-out", accountLogin: null }),
    ...overrides,
  };
}

function createWorkspaceClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    listRepositories: vi.fn().mockResolvedValue({ repositories: [repository] }),
    saveRepository: vi.fn().mockResolvedValue({ repositories: [repository] }),
    removeRepository: vi.fn().mockResolvedValue({ repositories: [] }),
    getReviewCloneStatus: vi.fn(),
    ensureReviewClone: vi.fn(),
    preparePullRequestReviewClone: vi.fn(),
    readPullRequestAnalysisFiles: vi.fn(),
    readPullRequestFilePatches: vi.fn().mockResolvedValue({
      repository,
      pullRequestNumber: pullRequest.number,
      files: [],
    }),
    refreshPullRequests: vi.fn().mockResolvedValue({
      repositories: [repository],
      pullRequests: [pullRequest],
      status: {
        state: "fresh",
        message: "Fetched 1 open pull request.",
        rateLimitResetEpochSeconds: null,
        refreshedAtEpochSeconds: 1_800_000_000,
      },
    }),
    fetchPullRequestData: vi.fn().mockResolvedValue(createReviewStackFixture()),
    fetchPullRequestChecks: vi.fn(),
    ...overrides,
  };
}

function createReviewActionClient(overrides: Partial<ReviewActionClient> = {}): ReviewActionClient {
  return {
    setFileViewed: vi.fn().mockImplementation(async (input: SetFileViewedInput) => ({
      ok: true,
      path: input.path,
      viewerViewedState: input.viewed ? "VIEWED" : "UNVIEWED",
      message: input.viewed ? "File marked viewed on GitHub." : "File marked unviewed on GitHub.",
    })),
    findPendingReview: vi.fn().mockResolvedValue(null),
    ensurePendingReview: vi.fn().mockResolvedValue({
      pullRequestId: "PR_42",
      pullRequestReviewId: "PRR_42",
      state: "PENDING",
      message: "Created pending GitHub review.",
    }),
    addPendingReviewThread: vi.fn().mockImplementation(async (input: AddPendingReviewThreadInput) => ({
      pullRequestId: "PR_42",
      pullRequestReviewId: "PRR_42",
      state: "PENDING",
      message: "Draft comment added to pending GitHub review.",
      thread: {
        id: "thread-draft",
        authorLogin: "octocat",
        filePath: input.path ?? "src/billing/checkout.ts",
        line: input.line ?? null,
        state: "unresolved",
        body: input.body,
        updatedAt: "2026-06-18T12:10:00Z",
      } satisfies CachedReviewThread,
    })),
    submitPendingReview: vi.fn().mockImplementation(async (input: SubmitPendingReviewInput) => ({
      ok: true,
      pullRequestReviewId: input.pullRequestReviewId ?? "PRR_direct",
      state: "COMMENTED",
      url: "https://github.com/Resplendent-Data/Narview/pull/42#pullrequestreview-1",
      message: "Pending review submitted to GitHub.",
    })),
    discardPendingReview: vi.fn().mockImplementation(async (input: DiscardPendingReviewInput) => ({
      ok: true,
      pullRequestReviewId: input.pullRequestReviewId,
      state: "DELETED",
      url: null,
      message: "Pending review discarded.",
    })),
    ...overrides,
  };
}

function createThreadActionClient(overrides: Partial<ThreadActionClient> = {}): ThreadActionClient {
  return {
    reply: vi.fn(),
    resolve: vi.fn().mockResolvedValue({
      ok: true,
      action: "resolve",
      threadId: "thread-billing",
      message: "Review Thread resolved on GitHub.",
      replyUrl: null,
    }),
    unresolve: vi.fn(),
    startLineThread: vi.fn(),
    startFileThread: vi.fn(),
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

function createUpdaterClient(overrides: Partial<AppUpdateClient> = {}): AppUpdateClient {
  return {
    isDesktopRuntime: vi.fn(() => true),
    getCurrentVersion: vi.fn().mockResolvedValue("0.1.0"),
    checkForUpdate: vi.fn().mockResolvedValue(null),
    relaunch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createReviewStackFixture(): CachedPullRequestData {
  const cache = createCachedPullRequest(pullRequest, 1_800_000_000_000);

  return {
    ...cache,
    metadata: {
      ...cache.metadata,
      description: "Adds deterministic review stacks.",
      nodeId: "PR_42",
      baseBranch: "main",
      headBranch: "billing-stack",
      headSha: "2222222222222222222222222222222222222222",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "REVIEW_REQUIRED",
    },
    fileSummaries: [
      {
        path: "schemas/billing.graphql",
        additions: 12,
        deletions: 1,
        status: "modified",
        patch: "@@ -1,2 +1,4 @@\n type BillingAccount {\n+  reviewStackId: ID!\n }",
        viewerViewedState: "UNVIEWED",
      },
      {
        path: "src/billing/checkout.ts",
        additions: 28,
        deletions: 4,
        status: "modified",
        patch: "@@ -1,4 +1,6 @@\n export function checkout() {\n-  return true;\n+  const stack = buildStack();\n+  return stack.ready;\n }",
        viewerViewedState: "UNVIEWED",
      },
      {
        path: "src/billing/checkout.test.ts",
        additions: 18,
        deletions: 0,
        status: "added",
        patch: "@@ -0,0 +1,3 @@\n+it('builds a stack', () => {\n+  expect(true).toBe(true);\n+});",
        viewerViewedState: "UNVIEWED",
      },
      {
        path: "docs/review-stack.md",
        additions: 8,
        deletions: 2,
        status: "modified",
        patch: null,
        viewerViewedState: "VIEWED",
      },
    ],
    reviewThreads: [
      {
        id: "thread-billing",
        authorLogin: "coderabbitai",
        filePath: "src/billing/checkout.ts",
        line: 3,
        state: "unresolved",
        body: "This should stay in the core billing stack.",
        updatedAt: "2026-06-18T12:04:00Z",
      },
    ],
  };
}

function createBlockedPullRequestFixture(): CachedPullRequestData {
  const cache = createCachedPullRequest(blockedPullRequest, 1_800_000_100_000);

  return {
    ...cache,
    metadata: {
      ...cache.metadata,
      description: "Tightens queue export behavior before release.",
      nodeId: "PR_77",
      baseBranch: "main",
      headBranch: "export-queue",
      headSha: "7777777777777777777777777777777777777777",
      mergeable: "MERGEABLE",
      mergeStateStatus: "UNSTABLE",
      reviewDecision: "CHANGES_REQUESTED",
    },
    fileSummaries: [
      {
        path: "src/export/queue.ts",
        additions: 31,
        deletions: 8,
        status: "modified",
        patch: "@@ -1,3 +1,5 @@\n export function queueExport() {\n+  return scheduleExport();\n }",
        viewerViewedState: "UNVIEWED",
      },
      {
        path: "src/export/queue.test.ts",
        additions: 14,
        deletions: 2,
        status: "modified",
        patch: "@@ -1,3 +1,4 @@\n it('exports queued work', () => {\n+  expect(true).toBe(true);\n });",
        viewerViewedState: "UNVIEWED",
      },
    ],
    reviewThreads: [
      {
        id: "thread-export",
        authorLogin: "octocat",
        filePath: "src/export/queue.ts",
        line: 2,
        state: "unresolved",
        body: "This still drops queued exports on retry.",
        updatedAt: "2026-06-18T13:05:00Z",
      },
    ],
    checks: [
      {
        name: "ci/export",
        status: "completed",
        conclusion: "failure",
        url: "https://github.com/Resplendent-Data/Narview/actions/runs/77",
        startedAt: "2026-06-18T13:02:00Z",
        completedAt: "2026-06-18T13:04:00Z",
      },
      {
        name: "lint",
        status: "in-progress",
        conclusion: null,
        url: null,
        startedAt: "2026-06-18T13:03:00Z",
        completedAt: null,
      },
    ],
  };
}

function renderStackApp(overrides: {
  authClient?: Partial<AuthClient>;
  workspaceClient?: Partial<WorkspaceClient>;
  reviewActionClient?: Partial<ReviewActionClient>;
  threadActionClient?: Partial<ThreadActionClient>;
  updaterClient?: Partial<AppUpdateClient>;
} = {}) {
  const clients = {
    authClient: createAuthClient(overrides.authClient),
    workspaceClient: createWorkspaceClient(overrides.workspaceClient),
    reviewActionClient: createReviewActionClient(overrides.reviewActionClient),
    threadActionClient: createThreadActionClient(overrides.threadActionClient),
    reviewSessionClient: createReviewSessionClient(),
    updaterClient: createUpdaterClient(overrides.updaterClient),
  };

  render(<App {...clients} />);
  return clients;
}

describe("Review stack workspace", () => {
  it("renders deterministic stacks, layers, and the active diff", async () => {
    renderStackApp();

    expect((await screen.findAllByText("Core: src/billing")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Contracts, schema, and setup").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Review stacks")).toBeInTheDocument();
    expect(screen.getByLabelText("Stack diff")).toBeInTheDocument();
    expect(screen.getByLabelText("Review panel")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /checkout.ts/i })[0]);
    expect(screen.getByLabelText("Diff for src/billing/checkout.ts")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Open symbol references for stack/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Open symbol references for ready/i }).length).toBeGreaterThan(0);
  });

  it("renders freshly fetched patches even when Pull Request cache persistence fails", async () => {
    rejectPullRequestCacheWrites = true;
    renderStackApp();

    await userEvent.click(await screen.findByRole("button", { name: "src/billing/checkout.ts" }));

    expect(screen.getByLabelText("Diff for src/billing/checkout.ts")).toBeInTheDocument();
    expect(screen.queryByText("Patch content is unavailable.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Open symbol references for stack/i }).length).toBeGreaterThan(0);
  });

  it("recovers missing active-file patch content from the prepared review clone", async () => {
    const fixture = createReviewStackFixture();
    const checkoutFile = fixture.fileSummaries.find((file) => file.path === "src/billing/checkout.ts")!;
    const compactFixture: CachedPullRequestData = {
      ...fixture,
      fileSummaries: fixture.fileSummaries.map((file) => {
        if (file.path !== "src/billing/checkout.ts") {
          return file;
        }
        const { patch: _patch, ...summary } = file;
        return summary;
      }),
    };
    renderStackApp({
      workspaceClient: {
        fetchPullRequestData: vi.fn().mockResolvedValue(compactFixture),
        readPullRequestFilePatches: vi.fn().mockResolvedValue({
          repository,
          pullRequestNumber: pullRequest.number,
          files: [
            {
              path: "src/billing/checkout.ts",
              state: "loaded",
              content: checkoutFile.patch,
              message: null,
            },
          ],
        }),
      },
    });

    await userEvent.click(await screen.findByRole("button", { name: "src/billing/checkout.ts" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Open symbol references for stack/i }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Patch content is unavailable.")).not.toBeInTheDocument();
  });

  it("syncs stack viewed state through the GitHub viewed action", async () => {
    const reviewActionClient = createReviewActionClient();
    renderStackApp({ reviewActionClient });

    const billingSchemaButtons = await screen.findAllByRole("button", { name: /schemas\/billing.graphql/i });
    await userEvent.click(billingSchemaButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /Mark all files in Contracts, schema, and setup viewed/i }));

    await waitFor(() => {
      expect(reviewActionClient.setFileViewed).toHaveBeenCalledWith({
        repository: "Resplendent-Data/Narview",
        pullRequestNumber: 42,
        path: "schemas/billing.graphql",
        viewed: true,
      });
    });
    expect(await screen.findByText(/Marked 1 file viewed on GitHub/)).toBeInTheDocument();
  });

  it("keeps the review composer usable while stack viewed sync runs in the background", async () => {
    const user = userEvent.setup();
    const viewedSync = createDeferred<FileViewedActionResult>();
    const reviewActionClient = createReviewActionClient({
      setFileViewed: vi.fn().mockReturnValue(viewedSync.promise),
    });
    renderStackApp({ reviewActionClient });

    await user.click(await screen.findByRole("button", { name: "src/billing/checkout.ts" }));
    const lineCommentButtons = await screen.findAllByRole("button", { name: /comment on src\/billing\/checkout.ts:2/i });
    await user.click(lineCommentButtons[0]);
    await user.type(await screen.findByLabelText("Inline draft review comment"), "Looks good.");
    await user.click(screen.getByRole("button", { name: /Mark all files in Contracts, schema, and setup viewed/i }));

    expect(await screen.findByText(/Marking 1 file viewed in the background/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add To Review/i })).toBeEnabled();

    viewedSync.resolve({
      ok: true,
      path: "schemas/billing.graphql",
      viewerViewedState: "VIEWED",
      message: "File marked viewed on GitHub.",
    });
  });

  it("rolls back only files that fail during stack viewed sync", async () => {
    const fixture = createReviewStackFixture();
    const expandedFixture: CachedPullRequestData = {
      ...fixture,
      fileSummaries: [
        ...fixture.fileSummaries,
        {
          path: "src/billing/tax.ts",
          additions: 10,
          deletions: 3,
          status: "modified",
          patch: "@@ -1,2 +1,4 @@\n export function tax() {\n+  return stackTax();\n }",
          viewerViewedState: "UNVIEWED",
        },
      ],
    };
    const reviewActionClient = createReviewActionClient({
      setFileViewed: vi.fn().mockImplementation(async (input: SetFileViewedInput) => {
        if (input.path === "src/billing/tax.ts") {
          return {
            ok: false,
            path: input.path,
            viewerViewedState: "UNVIEWED",
            message: "GitHub rejected viewed sync.",
          };
        }
        return {
          ok: true,
          path: input.path,
          viewerViewedState: "VIEWED",
          message: "File marked viewed on GitHub.",
        };
      }),
    });

    renderStackApp({
      workspaceClient: {
        fetchPullRequestData: vi.fn().mockResolvedValue(expandedFixture),
      },
      reviewActionClient,
    });

    await userEvent.click((await screen.findAllByRole("button", { name: /checkout.ts/i }))[0]);
    await userEvent.click(screen.getByRole("button", { name: /Mark all files in Core: src\/billing viewed/i }));

    expect(await screen.findByText(/Viewed sync failed for 1 file: src\/billing\/tax.ts/)).toBeInTheDocument();
    expect((await screen.findAllByText("1/2 viewed")).length).toBeGreaterThan(0);
  });

  it("moves between layers from the keyboard", async () => {
    const user = userEvent.setup();
    renderStackApp();

    const billingSchemaButtons = await screen.findAllByRole("button", { name: /schemas\/billing.graphql/i });
    await user.click(billingSchemaButtons[0]);
    fireEvent.keyDown(window, { key: "j" });

    expect((await screen.findAllByText("Core: src/billing")).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText("Diff for src/billing/checkout.ts")).toBeInTheDocument();
  });

  it("marks the active file viewed from the header button and V hotkey", async () => {
    const user = userEvent.setup();
    const reviewActionClient = createReviewActionClient();
    renderStackApp({ reviewActionClient });

    await user.click((await screen.findAllByRole("button", { name: /checkout.ts/i }))[0]);
    await user.click(screen.getByRole("button", { name: /Mark src\/billing\/checkout.ts viewed/i }));

    await waitFor(() => {
      expect(reviewActionClient.setFileViewed).toHaveBeenCalledWith({
        repository: "Resplendent-Data/Narview",
        pullRequestNumber: 42,
        path: "src/billing/checkout.ts",
        viewed: true,
      });
    });

    fireEvent.keyDown(window, { key: "v" });

    await waitFor(() => {
      expect(reviewActionClient.setFileViewed).toHaveBeenCalledWith({
        repository: "Resplendent-Data/Narview",
        pullRequestNumber: 42,
        path: "src/billing/checkout.ts",
        viewed: false,
      });
    });
  });

  it("collapses viewed files by default and lets users expand them", async () => {
    const user = userEvent.setup();
    const fixture = createReviewStackFixture();
    const viewedCheckoutFixture: CachedPullRequestData = {
      ...fixture,
      fileSummaries: fixture.fileSummaries.map((file) =>
        file.path === "src/billing/checkout.ts"
          ? {
              ...file,
              viewerViewedState: "VIEWED",
            }
          : file,
      ),
    };

    renderStackApp({
      workspaceClient: {
        fetchPullRequestData: vi.fn().mockResolvedValue(viewedCheckoutFixture),
      },
    });

    await user.click((await screen.findAllByRole("button", { name: /checkout.ts/i }))[0]);

    expect(await screen.findByText("Viewed file collapsed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Diff for src/billing/checkout.ts")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show diff for src\/billing\/checkout.ts/i }));

    expect(await screen.findByLabelText("Diff for src/billing/checkout.ts")).toBeInTheDocument();
  });

  it("filters All Files and toggles focus mode", async () => {
    const user = userEvent.setup();
    renderStackApp();

    await screen.findAllByText("Core: src/billing");
    const allFiles = screen.getByLabelText("All changed files");
    expect(within(allFiles).getByRole("button", { name: /docs\/review-stack.md/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search changed files"), "docs");
    expect(within(allFiles).getByRole("button", { name: /docs\/review-stack.md/i })).toBeInTheDocument();
    expect(within(allFiles).queryByRole("button", { name: /src\/billing\/checkout.ts/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Focus$/ }));
    expect(screen.queryByLabelText("Review stacks")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Panels$/ }));
    expect(screen.getByLabelText("Review stacks")).toBeInTheDocument();
  });

  it("opens the pull request in GitHub with the O shortcut", async () => {
    renderStackApp();

    await screen.findByText("Core: src/billing");
    fireEvent.keyDown(window, { key: "o" });

    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith("https://github.com/Resplendent-Data/Narview/pull/42");
    });
  });

  it("shows the current app version and checks for updates from the footer", async () => {
    const user = userEvent.setup();
    const checkForUpdate = vi.fn().mockResolvedValue(null);
    renderStackApp({
      updaterClient: {
        getCurrentVersion: vi.fn().mockResolvedValue("0.1.0-rc.23"),
        checkForUpdate,
      },
    });

    expect(await screen.findByText("App v0.1.0-rc.23")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /check for updates/i }));

    await waitFor(() => {
      expect(checkForUpdate).toHaveBeenCalled();
    });
    expect(await screen.findByText("You're up to date")).toBeInTheDocument();
  });

  it("opens a rich pull request picker with P and switches pull requests", async () => {
    const user = userEvent.setup();
    const checksHydration = createDeferred<PullRequestChecksResponse>();
    const uncachedPullRequest: PullRequestSummary = {
      repository: repository.slug,
      number: 88,
      title: "Polish diagnostics view",
      authorLogin: "hubot",
      assigneeLogins: [],
      requestedReviewerLogins: [],
      baseBranch: "main",
      headBranch: "diagnostics-view",
      isDraft: false,
      updatedAt: "2026-06-18T14:00:00Z",
      url: "https://github.com/Resplendent-Data/Narview/pull/88",
    };
    writeCachedPullRequestData(createBlockedPullRequestFixture());
    renderStackApp({
      workspaceClient: {
        fetchPullRequestChecks: vi.fn().mockReturnValue(checksHydration.promise),
        refreshPullRequests: vi.fn().mockResolvedValue({
          repositories: [repository],
          pullRequests: [pullRequest, blockedPullRequest, uncachedPullRequest],
          status: {
            state: "fresh",
            message: "Fetched 3 open pull requests.",
            rateLimitResetEpochSeconds: null,
            refreshedAtEpochSeconds: 1_800_000_000,
          },
        }),
      },
    });

    await screen.findByText("Core: src/billing");
    fireEvent.keyDown(window, { key: "p" });

    const dialog = await screen.findByRole("dialog", { name: /Pull Requests/i });
    expect(within(dialog).getByText("Add billing review stack")).toBeInTheDocument();
    expect(within(dialog).getByText("Stabilize export queue")).toBeInTheDocument();
    expect(within(dialog).getAllByText("@hubot").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("@octocat").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Ready for review").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Changes requested")).toBeInTheDocument();
    expect(within(dialog).getAllByText("1 failing").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("1 unresolved thread").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Failing: ci/export")).toBeInTheDocument();

    const blockedRow = within(dialog).getByRole("button", { name: /Switch to Stabilize export queue/i });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(blockedRow).toHaveFocus();
    checksHydration.resolve({
      checks: [
        {
          name: "diagnostics",
          status: "completed",
          conclusion: "success",
          url: null,
          startedAt: "2026-06-18T14:01:00Z",
          completedAt: "2026-06-18T14:02:00Z",
        },
      ],
      rateLimit: {
        remaining: 4999,
        resetEpochSeconds: null,
      },
      fetchedAtEpochMs: 1_800_000_200_000,
    });
    await waitFor(() => {
      expect(within(dialog).getAllByText("1/1 passing").length).toBeGreaterThan(0);
      expect(blockedRow).toHaveFocus();
    });
    fireEvent.keyDown(dialog, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Pull Requests/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pull Request" })).toHaveTextContent("Stabilize export queue");
    });
  });

  it("opens symbol references and definitions from highlighted code", async () => {
    const user = userEvent.setup();
    renderStackApp();

    await screen.findByText("Core: src/billing");
    await user.click(screen.getAllByRole("button", { name: /checkout.ts/i })[0]);
    await user.click(screen.getByRole("button", { name: /Open symbol references for checkout/i }));

    expect(await screen.findByRole("dialog", { name: /checkout/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Definitions")).toBeInTheDocument();
    expect(screen.getAllByText("src/billing/checkout.ts:1").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Symbol code preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open in diff/i })).toBeInTheDocument();
    expect(screen.getByText(/export function checkout/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /Drill into symbol stack/i })[0]);
    expect(await screen.findByRole("dialog", { name: /stack/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Symbol trail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to checkout in symbol trail/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to stack in symbol trail/i })).toBeInTheDocument();
  });

  it("adds a line comment to the pending review and submits it", async () => {
    const user = userEvent.setup();
    const reviewActionClient = createReviewActionClient();
    renderStackApp({ reviewActionClient });

    await screen.findByText("Core: src/billing");
    await user.click(screen.getAllByRole("button", { name: /checkout.ts/i })[0]);
    await user.click(screen.getAllByRole("button", { name: /comment on src\/billing\/checkout.ts:2/i })[0]);
    expect(screen.getByRole("group", { name: /Draft comment for src\/billing\/checkout.ts:2/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Draft review comment")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Inline draft review comment"), "Please keep this path covered.");
    await user.click(screen.getByRole("button", { name: /add to review/i }));

    await waitFor(() => {
      expect(reviewActionClient.addPendingReviewThread).toHaveBeenCalledWith(
        expect.objectContaining({
          repository: "Resplendent-Data/Narview",
          pullRequestNumber: 42,
          subjectType: "LINE",
          path: "src/billing/checkout.ts",
          body: "Please keep this path covered.",
        }),
      );
    });

    expect(await screen.findByRole("button", { name: /Submit review \(1 comment\)/i })).toBeInTheDocument();
    const commentMarker = screen.getAllByRole("button", { name: /View 1 comment on src\/billing\/checkout.ts:2/i })[0];
    expect(commentMarker).toHaveClass(
      "diff-line-comment-button-visible",
    );
    await user.click(commentMarker);
    expect(screen.getByRole("group", { name: /Comments for src\/billing\/checkout.ts:2/i })).toBeInTheDocument();
    expect(screen.getAllByText("Please keep this path covered.").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Inline draft review comment")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Submit review \(1 comment\)/i }));
    const dialog = await screen.findByRole("dialog", { name: /submit review/i });
    expect(within(dialog).getByText("Please keep this path covered.")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Comment/i })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Request changes/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Approve/i })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Review summary"), "Looks good with one note.");
    await user.click(within(dialog).getByRole("button", { name: /^Submit$/ }));

    await waitFor(() => {
      expect(reviewActionClient.submitPendingReview).toHaveBeenCalledWith(
        expect.objectContaining({
          pullRequestReviewId: "PRR_42",
          event: "COMMENT",
          body: "Looks good with one note.",
        }),
      );
    });
  });

  it("submits an approval without draft review comments", async () => {
    const user = userEvent.setup();
    const reviewActionClient = createReviewActionClient();
    renderStackApp({ reviewActionClient });

    await screen.findByText("Core: src/billing");
    await user.click(screen.getByRole("button", { name: /Submit review \(0 comments\)/i }));
    const dialog = await screen.findByRole("dialog", { name: /submit review/i });
    await user.click(within(dialog).getByRole("radio", { name: /Approve/i }));
    await user.type(within(dialog).getByLabelText("Review summary"), "Lgtm");
    await user.click(within(dialog).getByRole("button", { name: /^Submit$/ }));

    await waitFor(() => {
      expect(reviewActionClient.submitPendingReview).toHaveBeenCalledWith({
        repository: "Resplendent-Data/Narview",
        pullRequestNumber: 42,
        pullRequestReviewId: null,
        event: "APPROVE",
        body: "Lgtm",
      });
    });
  });

  it("reconnects to an existing pending review draft on load", async () => {
    const user = userEvent.setup();
    const findPendingReview = vi.fn().mockResolvedValue({
      pullRequestId: "PR_42",
      pullRequestReviewId: "PRR_existing",
      state: "PENDING",
      message: "Reconnected to pending GitHub review.",
      drafts: [
        {
          id: "PRRC_existing",
          authorLogin: "octocat",
          filePath: "src/billing/checkout.ts",
          line: 2,
          body: "Reloaded **pending** note.\n\n<details>\n<summary>Suggested fix</summary>\n\n```diff\n+ keep coverage\n```\n\n</details>",
          updatedAt: "2026-06-18T12:20:00Z",
          url: "https://github.com/Resplendent-Data/Narview/pull/42#discussion_r2",
        },
      ],
    });

    renderStackApp({ reviewActionClient: { findPendingReview } });

    expect(await screen.findByRole("button", { name: /Submit review \(1 comment\)/i })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /checkout.ts/i })[0]);
    expect(screen.getAllByRole("button", { name: /View 1 comment on src\/billing\/checkout.ts:2/i })[0]).toHaveClass(
      "diff-line-comment-button-visible",
    );
    await user.click(screen.getAllByRole("button", { name: /View 1 comment on src\/billing\/checkout.ts:2/i })[0]);
    const inlineViewer = screen.getByRole("group", { name: /Comments for src\/billing\/checkout.ts:2/i });
    expect(within(inlineViewer).getByText("pending")).toBeInTheDocument();
    expect(within(inlineViewer).getByText("Suggested fix")).toBeInTheDocument();
    expect(within(inlineViewer).getByRole("button", { name: /Copy code/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(findPendingReview).toHaveBeenCalledWith({
        repository: "Resplendent-Data/Narview",
        pullRequestNumber: 42,
      });
    });
  });

  it("shows inline GitHub errors when adding a draft comment fails", async () => {
    const user = userEvent.setup();
    const reviewActionClient = createReviewActionClient({
      addPendingReviewThread: vi.fn().mockRejectedValue(new Error("Line is no longer part of the diff.")),
    });
    renderStackApp({ reviewActionClient });

    await screen.findByText("Core: src/billing");
    await user.click(screen.getAllByRole("button", { name: /checkout.ts/i })[0]);
    await user.click(screen.getAllByRole("button", { name: /comment on src\/billing\/checkout.ts:2/i })[0]);
    await user.type(screen.getByLabelText("Inline draft review comment"), "Please keep this path covered.");
    await user.click(screen.getByRole("button", { name: /add to review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Line is no longer part of the diff.");
    expect(screen.getByLabelText("Inline draft review comment")).toHaveValue("Please keep this path covered.");
    expect(screen.getByRole("button", { name: /Submit review \(0 comments\)/i })).toBeInTheDocument();
  });

  it("keeps external GitHub navigation wired through the opener plugin", async () => {
    renderStackApp();

    await screen.findByText("Core: src/billing");
    await userEvent.click(screen.getByText("GitHub"));

    expect(openUrl).toHaveBeenCalledWith("https://github.com/Resplendent-Data/Narview/pull/42");
  });
});
