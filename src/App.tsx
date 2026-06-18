import * as Dialog from "@radix-ui/react-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Columns2,
  FileCode2,
  FileText,
  Github,
  GitPullRequest,
  Loader2,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  RefreshCw,
  Reply,
  Rows3,
  Search,
  Send,
  Sun,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownContent } from "./components/markdown-content";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Kbd } from "./components/ui/kbd";
import { type AppUpdateClient, useAppUpdater } from "./lib/app-updater";
import { type AuthClient, type AuthSession, type OAuthStartResponse, tauriAuthClient } from "./lib/auth";
import {
  buildCodeSymbolIndex,
  tokenizeCodeLine,
  type CodeSymbolIndex,
  type CodeSymbolLocation,
  type CodeSymbolRecord,
  type SyntaxToken,
} from "./lib/code-symbols";
import {
  buildLazyDiffState,
  getDefaultLoadedDiffHunkIds,
  readDiffModePreference,
  writeDiffModePreference,
  type DiffLine,
  type DiffMode,
} from "./lib/diff-viewer";
import {
  cacheStats,
  createCachedPullRequest,
  readCachedPullRequest,
  readCacheStore,
  setCachedPullRequestPinned,
  upsertCachedPullRequest,
  writeCachedPullRequestData,
  type CachedFileSummary,
  type CachedPullRequestData,
  type CachedReviewThread,
} from "./lib/pr-cache";
import {
  type AddPendingReviewThreadInput,
  type PendingReview,
  type PullRequestReviewEvent,
  type ReviewActionClient,
  tauriReviewActionClient,
  validatePendingReviewThreadInput,
  validateSubmitReviewInput,
} from "./lib/review-actions";
import {
  buildReviewStackModel,
  getLayerFileLabel,
  getStackProgressLabel,
  type FileViewedState,
  type ReviewLayer,
  type ReviewStack,
  type ReviewStackFile,
} from "./lib/review-stacks";
import { getPullRequestKey, parsePullRequestUrl, type ReviewSessionClient, localReviewSessionClient } from "./lib/review-session";
import { type ThreadActionClient, tauriThreadActionClient } from "./lib/thread-actions";
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
  reviewActionClient?: ReviewActionClient;
  threadActionClient?: ThreadActionClient;
  reviewSessionClient?: ReviewSessionClient;
  updaterClient?: AppUpdateClient;
};

type CommentTarget =
  | {
      subjectType: "LINE";
      path: string;
      line: number;
      side: "LEFT" | "RIGHT";
      startLine?: number | null;
      startSide?: "LEFT" | "RIGHT" | null;
      label: string;
    }
  | {
      subjectType: "FILE";
      path: string;
      label: string;
    }
  | {
      subjectType: "REPLY";
      replyToThreadId: string;
      label: string;
    };

type PublishedDraft = {
  id: string;
  body: string;
  targetLabel: string;
};

