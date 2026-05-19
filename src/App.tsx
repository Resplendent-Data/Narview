import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  ChevronRight,
  Command,
  Eye,
  FileCode2,
  Github,
  GitPullRequest,
  Keyboard,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Kbd } from "./components/ui/kbd";
import { type AuthClient, type AuthSession, type OAuthStartResponse, tauriAuthClient } from "./lib/auth";
import {
  buildIncrementalFetchPlan,
  cacheStats,
  clearFetchedGithubData,
  readCacheStore,
  readCachedPullRequest,
  setCachedPullRequestPinned,
  upsertCachedPullRequest,
  type CachedPullRequestData,
  type CachedReviewThread,
  type CacheStats,
} from "./lib/pr-cache";
import { buildReviewOverview, type RepositoryHotspotOverride } from "./lib/review-overview";
import {
  buildReviewQueueCounts,
  buildReviewThreadViews,
  defaultReviewQueueFilters,
  filterReviewThreads,
  readReviewQueueStore,
  setReviewThreadReviewed,
  syncReviewThreads,
  type ReviewOriginFilter,
  type ReviewQueueFilters,
  type ReviewReviewedFilter,
  type ReviewStateFilter,
} from "./lib/review-queue";
import {
  getPullRequestKey,
  localReviewSessionClient,
  parsePullRequestUrl,
  type ReviewSessionClient,
  type ReviewSessionSnapshot,
} from "./lib/review-session";
import {
  tauriThreadActionClient,
  type ThreadActionClient,
  type ThreadActionResult,
  type ThreadWriteAction,
} from "./lib/thread-actions";
import { cn } from "./lib/utils";
import {
  idleRefreshStatus,
  type PullRequestSummary,
  type RefreshStatus,
  type WorkspaceClient,
  type WorkspaceRepository,
  tauriWorkspaceClient,
} from "./lib/workspace";

type Theme = "light" | "dark";

type AppProps = {
  authClient?: AuthClient;
  workspaceClient?: WorkspaceClient;
  reviewSessionClient?: ReviewSessionClient;
  threadActionClient?: ThreadActionClient;
};

type QueueButton = {
  id: string;
  label: string;
  count: number;
  tone: "danger" | "warning" | "info" | "muted";
  filters: ReviewQueueFilters;
};

const checkingSession: AuthSession = {
  state: "checking",
  storage: {
    available: true,
    message: null,
  },
  accountLogin: null,
  tokenHint: null,
};

const files = [
  { path: "src/auth/session.ts", status: "modified", lines: "+128 -86", viewed: false },
  { path: "src/review/queue.ts", status: "modified", lines: "+94 -21", viewed: true },
  { path: "src-tauri/src/github.rs", status: "added", lines: "+188", viewed: false },
  { path: "assets/review-map.png", status: "binary", lines: "binary", viewed: false },
];

const selectedThread = {
  author: "coderabbitai",
  title: "Guard stale session reuse after token rotation",
  file: "src/auth/session.ts",
  line: 142,
  state: "Unresolved",
  reviewed: false,
  outdated: false,
  body:
    "The rotated token path can still reuse the previous session cache entry. Consider invalidating the session record before returning the new credential.",
};

const commands = [
  { label: "Next review thread", shortcut: "J" },
  { label: "Mark thread reviewed", shortcut: "R" },
  { label: "Resolve thread", shortcut: "E" },
  { label: "Toggle focus mode", shortcut: "F" },
  { label: "Copy handoff packet", shortcut: "H" },
];

const fallbackPullRequest: PullRequestSummary = {
  repository: "acme/payments-web",
  number: 482,
  title: selectedThread.title,
  authorLogin: "coderabbitai",
  isDraft: false,
  updatedAt: "2026-05-18T12:00:00Z",
  url: "https://github.com/acme/payments-web/pull/482",
};

const repositoryHotspotOverrides: Record<string, RepositoryHotspotOverride> = {
  "acme/payments-web": {
    weights: {
      unresolvedThreads: 0.45,
    },
    criticalPathPatterns: ["auth", "session", "migration", "schema", "payment", "billing"],
  },
};

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getAuthBadge(session: AuthSession) {
  if (session.state === "signed-in") {
    return { label: "Signed in", variant: "success" as const };
  }
  if (session.state === "storage-unavailable") {
    return { label: "Secure storage unavailable", variant: "warning" as const };
  }
  if (session.state === "checking") {
    return { label: "Checking session", variant: "muted" as const };
  }
  return { label: "Signed out", variant: "muted" as const };
}

function getRefreshBadge(status: RefreshStatus) {
  if (status.state === "fresh") {
    return { label: "Fresh", variant: "success" as const };
  }
  if (status.state === "loading") {
    return { label: "Refreshing", variant: "info" as const };
  }
  if (status.state === "rate-limited") {
    return { label: "Rate limited", variant: "warning" as const };
  }
  if (status.state === "stale") {
    return { label: "Stale", variant: "warning" as const };
  }
  if (status.state === "failed") {
    return { label: "Failed", variant: "danger" as const };
  }
  return { label: "Idle", variant: "muted" as const };
}

function getReadinessBadge(state: "ready" | "attention" | "blocked") {
  if (state === "ready") {
    return { label: "Ready", variant: "success" as const };
  }
  if (state === "blocked") {
    return { label: "Blocked", variant: "danger" as const };
  }
  return { label: "Attention", variant: "warning" as const };
}

function getCheckBadge(status: string, conclusion: string | null) {
  if (status !== "completed") {
    return { label: status === "queued" ? "Queued" : "Running", variant: "warning" as const };
  }
  if (conclusion === "success") {
    return { label: "Passing", variant: "success" as const };
  }
  if (!conclusion) {
    return { label: "Completed", variant: "muted" as const };
  }
  return { label: conclusion.replace("-", " "), variant: "danger" as const };
}

function getThreadStateLabel(state: "unresolved" | "resolved" | "outdated") {
  if (state === "unresolved") {
    return "Unresolved";
  }
  if (state === "resolved") {
    return "Resolved";
  }
  return "Outdated";
}

function getThreadTitle(body: string) {
  const firstLine = body.split("\n")[0]?.trim() ?? "";
  const firstSentence = firstLine.split(".")[0]?.trim() ?? "";
  return firstSentence.length > 0 ? firstSentence.slice(0, 96) : "Review thread";
}

function filtersMatch(left: ReviewQueueFilters, right: ReviewQueueFilters) {
  return left.origin === right.origin && left.reviewed === right.reviewed && left.state === right.state;
}

