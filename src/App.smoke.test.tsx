import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { AppUpdateClient } from "./lib/app-updater";
import type { AuthClient, AuthSession } from "./lib/auth";
import { createCachedPullRequest, type CachedPullRequestData, type CachedReviewThread } from "./lib/pr-cache";
import type {
  AddPendingReviewThreadInput,
  DiscardPendingReviewInput,
  ReviewActionClient,
  SetFileViewedInput,
  SubmitPendingReviewInput,
} from "./lib/review-actions";
import { getPullRequestKey, type ReviewSessionClient } from "./lib/review-session";
import type { ThreadActionClient } from "./lib/thread-actions";
import type { PullRequestSummary, WorkspaceClient, WorkspaceRepository } from "./lib/workspace";

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
  isDraft: false,
  updatedAt: "2026-06-18T12:00:00Z",
  url: "https://github.com/Resplendent-Data/Narview/pull/42",
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

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  localStorageMock.clear();
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
      pullRequestReviewId: input.pullRequestReviewId,
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

function renderStackApp(overrides: {
  authClient?: Partial<AuthClient>;
  workspaceClient?: Partial<WorkspaceClient>;
  reviewActionClient?: Partial<ReviewActionClient>;
  threadActionClient?: Partial<ThreadActionClient>;
} = {}) {
  const clients = {
    authClient: createAuthClient(overrides.authClient),
    workspaceClient: createWorkspaceClient(overrides.workspaceClient),
    reviewActionClient: createReviewActionClient(overrides.reviewActionClient),
    threadActionClient: createThreadActionClient(overrides.threadActionClient),
    reviewSessionClient: createReviewSessionClient(),
    updaterClient: createUpdaterClient(),
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

  it("opens symbol references and definitions from highlighted code", async () => {
    const user = userEvent.setup();
    renderStackApp();

    await screen.findByText("Core: src/billing");
    await user.click(screen.getAllByRole("button", { name: /checkout.ts/i })[0]);
    await user.click(screen.getByRole("button", { name: /Open symbol references for checkout/i }));

    expect(await screen.findByRole("dialog", { name: /checkout/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Definitions")).toBeInTheDocument();
    expect(screen.getByText("src/billing/checkout.ts:1")).toBeInTheDocument();
  });

  it("adds a line comment to the pending review and submits it", async () => {
    const user = userEvent.setup();
    const reviewActionClient = createReviewActionClient();
    renderStackApp({ reviewActionClient });

    await screen.findByText("Core: src/billing");
    await user.click(screen.getAllByRole("button", { name: /checkout.ts/i })[0]);
    await user.click(screen.getAllByRole("button", { name: /comment on src\/billing\/checkout.ts:2/i })[0]);
    await user.type(screen.getByLabelText("Draft review comment"), "Please keep this path covered.");
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

    await user.click(screen.getByRole("button", { name: /^Submit$/ }));
    const dialog = await screen.findByRole("dialog", { name: /submit review/i });
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

  it("keeps external GitHub navigation wired through the opener plugin", async () => {
    renderStackApp();

    await screen.findByText("Core: src/billing");
    await userEvent.click(screen.getByText("GitHub"));

    expect(openUrl).toHaveBeenCalledWith("https://github.com/Resplendent-Data/Narview/pull/42");
  });
});