type SymbolSelection = {
  name: string;
  path: string;
  line: number | null;
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

const fallbackPullRequest: PullRequestSummary = {
  repository: "Resplendent-Data/Narview",
  number: 12,
  title: "Review stack rebuild",
  authorLogin: "octocat",
  isDraft: false,
  updatedAt: "2026-06-18T12:00:00Z",
  url: "https://github.com/Resplendent-Data/Narview/pull/12",
};

const fallbackPatch = `@@ -1,8 +1,13 @@
 export function buildReviewPlan(files) {
-  return files.sort();
+  return files
+    .map(toStackFile)
+    .sort(compareStackFiles);
 }

-export function markViewed(path) {
-  return localStorage.setItem(path, "viewed");
+export async function markViewed(path, client) {
+  await client.setFileViewed(path, true);
+  return "VIEWED";
 }`;

function createFallbackPullRequestData(): CachedPullRequestData {
  const cache = createCachedPullRequest(fallbackPullRequest, 1_800_000_000_000);

  return {
    ...cache,
    metadata: {
      ...cache.metadata,
      description: "A compact fixture for the review stack workspace.",
      nodeId: "PR_demo",
      baseBranch: "main",
      headBranch: "review-stack-rebuild",
      headSha: "2222222222222222222222222222222222222222",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "REVIEW_REQUIRED",
    },
    fileSummaries: [
      {
        path: "schemas/review-stack.graphql",
        additions: 34,
        deletions: 2,
        status: "modified",
        patch: "@@ -1,3 +1,7 @@\n type PullRequest {\n+  reviewStacks: [ReviewStack!]!\n+  viewerViewedState: FileViewedState!\n }",
        viewerViewedState: "UNVIEWED",
      },
      {
        path: "src/review/stacks.ts",
        additions: 88,
        deletions: 18,
        status: "modified",
        patch: fallbackPatch,
        viewerViewedState: "UNVIEWED",
      },
      {
        path: "src/components/review-stack-workspace.tsx",
        additions: 140,
        deletions: 60,
        status: "modified",
        patch: "@@ -8,6 +8,9 @@\n export function Workspace() {\n+  const [activeStackId, setActiveStackId] = useState(null);\n+  const [focusMode, setFocusMode] = useState(false);\n   return <main />;\n }",
        viewerViewedState: "VIEWED",
      },
      {
        path: "src/review/stacks.test.ts",
        additions: 42,
        deletions: 0,
        status: "added",
        patch: "@@ -0,0 +1,5 @@\n+import { buildReviewStackModel } from './stacks';\n+\n+it('orders tests after implementation', () => {\n+  expect(buildReviewStackModel).toBeDefined();\n+});",
        viewerViewedState: "UNVIEWED",
      },
      {
        path: "docs/adr/0021-independent-review-paths-not-coderabbit-change-stack.md",
        additions: 12,
        deletions: 6,
        status: "modified",
        patch: null,
        viewerViewedState: "UNVIEWED",
      },
    ],
    reviewThreads: [
      {
        id: "thread-stack-1",
        authorLogin: "coderabbitai",
        filePath: "src/review/stacks.ts",
        line: 4,
        state: "unresolved",
        body: "The stack grouping should keep generated files out of the main walkthrough.",
        updatedAt: "2026-06-18T12:04:00Z",
        comments: [
          {
            id: "comment-stack-1",
            authorLogin: "coderabbitai",
            body: "The stack grouping should keep generated files out of the main walkthrough.",
            updatedAt: "2026-06-18T12:04:00Z",
            url: "https://github.com/Resplendent-Data/Narview/pull/12#discussion_r1",
          },
        ],
      },
      {
        id: "thread-stack-2",
        authorLogin: "monalisa",
        filePath: "src/components/review-stack-workspace.tsx",
        line: 11,
        state: "resolved",
        body: "Focus mode covers the narrow laptop case now.",
        updatedAt: "2026-06-18T12:08:00Z",
      },
    ],
    checks: [
      {
        name: "build",
        status: "completed",
        conclusion: "success",
        url: null,
        startedAt: "2026-06-18T12:00:00Z",
        completedAt: "2026-06-18T12:03:00Z",
      },
    ],
  };
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.localStorage.getItem("narview.theme") === "dark" ? "dark" : "light";
}

export function App({
  authClient = tauriAuthClient,
  workspaceClient = tauriWorkspaceClient,
  reviewActionClient = tauriReviewActionClient,
  threadActionClient = tauriThreadActionClient,
  reviewSessionClient = localReviewSessionClient,
  updaterClient,
}: AppProps = {}) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [authSession, setAuthSession] = useState<AuthSession>(checkingSession);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [oauthFlow, setOauthFlow] = useState<OAuthStartResponse | null>(null);
  const [repositories, setRepositories] = useState<WorkspaceRepository[]>([]);
  const [repositoryInput, setRepositoryInput] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [quickOpenInput, setQuickOpenInput] = useState("");
  const [quickOpenedPullRequest, setQuickOpenedPullRequest] = useState<PullRequestSummary | null>(null);
  const [selectedPullRequestKey, setSelectedPullRequestKey] = useState<string | null>(null);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>(idleRefreshStatus);
  const [pullRequestDataStatus, setPullRequestDataStatus] = useState<{
    key: string | null;
    state: "idle" | "loading" | "loaded" | "failed";
    message: string | null;
  }>({ key: null, state: "idle", message: null });
  const [cacheRevision, setCacheRevision] = useState(0);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const [diffMode, setDiffMode] = useState<DiffMode>(readDiffModePreference);
  const [focusMode, setFocusMode] = useState(false);
  const [viewedOverrides, setViewedOverrides] = useState<Record<string, FileViewedState>>({});
  const [viewedBusyPaths, setViewedBusyPaths] = useState<string[]>([]);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [publishedDrafts, setPublishedDrafts] = useState<PublishedDraft[]>([]);
  const [optimisticThreads, setOptimisticThreads] = useState<CachedReviewThread[]>([]);
  const [threadStateOverrides, setThreadStateOverrides] = useState<Record<string, CachedReviewThread["state"]>>({});
  const [reviewSummary, setReviewSummary] = useState("");
  const [reviewEvent, setReviewEvent] = useState<PullRequestReviewEvent>("COMMENT");
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [symbolSelection, setSymbolSelection] = useState<SymbolSelection | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const pullRequestDataInFlightKeyRef = useRef<string | null>(null);
  const updater = useAppUpdater({ client: updaterClient });

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
  const selectedPullRequestReviewKey = getPullRequestKey(selectedPullRequest);
  const selectedPullRequestIsFallback = routedPullRequests.length === 0 && !quickOpenedPullRequest;
  const currentUserKey = authSession.accountLogin ?? "local-user";
  const cacheStore = useMemo(() => readCacheStore(), [cacheRevision]);
  const cachedData = selectedPullRequestIsFallback
    ? null
    : cacheStore.entries[selectedPullRequestReviewKey] ?? readCachedPullRequest(selectedPullRequestReviewKey);
  const reviewData = cachedData ?? createFallbackPullRequestData();
  const effectiveThreads = useMemo(() => {
    const byId = new Map<string, CachedReviewThread>();
    for (const thread of reviewData.reviewThreads) {
      byId.set(thread.id, thread);
    }
    for (const thread of optimisticThreads) {
      byId.set(thread.id, thread);
    }

    return [...byId.values()].map((thread) => ({
      ...thread,
      state: threadStateOverrides[thread.id] ?? thread.state,
    }));
  }, [optimisticThreads, reviewData.reviewThreads, threadStateOverrides]);
  const stackModel = useMemo(
    () =>
      buildReviewStackModel({
        files: reviewData.fileSummaries,
        reviewThreads: effectiveThreads,
        viewedOverrides,
      }),
    [effectiveThreads, reviewData.fileSummaries, viewedOverrides],
  );
  const symbolIndex = useMemo(() => buildCodeSymbolIndex(reviewData.fileSummaries), [reviewData.fileSummaries]);
  const selectedSymbolRecord = symbolSelection ? symbolIndex.recordsByName.get(symbolSelection.name) ?? null : null;
  const selectedStack = stackModel.stacks.find((stack) => stack.id === selectedStackId) ?? stackModel.stacks[0] ?? null;
  const selectedLayer =
    selectedStack?.layers.find((layer) => layer.id === selectedLayerId) ?? selectedStack?.layers[0] ?? null;
  const selectedLayerFilePaths = selectedLayer?.filePaths ?? [];
  const activeFile =
    (activeFilePath ? stackModel.filesByPath.get(activeFilePath) : null) ??
    (selectedLayerFilePaths[0] ? stackModel.filesByPath.get(selectedLayerFilePaths[0]) : null) ??
    null;
  const activeFileSummary = activeFile ? reviewData.fileSummaries.find((file) => file.path === activeFile.path) ?? null : null;
  const activeLayerThreads = effectiveThreads.filter((thread) => selectedLayerFilePaths.includes(thread.filePath));
  const activeFileThreads = activeFile ? effectiveThreads.filter((thread) => thread.filePath === activeFile.path) : [];
  const diffState =
    activeFileSummary && activeFile
      ? buildLazyDiffState(activeFileSummary, {
          mode: diffMode,
          repository: selectedPullRequest.repository,
          pullRequestNumber: selectedPullRequest.number,
          loadedHunkIds: getDefaultLoadedDiffHunkIds(activeFileSummary),
        })
      : null;
  const filteredFiles = useMemo(() => {
    const query = fileSearch.trim().toLowerCase();
    if (!query) {
      return stackModel.files;
    }
    return stackModel.files.filter((file) => file.path.toLowerCase().includes(query));
  }, [fileSearch, stackModel.files]);
  const selectedPullRequestPinned = cachedData?.pinned ?? false;
  const selectedBranchLabel = [reviewData.metadata.baseBranch, reviewData.metadata.headBranch].filter(Boolean).join(" <- ");
  const cacheSummary = cacheStats(cacheStore);
  const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const authBadge = getAuthBadge(authSession);
  const loadedFilesMessage =
    pullRequestDataStatus.key === selectedPullRequestReviewKey ? pullRequestDataStatus.message : null;
  const activeFileViewed = activeFile ? getViewedState(activeFile.path) === "VIEWED" : false;
  const activeFileViewedBusy = activeFile ? viewedBusyPaths.includes(activeFile.path) : false;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("narview.theme", theme);
  }, [theme]);

  useEffect(() => {
    writeDiffModePreference(diffMode);
  }, [diffMode]);

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
          setAuthError(getErrorMessage(error));
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
          setWorkspaceError(getErrorMessage(error));
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
    if (authSession.state === "checking" || selectedPullRequestKey || routedPullRequests.length > 0) {
      return;
    }

    let active = true;
    reviewSessionClient.loadLastSession(currentUserKey).then((restored) => {
      if (!active || !restored) {
        return;
      }
      setQuickOpenedPullRequest(restored.pullRequest);
      setSelectedPullRequestKey(getPullRequestKey(restored.pullRequest));
      setActionMessage(`Restored ${restored.pullRequest.repository} #${restored.pullRequest.number}.`);
    });

    return () => {
      active = false;
    };
  }, [authSession.state, currentUserKey, reviewSessionClient, routedPullRequests.length, selectedPullRequestKey]);

  useEffect(() => {
    if (selectedPullRequestIsFallback || !selectedPullRequestReviewKey) {
      return;
    }

    void reviewSessionClient.saveSession(currentUserKey, selectedPullRequest, {
      activeQueueId: selectedStack?.id ?? "",
      includeDrafts,
      threadKey: selectedLayer?.id ?? "",
      filePath: activeFile?.path ?? "",
      nearbyLine: selectedLayer?.ranges[0]?.startLine ?? 1,
      updatedAtEpochMs: Date.now(),
    });
  }, [
    activeFile?.path,
    currentUserKey,
    includeDrafts,
    reviewSessionClient,
    selectedLayer?.id,
    selectedPullRequest,
    selectedPullRequestIsFallback,
    selectedPullRequestReviewKey,
    selectedStack?.id,
  ]);

  useEffect(() => {
    if (!selectedStack && selectedStackId !== null) {
      setSelectedStackId(null);
      return;
    }
    if (selectedStack && selectedStack.id !== selectedStackId) {
      setSelectedStackId(selectedStack.id);
    }
  }, [selectedStack, selectedStackId]);

  useEffect(() => {
    if (!selectedLayer && selectedLayerId !== null) {
      setSelectedLayerId(null);
      return;
    }
    if (selectedLayer && selectedLayer.id !== selectedLayerId) {
      setSelectedLayerId(selectedLayer.id);
    }
  }, [selectedLayer, selectedLayerId]);

  useEffect(() => {
    if (!activeFilePath || !selectedLayerFilePaths.includes(activeFilePath)) {
      setActiveFilePath(selectedLayerFilePaths[0] ?? null);
    }
  }, [activeFilePath, selectedLayerFilePaths.join("|")]);

  useEffect(() => {
    setViewedOverrides({});
    setOptimisticThreads([]);
    setThreadStateOverrides({});
    setPendingReview(null);
    setPublishedDrafts([]);
    setCommentTarget(null);
    setCommentBody("");
    setActionMessage(null);
  }, [selectedPullRequestReviewKey]);

  useEffect(() => {
    if (selectedPullRequestIsFallback || routedPullRequests.length === 0) {
      return;
    }

    const existing = readCachedPullRequest(selectedPullRequestReviewKey);
    if (!existing) {
      upsertCachedPullRequest(selectedPullRequest);
      setCacheRevision((current) => current + 1);
    }

    if (authSession.state !== "signed-in") {
      setPullRequestDataStatus({
        key: selectedPullRequestReviewKey,
        state: "failed",
        message: "Sign in to load GitHub file viewed state, review threads, and checks.",
      });
      return;
    }

    if (pullRequestDataInFlightKeyRef.current === selectedPullRequestReviewKey) {
      return;
    }

    let active = true;
    pullRequestDataInFlightKeyRef.current = selectedPullRequestReviewKey;
    setPullRequestDataStatus({
      key: selectedPullRequestReviewKey,
      state: "loading",
      message: existing ? "Refreshing GitHub review data." : "Loading GitHub review data.",
    });

    workspaceClient
      .fetchPullRequestData(selectedPullRequest)
      .then((data) => {
        if (!active) {
          return;
        }
        writeCachedPullRequestData(data);
        setCacheRevision((current) => current + 1);
        setPullRequestDataStatus({
          key: selectedPullRequestReviewKey,
          state: "loaded",
          message: `Loaded ${data.fileSummaries.length} files and ${data.reviewThreads.length} threads.`,
        });
      })
      .catch((error) => {
        if (active) {
          setPullRequestDataStatus({
            key: selectedPullRequestReviewKey,
            state: "failed",
            message: getErrorMessage(error),
          });
        }
      })
      .finally(() => {
        if (pullRequestDataInFlightKeyRef.current === selectedPullRequestReviewKey) {
          pullRequestDataInFlightKeyRef.current = null;
        }
      });

    return () => {
      active = false;
      if (pullRequestDataInFlightKeyRef.current === selectedPullRequestReviewKey) {
        pullRequestDataInFlightKeyRef.current = null;
      }
    };
  }, [
    authSession.state,
    routedPullRequests.length,
    selectedPullRequest,
    selectedPullRequestIsFallback,
    selectedPullRequestReviewKey,
    workspaceClient,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        moveLayer(1);
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        moveLayer(-1);
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        setFocusMode((current) => !current);
      }
      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        void toggleActiveFileViewed();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function handleSignIn() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      setOauthFlow(await authClient.startSignIn());
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleOpenGithubSignIn() {
    if (!oauthFlow) {
      return;
    }

    try {
      await openUrl(oauthFlow.verificationUriComplete ?? oauthFlow.verificationUri);
      setActionMessage("GitHub sign-in opened.");
    } catch (error) {
      setAuthError(getErrorMessage(error));
    }
  }

  async function handlePollSignIn() {
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
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      setAuthSession(await authClient.signOut());
      setOauthFlow(null);
      setPullRequests([]);
      setSelectedPullRequestKey(null);
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function refreshPullRequests(nextIncludeDrafts = includeDrafts) {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    setRefreshStatus({
      state: "loading",
      message: "Refreshing open pull requests.",
      rateLimitResetEpochSeconds: null,
      refreshedAtEpochSeconds: refreshStatus.refreshedAtEpochSeconds,
    });

    try {
      const response = await workspaceClient.refreshPullRequests(nextIncludeDrafts);
      setRepositories(response.repositories);
      setPullRequests(response.pullRequests);
      setRefreshStatus(response.status);
      setSelectedPullRequestKey((current) => {
        if (current && response.pullRequests.some((pullRequest) => getPullRequestKey(pullRequest) === current)) {
          return current;
        }
        return response.pullRequests[0] ? getPullRequestKey(response.pullRequests[0]) : null;
      });
    } catch (error) {
      const message = getErrorMessage(error);
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

  async function handleSaveRepository(event: FormEvent<HTMLFormElement>) {
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
      setWorkspaceError(getErrorMessage(error));
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleQuickOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError(null);
    try {
      const pullRequest = parsePullRequestUrl(quickOpenInput);
      setQuickOpenedPullRequest(pullRequest);
      setSelectedPullRequestKey(getPullRequestKey(pullRequest));
      setQuickOpenInput("");
    } catch (error) {
      setWorkspaceError(getErrorMessage(error));
    }
  }

  async function handleSetFileViewed(path: string, viewed: boolean) {
    const previousState = getViewedState(path);
    const nextState: FileViewedState = viewed ? "VIEWED" : "UNVIEWED";
    setViewedBusyPaths((current) => [...new Set([...current, path])]);
    setViewedOverrides((current) => ({ ...current, [path]: nextState }));
    applyViewedStateToCache(path, nextState);

    try {
      const result = await reviewActionClient.setFileViewed({
        repository: selectedPullRequest.repository,
        pullRequestNumber: selectedPullRequest.number,
        path,
        viewed,
      });

      if (!result.ok) {
        throw new Error(result.message);
      }
      setViewedOverrides((current) => ({ ...current, [path]: result.viewerViewedState }));
      applyViewedStateToCache(path, result.viewerViewedState);
      setActionMessage(result.message);
    } catch (error) {
      setViewedOverrides((current) => ({ ...current, [path]: previousState }));
      applyViewedStateToCache(path, previousState);
      setActionMessage(getErrorMessage(error));
    } finally {
      setViewedBusyPaths((current) => current.filter((busyPath) => busyPath !== path));
    }
  }

  async function handleMarkStackViewed(stack: ReviewStack) {
    const unviewedFiles = stack.filePaths.filter((path) => getViewedState(path) !== "VIEWED");
    if (unviewedFiles.length === 0) {
      setActionMessage("Stack is already viewed.");
      return;
    }

    setActionBusy(true);
    const failures: string[] = [];
    for (const path of unviewedFiles) {
      const previousState = getViewedState(path);
      setViewedOverrides((current) => ({ ...current, [path]: "VIEWED" }));
      applyViewedStateToCache(path, "VIEWED");
      try {
        const result = await reviewActionClient.setFileViewed({
          repository: selectedPullRequest.repository,
          pullRequestNumber: selectedPullRequest.number,
          path,
          viewed: true,
        });
        if (!result.ok) {
          throw new Error(result.message);
        }
      } catch (error) {
        failures.push(`${path}: ${getErrorMessage(error)}`);
        setViewedOverrides((current) => ({ ...current, [path]: previousState }));
        applyViewedStateToCache(path, previousState);
      }
    }
    setActionBusy(false);
    setActionMessage(
      failures.length === 0
        ? `Marked ${unviewedFiles.length} file${unviewedFiles.length === 1 ? "" : "s"} viewed on GitHub.`
        : `Viewed sync failed for ${failures.length} file${failures.length === 1 ? "" : "s"}: ${failures.join("; ")}`,
    );
  }

  async function handleAddPendingComment() {
    if (!commentTarget) {
      setActionMessage("Choose a comment target first.");
      return;
    }

    const input = buildPendingCommentInput(commentTarget);
    const validation = validatePendingReviewThreadInput(input);
    if (validation) {
      setActionMessage(validation);
      return;
    }

    setActionBusy(true);
    try {
      const result = await reviewActionClient.addPendingReviewThread(input);
      setPendingReview({
        pullRequestId: result.pullRequestId,
        pullRequestReviewId: result.pullRequestReviewId,
        state: result.state,
        message: result.message,
      });
      if (result.thread) {
        setOptimisticThreads((current) => [...current.filter((thread) => thread.id !== result.thread?.id), result.thread!]);
      }
      setPublishedDrafts((current) => [
        ...current,
        {
          id: result.thread?.id ?? `draft:${Date.now()}`,
          body: commentBody.trim(),
          targetLabel: commentTarget.label,
        },
      ]);
      setCommentBody("");
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(getErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSubmitReview() {
    if (!pendingReview) {
      setActionMessage("No pending review is ready to submit.");
      return;
    }

    const input = {
      repository: selectedPullRequest.repository,
      pullRequestNumber: selectedPullRequest.number,
      pullRequestReviewId: pendingReview.pullRequestReviewId,
      event: reviewEvent,
      body: reviewSummary,
    };
    const validation = validateSubmitReviewInput(input);
    if (validation) {
      setActionMessage(validation);
      return;
    }

    setActionBusy(true);
    try {
      const result = await reviewActionClient.submitPendingReview(input);
      setPendingReview(null);
      setPublishedDrafts([]);
      setReviewSummary("");
      setSubmitDialogOpen(false);
      setActionMessage(result.message);
      await refreshSelectedPullRequestData("Refreshed after review submission.");
    } catch (error) {
      setActionMessage(getErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDiscardPendingReview() {
    if (!pendingReview) {
      return;
    }

    setActionBusy(true);
    try {
      const result = await reviewActionClient.discardPendingReview({
        repository: selectedPullRequest.repository,
        pullRequestNumber: selectedPullRequest.number,
        pullRequestReviewId: pendingReview.pullRequestReviewId,
      });
      setPendingReview(null);
      setPublishedDrafts([]);
      setActionMessage(result.message);
    } catch (error) {
      setActionMessage(getErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleResolveThread(thread: CachedReviewThread) {
    setActionBusy(true);
    const action = thread.state === "resolved" ? threadActionClient.unresolve : threadActionClient.resolve;
    try {
      const result = await action(thread.id);
      if (result.ok) {
        setThreadStateOverrides((current) => ({
          ...current,
          [thread.id]: thread.state === "resolved" ? "unresolved" : "resolved",
        }));
        setActionMessage(result.message);
      } else {
        setActionMessage(result.message);
      }
    } catch (error) {
      setActionMessage(getErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function refreshSelectedPullRequestData(successMessage = "Refreshed GitHub review data.") {
    if (authSession.state !== "signed-in") {
      setActionMessage("Sign in to refresh GitHub review data.");
      return;
    }

    try {
      const data = await workspaceClient.fetchPullRequestData(selectedPullRequest);
      writeCachedPullRequestData(data);
      setCacheRevision((current) => current + 1);
      setPullRequestDataStatus({
        key: selectedPullRequestReviewKey,
        state: "loaded",
        message: successMessage,
      });
    } catch (error) {
      setActionMessage(getErrorMessage(error));
    }
  }

  function buildPendingCommentInput(target: CommentTarget): AddPendingReviewThreadInput {
    const base = {
      repository: selectedPullRequest.repository,
      pullRequestNumber: selectedPullRequest.number,
      pullRequestReviewId: pendingReview?.pullRequestReviewId ?? null,
      body: commentBody,
    };

    if (target.subjectType === "LINE") {
      return {
        ...base,
        subjectType: "LINE",
        path: target.path,
        line: target.line,
        side: target.side,
        startLine: target.startLine ?? null,
        startSide: target.startSide ?? null,
      };
    }

    if (target.subjectType === "REPLY") {
      return {
        ...base,
        subjectType: "REPLY",
        replyToThreadId: target.replyToThreadId,
      };
    }

    return {
      ...base,
      subjectType: "FILE",
      path: target.path,
    };
  }

  function applyViewedStateToCache(path: string, state: FileViewedState) {
    if (selectedPullRequestIsFallback) {
      return;
    }

    const current = readCacheStore().entries[selectedPullRequestReviewKey];
    if (!current) {
      return;
    }

    writeCachedPullRequestData({
      ...current,
      fileSummaries: current.fileSummaries.map((file) =>
        file.path === path
          ? {
              ...file,
              viewerViewedState: state,
            }
          : file,
      ),
    });
    setCacheRevision((revision) => revision + 1);
  }

  function getViewedState(path: string): FileViewedState {
    return viewedOverrides[path] ?? (stackModel.filesByPath.get(path)?.viewerViewedState ?? "UNKNOWN");
  }

  function selectStack(stack: ReviewStack) {
    setSelectedStackId(stack.id);
    setSelectedLayerId(stack.layers[0]?.id ?? null);
    setActiveFilePath(stack.layers[0]?.filePaths[0] ?? null);
  }

  function selectLayer(layer: ReviewLayer) {
    setSelectedLayerId(layer.id);
    setActiveFilePath(layer.filePaths[0] ?? null);
  }

  function selectFilePath(path: string) {
    const stack = stackModel.stacks.find((candidate) => candidate.filePaths.includes(path));
    const layer = stack?.layers.find((candidate) => candidate.filePaths.includes(path));
    if (stack) {
      setSelectedStackId(stack.id);
    }
    if (layer) {
      selectLayer(layer);
    }
    setActiveFilePath(path);
  }

  function toggleActiveFileViewed() {
    if (!activeFile || viewedBusyPaths.includes(activeFile.path)) {
      return;
    }
    return handleSetFileViewed(activeFile.path, getViewedState(activeFile.path) !== "VIEWED");
  }

  function moveLayer(direction: 1 | -1) {
    const layers = stackModel.stacks.flatMap((stack) => stack.layers);
    if (layers.length === 0) {
      return;
    }
    const currentIndex = selectedLayer ? layers.findIndex((layer) => layer.id === selectedLayer.id) : -1;
    const nextIndex = (Math.max(currentIndex, 0) + direction + layers.length) % layers.length;
    const nextLayer = layers[nextIndex];
    const nextStack = stackModel.stacks.find((stack) => stack.id === nextLayer.stackId);
    if (nextStack) {
      setSelectedStackId(nextStack.id);
      selectLayer(nextLayer);
    }
  }

  function togglePin() {
    if (!cachedData) {
      return;
    }
    setCachedPullRequestPinned(selectedPullRequestReviewKey, !selectedPullRequestPinned);
    setCacheRevision((current) => current + 1);
    setCacheMessage(selectedPullRequestPinned ? "Unpinned Pull Request cache." : "Pinned Pull Request cache.");
  }

  return (
    <main className="flex h-screen overflow-hidden bg-background text-foreground" aria-label="Review stack workspace">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GitPullRequest className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Narview</div>
              <div className="truncate text-xs text-muted-foreground">{selectedPullRequest.repository} #{selectedPullRequest.number}</div>
            </div>
          </div>

          <div className="mx-2 h-6 w-px bg-border" />

          <form className="hidden min-w-0 flex-1 items-center gap-2 md:flex" onSubmit={handleQuickOpen}>
            <label className="sr-only" htmlFor="quick-open-pr">
              Pull Request URL
            </label>
            <input
              id="quick-open-pr"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={quickOpenInput}
              onChange={(event) => setQuickOpenInput(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
            />
            <Button type="submit" variant="outline" size="sm">
              <Search className="h-4 w-4" aria-hidden="true" />
              Open
            </Button>
          </form>

          <select
            className="hidden h-8 max-w-64 rounded-md border bg-background px-2 text-sm lg:block"
            aria-label="Pull Request"
            value={selectedPullRequestReviewKey}
            onChange={(event) => setSelectedPullRequestKey(event.target.value)}
          >
            {routedPullRequests.length === 0 ? (
              <option value={selectedPullRequestReviewKey}>{selectedPullRequest.title}</option>
            ) : (
              routedPullRequests.map((pullRequest) => (
                <option key={getPullRequestKey(pullRequest)} value={getPullRequestKey(pullRequest)}>
                  {pullRequest.repository} #{pullRequest.number}
                </option>
              ))
            )}
          </select>

          <Button variant="outline" size="icon" aria-label="Refresh Pull Requests" onClick={() => void refreshPullRequests(includeDrafts)} disabled={workspaceBusy}>
            <RefreshCw className={cn("h-4 w-4", workspaceBusy && "animate-spin")} aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" aria-label={themeLabel} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </Button>
          <AuthControl
            session={authSession}
            badge={authBadge}
            busy={authBusy}
            oauthFlow={oauthFlow}
            onSignIn={handleSignIn}
            onOpenGithub={handleOpenGithubSignIn}
            onPoll={handlePollSignIn}
            onCancel={() => setOauthFlow(null)}
            onSignOut={handleSignOut}
          />
        </header>

        <div className="flex min-h-0 flex-1">
          {!focusMode ? (
            <aside className="flex w-80 shrink-0 flex-col border-r bg-card" aria-label="Review stacks">
              <WorkspaceControls
                repositoryInput={repositoryInput}
                repositories={repositories}
                includeDrafts={includeDrafts}
                busy={workspaceBusy}
                onRepositoryInputChange={setRepositoryInput}
                onSaveRepository={handleSaveRepository}
                onIncludeDraftsChange={(checked) => {
                  setIncludeDrafts(checked);
                  if (authSession.state === "signed-in") {
                    void refreshPullRequests(checked);
                  }
                }}
              />
              <div className="border-y px-3 py-2">
                <div>
                  <h2 className="text-sm font-semibold">Stacks</h2>
                  <p className="text-xs text-muted-foreground">{stackModel.stacks.length} groups</p>
                </div>
              </div>
              <div className="pane-scroll-y min-h-0 flex-1 overflow-y-auto p-2" aria-label="Stack rail">
                {stackModel.stacks.map((stack) => (
                  <StackNavigationItem
                    key={stack.id}
                    stack={stack}
                    selectedStackId={selectedStack?.id ?? null}
                    selectedLayerId={selectedLayer?.id ?? null}
                    onSelectStack={selectStack}
                    onSelectLayer={selectLayer}
                    onMarkViewed={(stack) => void handleMarkStackViewed(stack)}
                    markViewedBusy={actionBusy}
                  />
                ))}
              </div>
              <div className="border-t p-3" aria-label="All files">
                <div className="mb-2 flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={fileSearch}
                    onChange={(event) => setFileSearch(event.target.value)}
                    aria-label="Search changed files"
                    placeholder="Search files"
                  />
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto" aria-label="All changed files">
                  {filteredFiles.map((file) => (
                    <button
                      key={file.path}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent",
                        activeFile?.path === file.path && "bg-accent text-accent-foreground",
                      )}
                      onClick={() => {
                        selectFilePath(file.path);
                      }}
                    >
                      {file.viewerViewedState === "VIEWED" ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          ) : null}

          <section className="flex min-w-0 flex-1 flex-col" aria-label="Stack diff">
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-sm font-semibold">{selectedLayer?.title ?? "No changed file selected"}</h1>
                  {selectedStack ? <Badge variant={getStackBadgeVariant(selectedStack.kind)}>{selectedStack.kind}</Badge> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {selectedStack?.title ?? "No stack"} {selectedBranchLabel ? `- ${selectedBranchLabel}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="icon" aria-label="Previous layer" onClick={() => moveLayer(-1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Next layer" onClick={() => moveLayer(1)}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant={activeFileViewed ? "secondary" : "outline"}
                  size="sm"
                  aria-label={
                    activeFile
                      ? activeFileViewed
                        ? `Unmark ${activeFile.path} viewed`
                        : `Mark ${activeFile.path} viewed`
                      : "Mark active file viewed"
                  }
                  disabled={!activeFile || activeFileViewedBusy}
                  onClick={() => void toggleActiveFileViewed()}
                >
                  {activeFileViewedBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {activeFileViewed ? "Viewed" : "Mark viewed"}
                  <Kbd>V</Kbd>
                </Button>
                <Button
                  variant={diffMode === "unified" ? "secondary" : "outline"}
                  size="icon"
                  aria-label="Unified diff"
                  onClick={() => setDiffMode("unified")}
                >
                  <Rows3 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant={diffMode === "side-by-side" ? "secondary" : "outline"}
                  size="icon"
                  aria-label="Split diff"
                  onClick={() => setDiffMode("side-by-side")}
                >
                  <Columns2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setFocusMode((current) => !current)}>
                  {focusMode ? "Panels" : "Focus"}
                </Button>
              </div>
            </div>

            <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b bg-background px-3" aria-label="Layer files">
              {selectedLayerFilePaths.map((path) => {
                const file = stackModel.filesByPath.get(path);
                const viewed = getViewedState(path) === "VIEWED";
                const busy = viewedBusyPaths.includes(path);
                return (
                  <button
                    key={path}
                    className={cn(
                      "inline-flex h-7 max-w-80 shrink-0 items-center gap-2 rounded-md border px-2 text-xs hover:bg-accent",
                      activeFile?.path === path && "border-primary bg-accent",
                    )}
                    onClick={() => setActiveFilePath(path)}
                  >
                    {file?.kind === "text" ? <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span className="truncate">{path}</span>
                    <span className="text-muted-foreground">{file ? `${file.additions}+ ${file.deletions}-` : ""}</span>
                    <span className="rounded p-0.5" aria-label={viewed ? `${path} viewed` : `${path} unviewed`}>
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : viewed ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-auto" aria-label="Diff scroll area">
              {diffState && activeFile ? (
                <DiffViewer
                  file={activeFile}
                  diffMode={diffMode}
                  lines={diffState.fullFileLines ?? diffState.hunks.flatMap((hunk) => hunk.lines)}
                  symbolIndex={symbolIndex}
                  onComment={(target) => {
                    setCommentTarget(target);
                    setCommentBody("");
                  }}
                  onSymbolClick={setSymbolSelection}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No diff selected.</div>
              )}
            </div>
          </section>

          {!focusMode ? (
            <aside className="flex w-[23rem] shrink-0 flex-col border-l bg-card" aria-label="Review panel">
              <div className="border-b p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{selectedStack?.title ?? "Review stack"}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedStack ? getStackProgressLabel(selectedStack) : "0/0 viewed"} - {selectedLayer ? getLayerFileLabel(selectedLayer) : "0 files"}
                    </p>
                  </div>
                  {pendingReview ? <Badge variant="warning">Pending</Badge> : <Badge variant="muted">No draft</Badge>}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <Metric label="Files" value={String(selectedStack?.totalFileCount ?? 0)} />
                  <Metric label="Threads" value={String(activeLayerThreads.length)} />
                  <Metric label="Drafts" value={String(publishedDrafts.length)} />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Comments and review">
                <section className="space-y-2" aria-label="Current comment target">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">Comment</h3>
                    {activeFile ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCommentTarget({
                            subjectType: "FILE",
                            path: activeFile.path,
                            label: activeFile.path,
                          })
                        }
                      >
                        <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        File
                      </Button>
                    ) : null}
                  </div>
                  <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
                    {commentTarget?.label ?? "Choose a changed line, file, or thread."}
                  </div>
                  <textarea
                    className="min-h-24 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    aria-label="Draft review comment"
                  />
                  <Button className="w-full" onClick={() => void handleAddPendingComment()} disabled={actionBusy || commentBody.trim().length === 0}>
                    {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquare className="h-4 w-4" aria-hidden="true" />}
                    Add To Review
                  </Button>
                </section>

                <section className="mt-5 space-y-2" aria-label="Existing review threads">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Threads</h3>
                  {activeFileThreads.length === 0 ? (
                    <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">No threads on this file.</p>
                  ) : (
                    activeFileThreads.map((thread) => (
                      <ThreadItem
                        key={thread.id}
                        thread={thread}
                        onReply={() => {
                          setCommentTarget({
                            subjectType: "REPLY",
                            replyToThreadId: thread.id,
                            label: `Reply to ${thread.authorLogin ?? "thread"} on ${thread.filePath}`,
                          });
                          setCommentBody("");
                        }}
                        onResolve={() => void handleResolveThread(thread)}
                      />
                    ))
                  )}
                </section>

                <section className="mt-5 space-y-2" aria-label="Pending review drafts">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Pending Review</h3>
                  {publishedDrafts.length === 0 ? (
                    <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">No draft comments published to the pending review.</p>
                  ) : (
                    publishedDrafts.map((draft) => (
                      <div key={draft.id} className="rounded-md border bg-background p-3">
                        <div className="mb-1 truncate text-xs font-medium">{draft.targetLabel}</div>
                        <p className="line-clamp-3 text-sm text-muted-foreground">{draft.body}</p>
                      </div>
                    ))
                  )}
                </section>
              </div>

              <div className="space-y-2 border-t p-3">
                <SubmitReviewDialog
                  open={submitDialogOpen}
                  onOpenChange={setSubmitDialogOpen}
                  event={reviewEvent}
                  body={reviewSummary}
                  pendingReview={pendingReview}
                  busy={actionBusy}
                  onEventChange={setReviewEvent}
                  onBodyChange={setReviewSummary}
                  onSubmit={handleSubmitReview}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button className="w-full" disabled={!pendingReview || actionBusy} onClick={() => setSubmitDialogOpen(true)}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Submit
                  </Button>
                  <Button className="w-full" variant="outline" disabled={!pendingReview || actionBusy} onClick={() => void handleDiscardPendingReview()}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    Discard
                  </Button>
                </div>
              </div>
            </aside>
          ) : null}
        </div>

        <footer className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-t bg-card px-3 text-xs text-muted-foreground">
          <div className="min-w-0 truncate">
            {actionMessage ?? loadedFilesMessage ?? workspaceError ?? authError ?? cacheMessage ?? refreshStatus.message ?? "Ready"}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span>{cacheSummary.entries} cached</span>
            <button className="hover:text-foreground" onClick={togglePin} disabled={!cachedData}>
              {selectedPullRequestPinned ? "Pinned" : "Pin"}
            </button>
            <button className="hover:text-foreground" onClick={() => void refreshSelectedPullRequestData()}>
              Refresh PR
            </button>
            <button className="hover:text-foreground" onClick={() => selectedPullRequest.url && void openUrl(selectedPullRequest.url)}>
              GitHub
            </button>
            <span>{updater.isChecking ? "Checking update" : updater.updateInfo ? `Update ${updater.updateInfo.version}` : "Current"}</span>
            <span className="hidden items-center gap-1 lg:flex">
              <Kbd>J</Kbd>/<Kbd>K</Kbd>
              <Kbd>Z</Kbd>
            </span>
          </div>
        </footer>
      </div>
      <SymbolReferencesDialog
        selection={symbolSelection}
        record={selectedSymbolRecord}
        onOpenChange={(open) => {
          if (!open) {
            setSymbolSelection(null);
          }
        }}
        onNavigate={(location) => {
          selectFilePath(location.path);
          setSymbolSelection(null);
        }}
      />
    </main>
  );
}

function WorkspaceControls({
  repositoryInput,
  repositories,
  includeDrafts,
  busy,
  onRepositoryInputChange,
  onSaveRepository,
  onIncludeDraftsChange,
}: {
  repositoryInput: string;
  repositories: WorkspaceRepository[];
  includeDrafts: boolean;
  busy: boolean;
  onRepositoryInputChange: (value: string) => void;
  onSaveRepository: (event: FormEvent<HTMLFormElement>) => void;
  onIncludeDraftsChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-2 p-3" aria-label="Workspace repositories">
      <form className="flex gap-2" onSubmit={onSaveRepository}>
        <label className="sr-only" htmlFor="repository-input">
          Repository
        </label>
        <input
          id="repository-input"
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={repositoryInput}
          onChange={(event) => onRepositoryInputChange(event.target.value)}
          placeholder="owner/repo"
        />
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          Save
        </Button>
      </form>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{repositories.length} repos</span>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border"
            checked={includeDrafts}
            onChange={(event) => onIncludeDraftsChange(event.target.checked)}
          />
          Drafts
        </label>
      </div>
    </div>
  );
}

function AuthControl({
  session,
  badge,
  busy,
  oauthFlow,
  onSignIn,
  onOpenGithub,
  onPoll,
  onCancel,
  onSignOut,
}: {
  session: AuthSession;
  badge: { label: string; variant: "success" | "warning" | "danger" | "muted" | "info" };
  busy: boolean;
  oauthFlow: OAuthStartResponse | null;
  onSignIn: () => void;
  onOpenGithub: () => void;
  onPoll: () => void;
  onCancel: () => void;
  onSignOut: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(oauthFlow)} onOpenChange={(open) => !open && onCancel()}>
      <div className="flex items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {session.state === "signed-in" ? (
          <Button variant="outline" size="icon" aria-label="Sign out" onClick={onSignOut} disabled={busy}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="outline" size="icon" aria-label="Sign in" onClick={onSignIn} disabled={busy || session.state === "checking"}>
            <LogIn className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-4 shadow-lg">
          <Dialog.Title className="text-base font-semibold">GitHub Sign In</Dialog.Title>
          <div className="mt-4 rounded-md border bg-background p-3 text-center font-mono text-lg tracking-widest">
            {oauthFlow?.userCode}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="outline" onClick={onOpenGithub}>
              <Github className="h-4 w-4" aria-hidden="true" />
              Open
            </Button>
            <Button onClick={onPoll} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Done
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StackNavigationItem({
  stack,
  selectedStackId,
  selectedLayerId,
  onSelectStack,
  onSelectLayer,
  onMarkViewed,
  markViewedBusy,
}: {
  stack: ReviewStack;
  selectedStackId: string | null;
  selectedLayerId: string | null;
  onSelectStack: (stack: ReviewStack) => void;
  onSelectLayer: (layer: ReviewLayer) => void;
  onMarkViewed: (stack: ReviewStack) => void;
  markViewedBusy: boolean;
}) {
  const selected = stack.id === selectedStackId;
  const fullyViewed = stack.totalFileCount > 0 && stack.viewedFileCount === stack.totalFileCount;
  const [open, setOpen] = useState(selected);

  useEffect(() => {
    if (selected) {
      setOpen(true);
    }
  }, [selected]);

  return (
    <div className="mb-1 rounded-md border bg-background">
      <div className={cn("flex items-stretch rounded-t-md", selected && "bg-accent text-accent-foreground")}>
        <button
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left hover:bg-accent"
          onClick={() => {
            onSelectStack(stack);
            setOpen((current) => !current || !selected);
          }}
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{stack.title}</div>
            <div className="text-xs text-muted-foreground">{getStackProgressLabel(stack)}</div>
          </div>
          {stack.commentCount > 0 ? <Badge variant="info">{stack.commentCount}</Badge> : null}
        </button>
        <button
          className={cn(
            "m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
            fullyViewed && "border-emerald-500/50 text-emerald-600",
          )}
          title={fullyViewed ? `${stack.title} is already viewed` : `Mark all files in ${stack.title} viewed`}
          aria-label={fullyViewed ? `${stack.title} already viewed` : `Mark all files in ${stack.title} viewed`}
          disabled={markViewedBusy || fullyViewed}
          onClick={(event) => {
            event.stopPropagation();
            onMarkViewed(stack);
          }}
        >
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="space-y-1 border-t p-1">
          {stack.layers.map((layer) => (
            <button
              key={layer.id}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                layer.id === selectedLayerId && "bg-primary text-primary-foreground hover:bg-primary",
              )}
              onClick={() => onSelectLayer(layer)}
            >
              {layer.viewedState === "viewed" ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">{layer.title}</span>
              {layer.commentCount > 0 ? <span>{layer.commentCount}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DiffViewer({
  file,
  diffMode,
  lines,
  symbolIndex,
  onComment,
  onSymbolClick,
}: {
  file: ReviewStackFile;
  diffMode: DiffMode;
  lines: DiffLine[];
  symbolIndex: CodeSymbolIndex;
  onComment: (target: CommentTarget) => void;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  if (file.kind !== "text") {
    return (
      <div className="m-4 rounded-md border bg-card p-4">
        <h2 className="text-sm font-semibold">{file.path}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Binary or non-text change.</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="m-4 rounded-md border bg-card p-4">
        <h2 className="text-sm font-semibold">{file.path}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Patch content is unavailable.</p>
      </div>
    );
  }

  return (
    <div className="diff-shell min-w-full text-xs" aria-label={`Diff for ${file.path}`}>
      <div className="diff-content">
        {diffMode === "side-by-side" ? (
          <div className="diff-code-grid min-w-[64rem]">
            {lines.map((line, index) => (
              <SplitDiffLine
                key={`${line.oldLine ?? "new"}:${line.newLine ?? "old"}:${index}`}
                line={line}
                file={file}
                symbolIndex={symbolIndex}
                onComment={onComment}
                onSymbolClick={onSymbolClick}
              />
            ))}
          </div>
        ) : (
          <div className="diff-code-grid min-w-[56rem]">
            {lines.map((line, index) => (
              <UnifiedDiffLine
                key={`${line.oldLine ?? "new"}:${line.newLine ?? "old"}:${index}`}
                line={line}
                file={file}
                symbolIndex={symbolIndex}
                onComment={onComment}
                onSymbolClick={onSymbolClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UnifiedDiffLine({
  line,
  file,
  symbolIndex,
  onComment,
  onSymbolClick,
}: {
  line: DiffLine;
  file: ReviewStackFile;
  symbolIndex: CodeSymbolIndex;
  onComment: (target: CommentTarget) => void;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const anchor = getCommentAnchor(file.path, line);
  return (
    <div className={cn("diff-row grid grid-cols-[52px_52px_24px_max-content_2.5rem] border-b", getDiffLineClass(line.kind))}>
      <div className="diff-gutter px-2 py-0.5 text-right">{line.oldLine ?? ""}</div>
      <div className="diff-gutter px-2 py-0.5 text-right">{line.newLine ?? ""}</div>
      <div className="diff-marker px-1.5 py-0.5 text-center">{getDiffPrefix(line.kind)}</div>
      <code className="diff-code-line diff-code-cell px-3 py-0.5">
        <CodeLineContent
          content={line.content}
          language={line.language}
          path={file.path}
          line={line}
          symbolIndex={symbolIndex}
          onSymbolClick={onSymbolClick}
        />
      </code>
      <div className="diff-comment-gutter px-1 py-0.5">
        {anchor ? (
          <button className="diff-line-comment-button" aria-label={`Comment on ${anchor.label}`} onClick={() => onComment(anchor)}>
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SplitDiffLine({
  line,
  file,
  symbolIndex,
  onComment,
  onSymbolClick,
}: {
  line: DiffLine;
  file: ReviewStackFile;
  symbolIndex: CodeSymbolIndex;
  onComment: (target: CommentTarget) => void;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const anchor = getCommentAnchor(file.path, line);
  const showLeft = line.kind === "deletion" || line.kind === "context";
  const showRight = line.kind === "addition" || line.kind === "context";
  return (
    <div className="diff-side-row grid grid-cols-[minmax(28rem,max-content)_minmax(28rem,max-content)_2.5rem] border-b">
      <div className={cn("diff-side-cell grid", showLeft ? getDiffLineClass(line.kind) : "diff-side-placeholder")}>
        <div className="diff-gutter px-2 py-0.5 text-right">{showLeft ? line.oldLine ?? "" : ""}</div>
        <div className="diff-marker px-1.5 py-0.5 text-center">{line.kind === "deletion" ? "-" : " "}</div>
        <code className="diff-code-line diff-code-cell px-3 py-0.5">
          {showLeft ? (
            <CodeLineContent
              content={line.content}
              language={line.language}
              path={file.path}
              line={line}
              symbolIndex={symbolIndex}
              onSymbolClick={onSymbolClick}
            />
          ) : (
            "\u00a0"
          )}
        </code>
      </div>
      <div className={cn("diff-side-cell grid", showRight ? getDiffLineClass(line.kind) : "diff-side-placeholder")}>
        <div className="diff-gutter px-2 py-0.5 text-right">{showRight ? line.newLine ?? "" : ""}</div>
        <div className="diff-marker px-1.5 py-0.5 text-center">{line.kind === "addition" ? "+" : " "}</div>
        <code className="diff-code-line diff-code-cell px-3 py-0.5">
          {showRight ? (
            <CodeLineContent
              content={line.content}
              language={line.language}
              path={file.path}
              line={line}
              symbolIndex={symbolIndex}
              onSymbolClick={onSymbolClick}
            />
          ) : (
            "\u00a0"
          )}
        </code>
      </div>
      <div className="diff-comment-gutter px-1 py-0.5">
        {anchor ? (
          <button className="diff-line-comment-button" aria-label={`Comment on ${anchor.label}`} onClick={() => onComment(anchor)}>
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CodeLineContent({
  content,
  language,
  path,
  line,
  symbolIndex,
  onSymbolClick,
}: {
  content: string;
  language: string;
  path: string;
  line: DiffLine;
  symbolIndex: CodeSymbolIndex;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const tokens = tokenizeCodeLine(content, language);
  if (tokens.length === 0) {
    return <span>{"\u00a0"}</span>;
  }

  return (
    <>
      {tokens.map((token, index) => (
        <SyntaxTokenView
          key={`${index}:${token.value}`}
          token={token}
          path={path}
          line={line}
          symbolIndex={symbolIndex}
          onSymbolClick={onSymbolClick}
        />
      ))}
    </>
  );
}

function SyntaxTokenView({
  token,
  path,
  line,
  symbolIndex,
  onSymbolClick,
}: {
  token: SyntaxToken;
  path: string;
  line: DiffLine;
  symbolIndex: CodeSymbolIndex;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const className = getSyntaxTokenClass(token.kind);
  if (token.symbolName) {
    const record = symbolIndex.recordsByName.get(token.symbolName);
    const definitionCount = record?.definitions.length ?? 0;
    const referenceCount = record?.references.length ?? 0;
    const lineNumber = line.newLine ?? line.oldLine ?? null;
    return (
      <button
        type="button"
        className={cn(className, "diff-token-symbol")}
        aria-label={`Open symbol references for ${token.symbolName}`}
        title={`${definitionCount} definitions, ${referenceCount} references`}
        onClick={() => onSymbolClick({ name: token.symbolName!, path, line: lineNumber })}
      >
        {token.value}
      </button>
    );
  }

  return <span className={className}>{token.value}</span>;
}

function ThreadItem({
  thread,
  onReply,
  onResolve,
}: {
  thread: CachedReviewThread;
  onReply: () => void;
  onResolve: () => void;
}) {
  return (
    <article className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{thread.authorLogin ?? "unknown"}</div>
          <div className="text-xs text-muted-foreground">
            {thread.filePath}{thread.line ? `:${thread.line}` : ""}
          </div>
        </div>
        <Badge variant={thread.state === "resolved" ? "success" : thread.state === "outdated" ? "warning" : "danger"}>{thread.state}</Badge>
      </div>
      <MarkdownContent className="text-sm" value={thread.body} />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onReply}>
          <Reply className="h-4 w-4" aria-hidden="true" />
          Reply
        </Button>
        <Button variant="outline" size="sm" onClick={onResolve}>
          <Check className="h-4 w-4" aria-hidden="true" />
          {thread.state === "resolved" ? "Unresolve" : "Resolve"}
        </Button>
      </div>
    </article>
  );
}

function SubmitReviewDialog({
  open,
  onOpenChange,
  event,
  body,
  pendingReview,
  busy,
  onEventChange,
  onBodyChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: PullRequestReviewEvent;
  body: string;
  pendingReview: PendingReview | null;
  busy: boolean;
  onEventChange: (event: PullRequestReviewEvent) => void;
  onBodyChange: (body: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-4 shadow-lg">
          <Dialog.Title className="text-base font-semibold">Submit Review</Dialog.Title>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as PullRequestReviewEvent[]).map((candidate) => (
              <button
                key={candidate}
                className={cn(
                  "h-9 rounded-md border px-2 text-xs font-medium hover:bg-accent",
                  event === candidate && "border-primary bg-accent",
                )}
                onClick={() => onEventChange(candidate)}
              >
                {candidate.replace("_", " ")}
              </button>
            ))}
          </div>
          <textarea
            className="mt-4 min-h-32 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            aria-label="Review summary"
          />
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{pendingReview ? "Pending review ready" : "No pending review"}</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={!pendingReview || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                Submit
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SymbolReferencesDialog({
  selection,
  record,
  onOpenChange,
  onNavigate,
}: {
  selection: SymbolSelection | null;
  record: CodeSymbolRecord | null;
  onOpenChange: (open: boolean) => void;
  onNavigate: (location: CodeSymbolLocation) => void;
}) {
  const definitions = record?.definitions ?? [];
  const references = record?.references ?? [];

  return (
    <Dialog.Root open={Boolean(selection)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(44rem,calc(100vh-2rem))] w-[min(58rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-card shadow-lg">
          <div className="border-b p-4">
            <Dialog.Title className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <FileCode2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{selection?.name ?? "Symbol"}</span>
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Definitions and references found in loaded pull request files.
            </Dialog.Description>
          </div>
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 md:grid-cols-2">
            <SymbolLocationList
              title="Definitions"
              emptyMessage="No definition is loaded for this symbol."
              locations={definitions}
              onNavigate={onNavigate}
            />
            <SymbolLocationList
              title="References"
              emptyMessage="No references are loaded for this symbol."
              locations={references}
              onNavigate={onNavigate}
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
            <span>
              {definitions.length} definition{definitions.length === 1 ? "" : "s"} · {references.length} reference
              {references.length === 1 ? "" : "s"}
            </span>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SymbolLocationList({
  title,
  emptyMessage,
  locations,
  onNavigate,
}: {
  title: string;
  emptyMessage: string;
  locations: CodeSymbolLocation[];
  onNavigate: (location: CodeSymbolLocation) => void;
}) {
  return (
    <section className="min-w-0 rounded-md border bg-background" aria-label={title}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
        <Badge variant="muted">{locations.length}</Badge>
      </div>
      {locations.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto p-2">
          {locations.map((location) => (
            <button
              key={location.id}
              className="mb-2 block w-full min-w-0 rounded-md border bg-card p-2 text-left hover:bg-accent"
              onClick={() => onNavigate(location)}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{formatSymbolLocation(location)}</span>
                <Badge variant={location.kind === "definition" ? "success" : "info"}>{location.side.toLowerCase()}</Badge>
              </div>
              <code className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-muted-foreground">
                {location.snippet}
              </code>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function getCommentAnchor(path: string, line: DiffLine): CommentTarget | null {
  if (line.kind === "addition" && line.newLine) {
    return {
      subjectType: "LINE",
      path,
      line: line.newLine,
      side: "RIGHT",
      label: `${path}:${line.newLine}`,
    };
  }
  if (line.kind === "deletion" && line.oldLine) {
    return {
      subjectType: "LINE",
      path,
      line: line.oldLine,
      side: "LEFT",
      label: `${path}:${line.oldLine}`,
    };
  }
  if (line.newLine) {
    return {
      subjectType: "LINE",
      path,
      line: line.newLine,
      side: "RIGHT",
      label: `${path}:${line.newLine}`,
    };
  }
  return null;
}

function getAuthBadge(session: AuthSession): { label: string; variant: "success" | "warning" | "danger" | "muted" | "info" } {
  if (session.state === "signed-in") {
    return { label: session.accountLogin ? `@${session.accountLogin}` : "Signed in", variant: "success" };
  }
  if (session.state === "checking") {
    return { label: "Checking", variant: "info" };
  }
  if (session.state === "storage-unavailable") {
    return { label: "Storage unavailable", variant: "danger" };
  }
  return { label: "Signed out", variant: "muted" };
}

function getStackBadgeVariant(kind: ReviewStack["kind"]): "success" | "warning" | "danger" | "muted" | "info" | "default" {
  if (kind === "contracts") {
    return "warning";
  }
  if (kind === "tests") {
    return "success";
  }
  if (kind === "generated" || kind === "docs") {
    return "muted";
  }
  if (kind === "interface") {
    return "info";
  }
  return "default";
}

function getDiffLineClass(kind: DiffLine["kind"]) {
  if (kind === "addition") {
    return "diff-line-addition";
  }
  if (kind === "deletion") {
    return "diff-line-deletion";
  }
  return "diff-line-context";
}

function getDiffPrefix(kind: DiffLine["kind"]) {
  if (kind === "addition") {
    return "+";
  }
  if (kind === "deletion") {
    return "-";
  }
  return " ";
}

function getSyntaxTokenClass(kind: SyntaxToken["kind"]) {
  if (kind === "keyword") {
    return "diff-token-keyword";
  }
  if (kind === "string") {
    return "diff-token-string";
  }
  if (kind === "number") {
    return "diff-token-number";
  }
  if (kind === "constant") {
    return "diff-token-constant";
  }
  if (kind === "comment") {
    return "diff-token-comment";
  }
  if (kind === "punctuation") {
    return "diff-token-punctuation";
  }
  if (kind === "symbol") {
    return "diff-token-identifier";
  }
  return "diff-token-plain";
}

function formatSymbolLocation(location: CodeSymbolLocation) {
  return `${location.path}${location.line ? `:${location.line}` : ""}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}