function createOverviewCache(pullRequest: PullRequestSummary, cached?: CachedPullRequestData): CachedPullRequestData {
  const normalizedCached = cached
    ? {
        ...cached,
        reviewThreads: cached.reviewThreads ?? [],
        fileSummaries: cached.fileSummaries ?? [],
        checks: cached.checks ?? [],
      }
    : null;

  if (
    normalizedCached &&
    (normalizedCached.fileSummaries.length > 0 ||
      normalizedCached.reviewThreads.length > 0 ||
      normalizedCached.checks.length > 0)
  ) {
    return normalizedCached;
  }

  return {
    pullRequest,
    metadata: {
      title: pullRequest.title,
      description: "Remote-first PR review workspace shell with deterministic overview signals.",
      repository: pullRequest.repository,
      number: pullRequest.number,
      authorLogin: pullRequest.authorLogin,
      baseBranch: "main",
      headBranch: "feature/review-workspace",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "REVIEW_REQUIRED",
      url: pullRequest.url,
      isDraft: pullRequest.isDraft,
      updatedAt: pullRequest.updatedAt,
    },
    reviewThreads: [
      {
        id: "thread-1",
        authorLogin: selectedThread.author,
        filePath: selectedThread.file,
        line: selectedThread.line,
        state: "unresolved",
        body: selectedThread.body,
        updatedAt: pullRequest.updatedAt,
      },
      {
        id: "thread-2",
        authorLogin: "monalisa",
        filePath: "src/review/queue.ts",
        line: 88,
        state: "resolved",
        body: "The queue filter path should keep resolved review threads available for audit, even after GitHub marks them resolved.",
        updatedAt: pullRequest.updatedAt,
      },
      {
        id: "thread-3",
        authorLogin: "hubot",
        filePath: "src-tauri/src/github.rs",
        line: 44,
        state: "outdated",
        body: "This review comment points at an older diff hunk and should stay visible as outdated context.",
        updatedAt: pullRequest.updatedAt,
      },
    ],
    fileSummaries: files.map((file) => ({
      path: file.path,
      additions: Number(file.lines.match(/\+(\d+)/)?.[1] ?? 0),
      deletions: Number(file.lines.match(/-(\d+)/)?.[1] ?? 0),
      status: file.status === "binary" ? "binary" : file.status === "added" ? "added" : "modified",
    })),
    checks: [
      {
        name: "build",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/acme/payments-web/actions/runs/1001",
        startedAt: "2026-05-18T12:01:00Z",
        completedAt: "2026-05-18T12:03:15Z",
      },
      {
        name: "unit tests",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/acme/payments-web/actions/runs/1002",
        startedAt: "2026-05-18T12:02:00Z",
        completedAt: "2026-05-18T12:06:28Z",
      },
      {
        name: "lint",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/acme/payments-web/actions/runs/1003",
        startedAt: "2026-05-18T12:02:30Z",
        completedAt: "2026-05-18T12:03:34Z",
      },
      {
        name: "preview",
        status: "in-progress",
        conclusion: null,
        url: "https://github.com/acme/payments-web/actions/runs/1004",
        startedAt: "2026-05-18T12:04:00Z",
        completedAt: null,
      },
    ],
    rateLimit: {
      remaining: null,
      resetEpochSeconds: null,
    },
    fetchedAtEpochMs: Date.now(),
    lastAccessedEpochMs: Date.now(),
    pinned: cached?.pinned ?? false,
  };
}

