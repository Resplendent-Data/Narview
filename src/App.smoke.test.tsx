import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import type { AuthClient, AuthSession } from "./lib/auth";
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

    expect(await screen.findByText("Add checkout guard")).toBeInTheDocument();
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
});