export function App({
  authClient = tauriAuthClient,
  workspaceClient = tauriWorkspaceClient,
  reviewSessionClient = localReviewSessionClient,
  threadActionClient = tauriThreadActionClient,
}: AppProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [focusMode, setFocusMode] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession>(checkingSession);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [oauthFlow, setOauthFlow] = useState<OAuthStartResponse | null>(null);
  const [repositories, setRepositories] = useState<WorkspaceRepository[]>([]);
  const [repositoryInput, setRepositoryInput] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [quickOpenedPullRequest, setQuickOpenedPullRequest] = useState<PullRequestSummary | null>(null);
  const [quickOpenInput, setQuickOpenInput] = useState("");
  const [quickOpenError, setQuickOpenError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [selectedPullRequestKey, setSelectedPullRequestKey] = useState<string | null>(null);
  const [selectedReviewThreadId, setSelectedReviewThreadId] = useState<string | null>(null);
  const [reviewQueueFilters, setReviewQueueFilters] = useState<ReviewQueueFilters>(defaultReviewQueueFilters);
  const [reviewQueueRevision, setReviewQueueRevision] = useState(0);
  const [threadStateOverrides, setThreadStateOverrides] = useState<Record<string, CachedReviewThread["state"]>>({});
  const [replyDraft, setReplyDraft] = useState("");
  const [threadActionBusy, setThreadActionBusy] = useState<ThreadWriteAction | null>(null);
  const [threadActionResult, setThreadActionResult] = useState<ThreadActionResult | null>(null);
  const [selectedBulkThreadIds, setSelectedBulkThreadIds] = useState<string[]>([]);
  const [bulkUndo, setBulkUndo] = useState<{ message: string; previousReviewed: Record<string, boolean> } | null>(null);
  const [bulkActionResult, setBulkActionResult] = useState<{
    action: "resolve" | "unresolve";
    message: string;
    successes: string[];
    failures: { id: string; message: string; retryable: boolean }[];
  } | null>(null);
  const [bulkConfirmAction, setBulkConfirmAction] = useState<"resolve" | "unresolve" | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>(idleRefreshStatus);
  const [cacheSummary, setCacheSummary] = useState<CacheStats>(() => cacheStats());
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const currentUserKey = authSession.accountLogin ?? "local-user";
  const routedPullRequests = useMemo(() => {
    if (!quickOpenedPullRequest) {
      return pullRequests;
    }

    const quickOpenKey = getPullRequestKey(quickOpenedPullRequest);
    return [
      quickOpenedPullRequest,
      ...pullRequests.filter((pullRequest) => getPullRequestKey(pullRequest) !== quickOpenKey),
    ];
  }, [pullRequests, quickOpenedPullRequest]);
  const selectedPullRequest =
    routedPullRequests.find((pullRequest) => getPullRequestKey(pullRequest) === selectedPullRequestKey) ??
    routedPullRequests[0] ??
    fallbackPullRequest;
  const selectedPullRequestDisplay = `${selectedPullRequest.repository} #${selectedPullRequest.number}`;
  const activePullRequestKey = routedPullRequests.length > 0 ? getPullRequestKey(selectedPullRequest) : null;
  const selectedCacheEntry = activePullRequestKey ? readCacheStore().entries[activePullRequestKey] : null;
  const selectedPullRequestPinned = selectedCacheEntry?.pinned ?? false;
  const reviewOverviewCache = createOverviewCache(selectedPullRequest, selectedCacheEntry ?? undefined);
  const reviewOverview = buildReviewOverview(
    reviewOverviewCache,
    repositoryHotspotOverrides[selectedPullRequest.repository],
  );
  const readinessBadge = getReadinessBadge(reviewOverview.readiness.state);
  const reviewThreadSignature = reviewOverviewCache.reviewThreads
    .map((thread) => `${thread.id}:${thread.state}:${thread.updatedAt}`)
    .join("|");
  const reviewQueueStore = useMemo(() => readReviewQueueStore(), [reviewQueueRevision]);
  const baseReviewThreadViews = buildReviewThreadViews(
    currentUserKey,
    getPullRequestKey(selectedPullRequest),
    reviewOverviewCache.reviewThreads,
    reviewQueueStore,
  );
  const reviewThreadViews = baseReviewThreadViews.map((view) => {
    const stateOverride = threadStateOverrides[view.id];
    if (!stateOverride) {
      return view;
    }

    return {
      ...view,
      outdated: stateOverride === "outdated",
      thread: {
        ...view.thread,
        state: stateOverride,
      },
    };
  });
  const filteredReviewThreads = filterReviewThreads(reviewThreadViews, reviewQueueFilters);
  const reviewQueueCounts = buildReviewQueueCounts(reviewThreadViews);
  const queueButtons: QueueButton[] = [
    {
      id: "needs-attention",
      label: "Needs attention",
      count: reviewQueueCounts.needsAttention,
      tone: "danger" as const,
      filters: { origin: "all", reviewed: "unreviewed", state: "current" } satisfies ReviewQueueFilters,
    },
    {
      id: "coderabbit",
      label: "CodeRabbit",
      count: reviewQueueCounts.coderabbit,
      tone: "warning" as const,
      filters: { origin: "coderabbit", reviewed: "all", state: "all" } satisfies ReviewQueueFilters,
    },
    {
      id: "humans",
      label: "Human threads",
      count: reviewQueueCounts.humans,
      tone: "info" as const,
      filters: { origin: "human", reviewed: "all", state: "all" } satisfies ReviewQueueFilters,
    },
    {
      id: "resolved-unreviewed",
      label: "Resolved + unreviewed",
      count: reviewQueueCounts.resolvedUnreviewed,
      tone: "muted" as const,
      filters: { origin: "all", reviewed: "unreviewed", state: "resolved" } satisfies ReviewQueueFilters,
    },
  ];
  const activeQueue =
    queueButtons.find((queue) => filtersMatch(queue.filters, reviewQueueFilters)) ??
    ({
      id: "custom",
      label: "Custom",
      count: filteredReviewThreads.length,
      tone: "info" as const,
      filters: reviewQueueFilters,
    } satisfies QueueButton);
  const selectedReviewThread =
    reviewThreadViews.find((view) => view.id === selectedReviewThreadId) ??
    filteredReviewThreads[0] ??
    reviewThreadViews[0] ??
    null;
  const selectedBulkThreadSet = new Set(selectedBulkThreadIds);
  const selectedBulkThreads = reviewThreadViews.filter((view) => selectedBulkThreadSet.has(view.id));
  const retryableBulkFailureIds = bulkActionResult?.failures.filter((failure) => failure.retryable).map((failure) => failure.id) ?? [];
  const allFilteredThreadsSelected =
    filteredReviewThreads.length > 0 && filteredReviewThreads.every((view) => selectedBulkThreadSet.has(view.id));
  const selectedReviewThreadIndex = selectedReviewThread
    ? Math.max(filteredReviewThreads.findIndex((view) => view.id === selectedReviewThread.id), 0)
    : 0;
  const activeThread = selectedReviewThread?.thread ?? null;
  const activeThreadAuthor = activeThread?.authorLogin ?? selectedThread.author;
  const activeThreadFile = activeThread?.filePath ?? selectedThread.file;
  const activeThreadLine = activeThread?.line ?? selectedThread.line;
  const activeThreadState = activeThread?.state ?? "unresolved";
  const activeThreadStateLabel = activeThread ? getThreadStateLabel(activeThread.state) : selectedThread.state;
  const activeThreadTitle = activeThread ? getThreadTitle(activeThread.body) : selectedThread.title;
  const activeThreadBody = activeThread?.body ?? selectedThread.body;
  const threadResolveAction: ThreadWriteAction = activeThreadState === "resolved" ? "unresolve" : "resolve";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    let active = true;

    authClient
      .getStatus()
      .then((session) => {
        if (active) {
          setAuthSession(session);
        }
      })
      .catch((error) => {
        if (active) {
          setAuthError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, [authClient]);

  useEffect(() => {
    let active = true;

    workspaceClient
      .listRepositories()
      .then((response) => {
        if (active) {
          setRepositories(response.repositories);
        }
      })
      .catch((error) => {
        if (active) {
          setWorkspaceError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, [workspaceClient]);

  useEffect(() => {
    if (authSession.state === "signed-in" && repositories.length > 0) {
      void refreshPullRequests(includeDrafts);
    }
  }, [authSession.state, repositories.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCommandPalette) {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "f") {
        setFocusMode((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (authSession.state === "checking" || activePullRequestKey) {
      return;
    }

    let active = true;
    reviewSessionClient.loadLastSession(currentUserKey).then((restored) => {
      if (!active || !restored) {
        return;
      }

      setQuickOpenedPullRequest(restored.pullRequest);
      setSelectedPullRequestKey(getPullRequestKey(restored.pullRequest));
      applyReviewSession(restored.snapshot);
      setSessionNotice("Restored last Review Session.");
    });

    return () => {
      active = false;
    };
  }, [activePullRequestKey, authSession.state, currentUserKey, reviewSessionClient]);

  useEffect(() => {
    if (!activePullRequestKey || routedPullRequests.length === 0) {
      return;
    }

    void reviewSessionClient.saveSession(currentUserKey, selectedPullRequest, buildReviewSessionSnapshot());
  }, [
    activePullRequestKey,
    currentUserKey,
    focusMode,
    includeDrafts,
    reviewSessionClient,
    routedPullRequests.length,
    selectedReviewThread?.id,
  ]);

  useEffect(() => {
    if (!activePullRequestKey || routedPullRequests.length === 0) {
      return;
    }

    const existing = readCachedPullRequest(activePullRequestKey);
    upsertCachedPullRequest(selectedPullRequest, {
      pinned: existing?.pinned ?? false,
      rateLimit: existing?.rateLimit,
      reviewThreads: existing?.reviewThreads,
      fileSummaries: existing?.fileSummaries,
      checks: existing?.checks,
    });
    setCacheSummary(cacheStats());
    setCacheMessage(existing ? "Offline cache ready." : "Cached Pull Request metadata.");
  }, [activePullRequestKey, routedPullRequests.length, selectedPullRequest]);

  useEffect(() => {
    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
    setReviewQueueRevision((current) => current + 1);
  }, [currentUserKey, reviewThreadSignature, selectedPullRequest]);

  useEffect(() => {
    setThreadActionResult(null);
  }, [selectedReviewThread?.id]);

  const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const authBadge = getAuthBadge(authSession);
  const signInDisabled = authBusy || authSession.state === "storage-unavailable";

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const flow = await authClient.startSignIn();
      setOauthFlow(flow);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePollSignIn = async () => {
    if (!oauthFlow) {
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = await authClient.pollSignIn(oauthFlow.flowId);
      if (response.session) {
        setAuthSession(response.session);
      }
      if (response.state === "authorized") {
        setOauthFlow(null);
      } else if (response.message) {
        setAuthError(response.message);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      setAuthSession(await authClient.signOut());
      setOauthFlow(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  };

  function buildReviewSessionSnapshot(): ReviewSessionSnapshot {
    return {
      activeQueueId: activeQueue.id,
      includeDrafts,
      focusMode,
      threadKey: selectedReviewThread?.id ?? `${selectedThread.author}:${selectedThread.file}:${selectedThread.line}`,
      filePath: activeThreadFile,
      nearbyLine: activeThreadLine ?? selectedThread.line,
      updatedAtEpochMs: Date.now(),
    };
  }

  function applyReviewSession(snapshot: ReviewSessionSnapshot) {
    setIncludeDrafts(snapshot.includeDrafts);
    setFocusMode(snapshot.focusMode);
    setSelectedReviewThreadId(snapshot.threadKey);
  }

  async function restoreReviewSessionFor(pullRequest: PullRequestSummary) {
    const restored = await reviewSessionClient.loadSession(currentUserKey, getPullRequestKey(pullRequest));

    if (restored) {
      applyReviewSession(restored.snapshot);
      setSessionNotice(`Restored ${pullRequest.repository} #${pullRequest.number}.`);
    } else {
      setSessionNotice(`Started ${pullRequest.repository} #${pullRequest.number}.`);
    }
  }

  async function handleSelectPullRequest(pullRequest: PullRequestSummary) {
    setSelectedPullRequestKey(getPullRequestKey(pullRequest));
    await restoreReviewSessionFor(pullRequest);
  }

  const handleQuickOpenPullRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuickOpenError(null);
    setSessionNotice(null);

    try {
      const pullRequest = parsePullRequestUrl(quickOpenInput);
      setQuickOpenedPullRequest(pullRequest);
      setSelectedPullRequestKey(getPullRequestKey(pullRequest));
      setQuickOpenInput("");
      await restoreReviewSessionFor(pullRequest);
    } catch (error) {
      setQuickOpenError(error instanceof Error ? error.message : String(error));
    }
  };

  async function refreshPullRequests(nextIncludeDrafts = includeDrafts) {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    setRefreshStatus({
      state: "loading",
      message: "Refreshing open pull requests from GitHub.",
      rateLimitResetEpochSeconds: null,
      refreshedAtEpochSeconds: refreshStatus.refreshedAtEpochSeconds,
    });

    try {
      const response = await workspaceClient.refreshPullRequests(nextIncludeDrafts);
      setRepositories(response.repositories);
      setPullRequests(response.pullRequests);
      setRefreshStatus((current) => {
        if (response.status.state === "failed" && pullRequests.length > 0) {
          return {
            ...response.status,
            state: "stale",
            message: response.status.message ?? current.message,
          };
        }
        return response.status;
      });
      setSelectedPullRequestKey((current) => {
        if (current && response.pullRequests.some((pullRequest) => getPullRequestKey(pullRequest) === current)) {
          return current;
        }
        return response.pullRequests[0] ? getPullRequestKey(response.pullRequests[0]) : null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkspaceError(message);
      setRefreshStatus({
        state: pullRequests.length > 0 ? "stale" : "failed",
        message,
        rateLimitResetEpochSeconds: null,
        refreshedAtEpochSeconds: refreshStatus.refreshedAtEpochSeconds,
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  const handleSaveRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repositoryInput.trim()) {
      return;
    }

    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const response = await workspaceClient.saveRepository(repositoryInput);
      setRepositories(response.repositories);
      setRepositoryInput("");
      if (authSession.state === "signed-in") {
        await refreshPullRequests(includeDrafts);
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleRemoveRepository = async (repository: WorkspaceRepository) => {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      const response = await workspaceClient.removeRepository(repository.owner, repository.name);
      setRepositories(response.repositories);
      setPullRequests((current) => current.filter((pullRequest) => pullRequest.repository !== repository.slug));
      setSelectedPullRequestKey((current) => {
        if (!current?.startsWith(`${repository.slug}#`)) {
          return current;
        }
        return null;
      });
      if (response.repositories.length === 0) {
        setRefreshStatus(idleRefreshStatus);
      } else if (authSession.state === "signed-in") {
        await refreshPullRequests(includeDrafts);
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleDraftFilterChange = async (checked: boolean) => {
    setIncludeDrafts(checked);
    if (authSession.state === "signed-in" && repositories.length > 0) {
      await refreshPullRequests(checked);
    }
  };

  const handleTogglePin = () => {
    if (!activePullRequestKey || !selectedCacheEntry) {
      return;
    }

    setCachedPullRequestPinned(activePullRequestKey, !selectedPullRequestPinned);
    setCacheSummary(cacheStats());
    setCacheMessage(!selectedPullRequestPinned ? "Pinned cache entry." : "Unpinned cache entry.");
  };

  const handleClearCache = () => {
    clearFetchedGithubData();
    setCacheSummary(cacheStats());
    setCacheMessage("Cleared fetched GitHub cache. Review Session state stays local.");
  };

  const updateReviewQueueFilter = <Key extends keyof ReviewQueueFilters>(
    key: Key,
    value: ReviewQueueFilters[Key],
  ) => {
    setReviewQueueFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyReviewQueueFilters = (filters: ReviewQueueFilters) => {
    setReviewQueueFilters(filters);
  };

  const handleSetSelectedThreadReviewed = (reviewed: boolean) => {
    if (!selectedReviewThread) {
      return;
    }

    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
    setReviewThreadReviewed(currentUserKey, selectedReviewThread.id, reviewed);
    setReviewQueueRevision((current) => current + 1);
  };

  const runThreadAction = async (action: ThreadWriteAction) => {
    if (!selectedReviewThread) {
      return;
    }

    setThreadActionBusy(action);
    setThreadActionResult(null);

    try {
      const result =
        action === "reply"
          ? await threadActionClient.reply(selectedReviewThread.id, replyDraft)
          : action === "resolve"
            ? await threadActionClient.resolve(selectedReviewThread.id)
            : await threadActionClient.unresolve(selectedReviewThread.id);

      setThreadActionResult(result);

      if (result.ok && action === "reply") {
        setReplyDraft("");
      }
      if (result.ok && action === "resolve") {
        syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
        setReviewThreadReviewed(currentUserKey, selectedReviewThread.id, true);
        setThreadStateOverrides((current) => ({
          ...current,
          [selectedReviewThread.id]: "resolved",
        }));
        setReviewQueueRevision((current) => current + 1);
      }
      if (result.ok && action === "unresolve") {
        setThreadStateOverrides((current) => ({
          ...current,
          [selectedReviewThread.id]: "unresolved",
        }));
      }
    } finally {
      setThreadActionBusy(null);
    }
  };

  const toggleBulkThreadSelection = (threadId: string, selected: boolean) => {
    setSelectedBulkThreadIds((current) =>
      selected ? Array.from(new Set([...current, threadId])) : current.filter((id) => id !== threadId),
    );
    setBulkUndo(null);
    setBulkActionResult(null);
  };

  const toggleAllFilteredThreadSelection = (selected: boolean) => {
    setSelectedBulkThreadIds((current) => {
      if (!selected) {
        const visible = new Set(filteredReviewThreads.map((view) => view.id));
        return current.filter((id) => !visible.has(id));
      }

      return Array.from(new Set([...current, ...filteredReviewThreads.map((view) => view.id)]));
    });
    setBulkUndo(null);
    setBulkActionResult(null);
  };

  const applyBulkReviewedState = (reviewed: boolean) => {
    if (selectedBulkThreads.length === 0) {
      return;
    }

    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);

    const previousReviewed = Object.fromEntries(selectedBulkThreads.map((view) => [view.id, view.reviewed]));
    for (const view of selectedBulkThreads) {
      setReviewThreadReviewed(currentUserKey, view.id, reviewed);
    }

    setBulkUndo({
      message: `Marked ${selectedBulkThreads.length} thread${selectedBulkThreads.length === 1 ? "" : "s"} ${reviewed ? "reviewed" : "unreviewed"}.`,
      previousReviewed,
    });
    setBulkActionResult(null);
    setReviewQueueRevision((current) => current + 1);
  };

  const undoBulkReviewedState = () => {
    if (!bulkUndo) {
      return;
    }

    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
    for (const [threadId, reviewed] of Object.entries(bulkUndo.previousReviewed)) {
      setReviewThreadReviewed(currentUserKey, threadId, reviewed);
    }
    setBulkUndo(null);
    setReviewQueueRevision((current) => current + 1);
  };

  const runConfirmedBulkThreadAction = async () => {
    if (!bulkConfirmAction || selectedBulkThreads.length === 0) {
      return;
    }

    const action = bulkConfirmAction;
    setBulkConfirmAction(null);
    setBulkActionResult(null);
    setThreadActionBusy(action);

    try {
      const results = await Promise.all(
        selectedBulkThreads.map((view) =>
          action === "resolve" ? threadActionClient.resolve(view.id) : threadActionClient.unresolve(view.id),
        ),
      );
      const successes = results.filter((result) => result.ok).map((result) => result.threadId);
      const failures = results
        .filter((result): result is Extract<ThreadActionResult, { ok: false }> => !result.ok)
        .map((result) => ({
          id: result.threadId,
          message: result.message,
          retryable: result.retryable,
        }));

      if (successes.length > 0) {
        syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
      }
      for (const threadId of successes) {
        if (action === "resolve") {
          setReviewThreadReviewed(currentUserKey, threadId, true);
        }
        setThreadStateOverrides((current) => ({
          ...current,
          [threadId]: action === "resolve" ? "resolved" : "unresolved",
        }));
      }

      setBulkActionResult({
        action,
        message: `${successes.length} succeeded, ${failures.length} failed.`,
        successes,
        failures,
      });
      setReviewQueueRevision((current) => current + 1);
    } finally {
      setThreadActionBusy(null);
    }
  };

  const refreshBadge = getRefreshBadge(refreshStatus);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GitPullRequest className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">Narview</h1>
            <p className="mt-1 text-xs text-muted-foreground">{selectedPullRequestDisplay}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden min-w-0 items-center gap-2 sm:flex" aria-label="GitHub session">
            {authSession.state === "signed-in" ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
            )}
            <Badge variant={authBadge.variant}>{authBadge.label}</Badge>
            {authSession.accountLogin && <span className="max-w-28 truncate text-xs text-muted-foreground">@{authSession.accountLogin}</span>}
          </div>
          {authSession.state === "signed-in" ? (
            <Button variant="outline" size="sm" onClick={handleSignOut} disabled={authBusy}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleSignIn} disabled={signInDisabled}>
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Sign in
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}>
            <Command className="h-3.5 w-3.5" aria-hidden="true" />
            Command
            <Kbd>⌘K</Kbd>
          </Button>
          <Button variant="ghost" size="icon" aria-label={themeLabel} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </header>

      <main
        className={cn(
          "grid h-[calc(100vh-3rem)] min-h-[680px]",
          focusMode ? "grid-cols-[1fr]" : "grid-cols-[360px_minmax(520px,1fr)_340px]",
        )}
      >
        {!focusMode && (
          <aside aria-label="Review map" className="border-r border-border bg-card/40">
            <section className="border-b border-border p-3" aria-label="Workspace repositories">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Workspace</h2>
                <Badge variant={refreshBadge.variant}>{refreshBadge.label}</Badge>
              </div>
              <form className="flex gap-2" onSubmit={handleSaveRepository}>
                <input
                  aria-label="Repository slug"
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setRepositoryInput(event.target.value)}
                  placeholder="owner/repo"
                  value={repositoryInput}
                />
                <Button size="sm" type="submit" disabled={workspaceBusy || !repositoryInput.trim()}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Save
                </Button>
              </form>
              <form className="mt-2 flex gap-2" onSubmit={handleQuickOpenPullRequest} aria-label="Quick open Pull Request">
                <input
                  aria-label="Pull Request URL"
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setQuickOpenInput(event.target.value)}
                  placeholder="github.com/owner/repo/pull/123"
                  value={quickOpenInput}
                />
                <Button size="sm" variant="outline" type="submit" disabled={!quickOpenInput.trim()}>
                  <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                  Open
                </Button>
              </form>
              {quickOpenError && <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{quickOpenError}</p>}
              {sessionNotice && <p className="mt-2 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">{sessionNotice}</p>}
              <div className="mt-2 space-y-1">
                {repositories.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">No saved repositories.</p>
                ) : (
                  repositories.map((repository) => (
                    <div className="flex h-8 items-center gap-2 rounded-md border border-border px-2" key={repository.slug}>
                      <Github className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm">{repository.slug}</span>
                      <button
                        aria-label={`Remove ${repository.slug}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        disabled={workspaceBusy}
                        onClick={() => void handleRemoveRepository(repository)}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <input
                    checked={includeDrafts}
                    className="h-4 w-4 accent-primary"
                    onChange={(event) => void handleDraftFilterChange(event.target.checked)}
                    type="checkbox"
                  />
                  Include draft Pull Requests
                </label>
                <Button size="sm" variant="outline" onClick={() => void refreshPullRequests(includeDrafts)} disabled={workspaceBusy || repositories.length === 0}>
                  <RefreshCw className={cn("h-3.5 w-3.5", workspaceBusy && "animate-spin")} aria-hidden="true" />
                  Refresh
                </Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground" role="status">
                {refreshStatus.message}
                {refreshStatus.rateLimitResetEpochSeconds ? ` Reset ${refreshStatus.rateLimitResetEpochSeconds}.` : ""}
              </p>
              {workspaceError && <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{workspaceError}</p>}
            </section>

            <section className="border-b border-border p-3" aria-label="Open Pull Requests">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Open Pull Requests</h2>
                <Badge variant="info">{routedPullRequests.length}</Badge>
              </div>
              <div className="max-h-56 space-y-1 overflow-auto">
                {routedPullRequests.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">Refresh saved repositories to load open Pull Requests.</p>
                ) : (
                  routedPullRequests.map((pullRequest) => {
                    const isSelected = getPullRequestKey(pullRequest) === getPullRequestKey(selectedPullRequest);

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={cn(
                          "w-full rounded-md border border-border p-2 text-left hover:bg-accent",
                          isSelected && "border-primary bg-accent text-accent-foreground",
                        )}
                        key={getPullRequestKey(pullRequest)}
                        onClick={() => void handleSelectPullRequest(pullRequest)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium">{pullRequest.title}</span>
                          {pullRequest.isDraft && <Badge variant="warning">Draft</Badge>}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0 truncate">{pullRequest.repository} #{pullRequest.number}</span>
                          {pullRequest.authorLogin && <span className="shrink-0">@{pullRequest.authorLogin}</span>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="border-b border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Review queues</h2>
                <Badge variant={activeQueue.tone}>{activeQueue.count}</Badge>
              </div>
              <div className="space-y-1">
                {queueButtons.map((queue) => (
                  <button
                    className={cn(
                      "flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent",
                      queue.id === activeQueue.id && "bg-accent text-accent-foreground",
                    )}
                    key={queue.id}
                    onClick={() => applyReviewQueueFilters(queue.filters)}
                    type="button"
                  >
                    <span>{queue.label}</span>
                    <Badge variant={queue.tone}>{queue.count}</Badge>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-muted-foreground">Source</span>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => updateReviewQueueFilter("origin", event.target.value as ReviewOriginFilter)}
                    value={reviewQueueFilters.origin}
                  >
                    <option value="all">All</option>
                    <option value="coderabbit">CodeRabbit</option>
                    <option value="human">Human</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Reviewed</span>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => updateReviewQueueFilter("reviewed", event.target.value as ReviewReviewedFilter)}
                    value={reviewQueueFilters.reviewed}
                  >
                    <option value="all">All</option>
                    <option value="unreviewed">Unreviewed</option>
                    <option value="reviewed">Reviewed</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">State</span>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => updateReviewQueueFilter("state", event.target.value as ReviewStateFilter)}
                    value={reviewQueueFilters.state}
                  >
                    <option value="all">All</option>
                    <option value="unresolved">Unresolved</option>
                    <option value="resolved">Resolved</option>
                    <option value="outdated">Outdated</option>
                    <option value="current">Current</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="border-b border-border p-3" aria-label="Review thread queue">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Threads</h2>
                <Badge variant="info">{filteredReviewThreads.length}</Badge>
              </div>
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    checked={allFilteredThreadsSelected}
                    className="h-4 w-4 accent-primary"
                    onChange={(event) => toggleAllFilteredThreadSelection(event.target.checked)}
                    type="checkbox"
                  />
                  Select visible
                </label>
                {selectedBulkThreadIds.length > 0 && <span>{selectedBulkThreadIds.length} selected</span>}
              </div>
              {selectedBulkThreadIds.length > 0 && (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => applyBulkReviewedState(true)}>
                    Mark reviewed
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyBulkReviewedState(false)}>
                    Mark unreviewed
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBulkConfirmAction("resolve")}>
                    Resolve selected
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBulkConfirmAction("unresolve")}>
                    Unresolve selected
                  </Button>
                </div>
              )}
              {bulkUndo && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <span>{bulkUndo.message}</span>
                  <button className="font-medium underline" onClick={undoBulkReviewedState} type="button">
                    Undo
                  </button>
                </div>
              )}
              {bulkActionResult && (
                <div className="mb-2 space-y-1 rounded-md bg-muted p-2 text-xs text-muted-foreground" role="status">
                  <p>{bulkActionResult.message}</p>
                  {bulkActionResult.failures.map((failure) => (
                    <p key={failure.id}>
                      {failure.id}: {failure.message} {failure.retryable ? "Retryable." : "Terminal."}
                    </p>
                  ))}
                  {retryableBulkFailureIds.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedBulkThreadIds(retryableBulkFailureIds);
                        setBulkConfirmAction(bulkActionResult.action);
                      }}
                    >
                      Retry failed
                    </Button>
                  )}
                </div>
              )}
              <div className="max-h-44 space-y-2 overflow-auto">
                {filteredReviewThreads.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">No Review Threads match these filters.</p>
                ) : (
                  filteredReviewThreads.map((view) => (
                    <div
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border border-border p-2 text-left hover:bg-accent",
                        selectedReviewThread?.id === view.id && "border-primary bg-accent text-accent-foreground",
                        view.outdated && "border-amber-500/50 bg-amber-500/10",
                      )}
                      key={view.id}
                    >
                      <input
                        aria-label={`Select ${view.thread.filePath}`}
                        checked={selectedBulkThreadSet.has(view.id)}
                        className="mt-1 h-4 w-4 accent-primary"
                        onChange={(event) => toggleBulkThreadSelection(view.id, event.target.checked)}
                        type="checkbox"
                      />
                      <button
                        aria-pressed={selectedReviewThread?.id === view.id}
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedReviewThreadId(view.id)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium">{view.thread.filePath}</span>
                          <Badge variant={view.outdated ? "warning" : view.reviewed ? "success" : "muted"}>
                            {view.outdated ? "Outdated" : view.reviewed ? "Reviewed" : "Unreviewed"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{view.origin === "coderabbit" ? "CodeRabbit" : "Human"}</span>
                          <span>{getThreadStateLabel(view.thread.state)}</span>
                          {view.thread.line && <span>line {view.thread.line}</span>}
                        </div>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="border-b border-border p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Hotspots</h2>
              <div className="space-y-2">
                {reviewOverview.hotspots.slice(0, 4).map((hotspot) => (
                  <button className="w-full rounded-md border border-border p-2 text-left hover:bg-accent" key={hotspot.path} type="button">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{hotspot.path}</span>
                      <Badge variant={hotspot.score > 80 ? "danger" : "warning"}>{hotspot.score}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{hotspot.reasons.join(", ")}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">File changes</h2>
              <div className="space-y-1">
                {files.map((file) => (
                  <button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent" key={file.path} type="button">
                    {file.viewed ? <Eye className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    <span className="text-xs text-muted-foreground">{file.lines}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        )}

        <section aria-label="Review canvas" className="flex min-w-0 flex-col">
          <div className="flex h-11 items-center justify-between border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="danger">Needs attention</Badge>
              <span className="truncate text-sm font-medium">{activeThreadFile}</span>
              <span className="text-xs text-muted-foreground">line {activeThreadLine ?? "unknown"}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setFocusMode((current) => !current)}>
              {focusMode ? <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />}
              {focusMode ? "Exit focus" : "Focus"}
              <Kbd>F</Kbd>
            </Button>
          </div>

          <div className="grid flex-1 grid-rows-[auto_auto_1fr] overflow-hidden">
            <div className="border-b border-border bg-background px-4 py-3" aria-label="Review overview">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">
                    {reviewOverview.repository} #{reviewOverviewCache.metadata.number} by {reviewOverview.author}
                  </p>
                  <h2 className="mt-1 truncate text-base font-semibold">{reviewOverview.title}</h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{reviewOverview.branch}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{reviewOverview.description}</p>
                </div>
                <div className="flex shrink-0 items-start">
                  <Badge variant={readinessBadge.variant}>{readinessBadge.label}</Badge>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
                <div className="rounded-md border border-border px-2 py-1">
                  <p className="text-xs text-muted-foreground">Files</p>
                  <p className="font-semibold">{reviewOverview.counts.changedFiles}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-1">
                  <p className="text-xs text-muted-foreground">Lines</p>
                  <p className="font-semibold">{reviewOverview.counts.changedLines}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-1">
                  <p className="text-xs text-muted-foreground">Threads</p>
                  <p className="font-semibold">{reviewOverview.counts.reviewThreads}</p>
                </div>
                <div className="rounded-md border border-border px-2 py-1">
                  <p className="text-xs text-muted-foreground">Checks</p>
                  <p className="font-semibold">{reviewOverview.counts.checks}</p>
                </div>
              </div>
            </div>

            <div className="border-b border-border bg-muted/40 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Review Path {selectedReviewThreadIndex + 1} of {Math.max(filteredReviewThreads.length, 1)}
                  </p>
                  <h3 className="mt-1 text-base font-semibold">{activeThreadTitle}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedReviewThread?.origin === "coderabbit" ? "warning" : "info"}>
                    {selectedReviewThread?.origin === "coderabbit" ? "CodeRabbit" : "Human"}
                  </Badge>
                  <Badge variant={activeThreadState === "outdated" ? "warning" : "muted"}>{activeThreadStateLabel}</Badge>
                  {selectedReviewThread?.reviewed && <Badge variant="success">Reviewed</Badge>}
                </div>
              </div>
            </div>

            <div className="overflow-auto p-4">
              <div className="overflow-hidden rounded-md border border-border font-mono text-xs">
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-muted text-muted-foreground">
                  <div className="border-r border-border px-2 py-1 text-right">138</div>
                  <div className="px-3 py-1">export async function rotateSessionToken(userId: string) {"{"}</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-rose-500/10">
                  <div className="border-r border-border px-2 py-1 text-right text-muted-foreground">139</div>
                  <div className="px-3 py-1 text-rose-700 dark:text-rose-300">- const cached = sessionCache.get(userId);</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-emerald-500/10">
                  <div className="border-r border-border px-2 py-1 text-right text-muted-foreground">140</div>
                  <div className="px-3 py-1 text-emerald-700 dark:text-emerald-300">+ sessionCache.delete(userId);</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-emerald-500/10">
                  <div className="border-r border-border px-2 py-1 text-right text-muted-foreground">141</div>
                  <div className="px-3 py-1 text-emerald-700 dark:text-emerald-300">+ const cached = await sessionStore.read(userId);</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] bg-muted text-muted-foreground">
                  <div className="border-r border-border px-2 py-1 text-right">142</div>
                  <div className="px-3 py-1">return issueRotatedToken(cached, userId);</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Keyboard className="h-3.5 w-3.5" aria-hidden="true" /> Keyboard Flow</span>
                <span>Next <Kbd>J</Kbd></span>
                <span>Reviewed <Kbd>R</Kbd></span>
                <span>Resolve <Kbd>E</Kbd></span>
                <span>Reply <Kbd>⇧R</Kbd></span>
              </div>
            </div>
          </div>
        </section>

        {!focusMode && (
          <aside aria-label="Inspector" className="border-l border-border bg-card/40">
            <div className="border-b border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Review Thread
              </div>
              <p className="text-xs text-muted-foreground">@{activeThreadAuthor ?? "unknown"}</p>
              <p className="mt-3 text-sm leading-6">{activeThreadBody}</p>
            </div>

            <div className="space-y-2 border-b border-border p-3">
              <textarea
                aria-label="Reply body"
                className="min-h-20 w-full resize-none rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setReplyDraft(event.target.value)}
                placeholder="Reply to this Review Thread"
                value={replyDraft}
              />
              <Button
                className="w-full justify-between"
                variant="secondary"
                onClick={() => handleSetSelectedThreadReviewed(!(selectedReviewThread?.reviewed ?? false))}
                disabled={!selectedReviewThread}
              >
                {selectedReviewThread?.reviewed ? "Mark unreviewed" : "Mark reviewed"}
                <Kbd>R</Kbd>
              </Button>
              <Button
                className="w-full justify-between"
                variant="outline"
                onClick={() => void runThreadAction("reply")}
                disabled={!selectedReviewThread || threadActionBusy !== null}
              >
                Reply
                <Kbd>⇧R</Kbd>
              </Button>
              <Button
                className="w-full justify-between"
                variant="outline"
                onClick={() => void runThreadAction(threadResolveAction)}
                disabled={!selectedReviewThread || threadActionBusy !== null}
              >
                {threadResolveAction === "unresolve" ? "Unresolve" : "Resolve"}
                <Kbd>E</Kbd>
              </Button>
              {threadActionResult && (
                <p
                  className={cn(
                    "rounded-md p-2 text-xs",
                    threadActionResult.ok
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : threadActionResult.retryable
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-destructive/10 text-destructive",
                  )}
                  role="status"
                >
                  {threadActionResult.message}
                </p>
              )}
            </div>

            <div className="border-b border-border p-3" aria-label="GitHub session details">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Github className="h-4 w-4" aria-hidden="true" />
                GitHub Session
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={authBadge.variant}>{authBadge.label}</Badge>
                </div>
                {authSession.accountLogin && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Account</span>
                    <span className="min-w-0 truncate">@{authSession.accountLogin}</span>
                  </div>
                )}
                {authSession.tokenHint && (
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    OS secure storage
                  </div>
                )}
                {authSession.storage.message && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{authSession.storage.message}</p>}
                {oauthFlow && (
                  <div className="space-y-2 rounded-md border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Device code</span>
                      <Kbd>{oauthFlow.userCode}</Kbd>
                    </div>
                    <a className="block truncate text-xs text-sky-700 underline dark:text-sky-300" href={oauthFlow.verificationUriComplete ?? oauthFlow.verificationUri}>
                      {oauthFlow.verificationUri.replace("https://", "")}
                    </a>
                    <Button className="w-full justify-between" variant="secondary" onClick={handlePollSignIn} disabled={authBusy}>
                      Check sign-in
                      <Kbd>{oauthFlow.intervalSeconds}s</Kbd>
                    </Button>
                  </div>
                )}
                {authError && <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive" role="status">{authError}</p>}
              </div>
            </div>

            <div className="border-b border-border p-3" aria-label="Pull Request cache">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  PR Cache
                </div>
                <Badge variant={selectedPullRequestPinned ? "success" : "muted"}>{selectedPullRequestPinned ? "Pinned" : "Unpinned"}</Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Entries</span>
                  <span>{cacheSummary.entries}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Pinned</span>
                  <span>{cacheSummary.pinned}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Next refresh</span>
                  <span className="truncate">{buildIncrementalFetchPlan("manual").join(", ")}</span>
                </div>
                {cacheMessage && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{cacheMessage}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={handleTogglePin} disabled={!activePullRequestKey || !selectedCacheEntry}>
                    {selectedPullRequestPinned ? "Unpin" : "Pin"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearCache}>
                    Clear cache
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-3" aria-label="Merge readiness context">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Merge readiness</h2>
                <Badge variant={readinessBadge.variant}>{readinessBadge.label}</Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                    Checks passing
                  </span>
                  <span>
                    {reviewOverview.checks.passing}/{reviewOverview.checks.total}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Review blockers
                  </span>
                  <span>{reviewOverview.readiness.blockers.length}</span>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Checks</p>
                {reviewOverview.checks.details.map((check) => {
                  const checkBadge = getCheckBadge(check.status, check.conclusion);

                  return (
                    <div className="rounded-md border border-border p-2 text-sm" key={check.name}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{check.name}</span>
                        <Badge variant={checkBadge.variant}>{checkBadge.label}</Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{check.timingLabel}</span>
                        {check.url ? (
                          <a className="truncate text-sky-700 underline dark:text-sky-300" href={check.url} rel="noreferrer" target="_blank">
                            Details
                          </a>
                        ) : (
                          <span>No link</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Visible blockers</p>
                {reviewOverview.readiness.blockers.map((blocker) => (
                  <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground" key={blocker}>
                    {blocker}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </main>

      <Dialog.Root open={bulkConfirmAction !== null} onOpenChange={(open) => !open && setBulkConfirmAction(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-24 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold">
              Confirm bulk {bulkConfirmAction === "unresolve" ? "unresolve" : "resolve"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
              This will write to GitHub for {selectedBulkThreads.length} selected Review Thread
              {selectedBulkThreads.length === 1 ? "" : "s"}. Local Reviewed state changes only after each GitHub write succeeds.
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkConfirmAction(null)}>
                Cancel
              </Button>
              <Button onClick={() => void runConfirmedBulkThreadAction()} disabled={threadActionBusy !== null}>
                Confirm
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-20 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-2 shadow-xl">
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <Dialog.Description className="sr-only">
              Search and run Narview review actions from the keyboard.
            </Dialog.Description>
            <div className="flex h-10 items-center gap-2 border-b border-border px-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input className="h-full flex-1 bg-transparent text-sm outline-none" placeholder="Search commands" aria-label="Search commands" />
              <Kbd>Esc</Kbd>
            </div>
            <div className="py-2">
              {commands.map((command) => (
                <button className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent" key={command.label} type="button">
                  <span>{command.label}</span>
                  <Kbd>{command.shortcut}</Kbd>
                </button>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
