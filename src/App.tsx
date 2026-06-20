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
  GitBranch,
  Github,
  GitPullRequest,
  AlertTriangle,
  Clock3,
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
  User,
  Users,
  X,
} from "lucide-react";
import { Fragment, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownContent } from "./components/markdown-content";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Kbd } from "./components/ui/kbd";
import { type AppUpdateClient, useAppUpdater } from "./lib/app-updater";
import { type AuthClient, type AuthSession, type OAuthStartResponse, tauriAuthClient } from "./lib/auth";
import {
  buildCodeSymbolIndex,
  inferHydratableDefinitionPaths,
  resolveCodeSymbolRecord,
  tokenizeCodeLine,
  type CodeSymbolIndex,
  type CodeSymbolLocation,
  type HydratedCodeSourceFile,
  type SyntaxToken,
} from "./lib/code-symbols";
import {
  buildLazyDiffState,
  getDefaultLoadedDiffHunkIds,
  getLanguageForPath,
  readDiffModePreference,
  writeDiffModePreference,
  type DiffHunkExpansion,
  type DiffHunkView,
  type DiffLine,
  type DiffMode,
  type LazyDiffState,
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
  type PendingReviewDraft,
  type PendingReviewSnapshot,
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
import { summarizeChecks, type ChecksSummary } from "./lib/review-overview";
import { type ThreadActionClient, tauriThreadActionClient } from "./lib/thread-actions";
import { cn } from "./lib/utils";
import {
  idleRefreshStatus,
  type AnalysisFileContent,
  type PullRequestSummary,
  type RefreshStatus,
  type WorkspaceClient,
  type WorkspaceRepository,
  tauriWorkspaceClient,
} from "./lib/workspace";

type Theme = "light" | "dark";
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";

type PullRequestPickerOption = {
  key: string;
  pullRequest: PullRequestSummary;
  title: string;
  repositoryLabel: string;
  authorLabel: string;
  assigneeLabel: string;
  reviewerLabel: string;
  branchLabel: string;
  updatedLabel: string;
  reviewReadinessLabel: string;
  reviewReadinessVariant: BadgeVariant;
  reviewDecisionLabel: string;
  reviewDecisionVariant: BadgeVariant;
  checksLabel: string;
  checksVariant: BadgeVariant;
  checksDetailLabel: string;
  changedFilesLabel: string;
  changedLinesLabel: string;
  reviewThreadsLabel: string;
  cacheLabel: string;
  failingCheckNames: string[];
};

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
  target?: CommentTarget;
};

type PublishedLineDraft = PublishedDraft & {
  target: Extract<CommentTarget, { subjectType: "LINE" }>;
};

type InlineLineComment = {
  id: string;
  authorLogin: string | null;
  body: string;
  label: string;
  state: CachedReviewThread["state"] | "draft";
  source: "thread" | "draft";
};

type CommentFeedback = {
  targetLabel: string;
  kind: "error" | "info";
  message: string;
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
  const [pullRequestPickerOpen, setPullRequestPickerOpen] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>(idleRefreshStatus);
  const [pullRequestDataStatus, setPullRequestDataStatus] = useState<{
    key: string | null;
    state: "idle" | "loading" | "loaded" | "failed";
    message: string | null;
  }>({ key: null, state: "idle", message: null });
  const [livePullRequestDataByKey, setLivePullRequestDataByKey] = useState<Record<string, CachedPullRequestData>>({});
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
  const [viewedBusyStackIds, setViewedBusyStackIds] = useState<string[]>([]);
  const [fileCollapseOverrides, setFileCollapseOverrides] = useState<Record<string, boolean>>({});
  const [sourceContentByPath, setSourceContentByPath] = useState<Record<string, string | null>>({});
  const [recoveredPatchByReviewKeyAndPath, setRecoveredPatchByReviewKeyAndPath] = useState<Record<string, Record<string, string | null>>>({});
  const [expandedHunkContexts, setExpandedHunkContexts] = useState<Record<string, Record<string, DiffHunkExpansion>>>({});
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [lineCommentViewerTarget, setLineCommentViewerTarget] = useState<Extract<CommentTarget, { subjectType: "LINE" }> | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentFeedback, setCommentFeedback] = useState<CommentFeedback | null>(null);
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
  const clonePrepareAttemptedRef = useRef<Set<string>>(new Set());
  const selectedPullRequestReviewKeyRef = useRef<string | null>(null);
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
  selectedPullRequestReviewKeyRef.current = selectedPullRequestReviewKey;
  const selectedPullRequestIsFallback = routedPullRequests.length === 0 && !quickOpenedPullRequest;
  const currentUserKey = authSession.accountLogin ?? "local-user";
  const cacheStore = useMemo(() => readCacheStore(), [cacheRevision]);
  const cachedData = selectedPullRequestIsFallback
    ? null
    : cacheStore.entries[selectedPullRequestReviewKey] ?? readCachedPullRequest(selectedPullRequestReviewKey);
  const livePullRequestData = selectedPullRequestIsFallback ? null : (livePullRequestDataByKey[selectedPullRequestReviewKey] ?? null);
  const reviewData = livePullRequestData ?? cachedData ?? createFallbackPullRequestData();
  const pullRequestPickerOptions = useMemo(
    () =>
      routedPullRequests.map((pullRequest) => {
        const key = getPullRequestKey(pullRequest);
        return buildPullRequestPickerOption(pullRequest, livePullRequestDataByKey[key] ?? cacheStore.entries[key]);
      }),
    [cacheStore, livePullRequestDataByKey, routedPullRequests],
  );
  const selectedPullRequestPickerOption = useMemo(
    () => buildPullRequestPickerOption(selectedPullRequest, livePullRequestData ?? cachedData),
    [cachedData, livePullRequestData, selectedPullRequest],
  );
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
  const selectedStack = stackModel.stacks.find((stack) => stack.id === selectedStackId) ?? stackModel.stacks[0] ?? null;
  const selectedLayer =
    selectedStack?.layers.find((layer) => layer.id === selectedLayerId) ?? selectedStack?.layers[0] ?? null;
  const selectedLayerFilePaths = selectedLayer?.filePaths ?? [];
  const activeFile =
    (activeFilePath ? stackModel.filesByPath.get(activeFilePath) : null) ??
    (selectedLayerFilePaths[0] ? stackModel.filesByPath.get(selectedLayerFilePaths[0]) : null) ??
    null;
  const activeFileIndex = activeFile ? selectedLayerFilePaths.indexOf(activeFile.path) : -1;
  const activeFileSummary = activeFile ? reviewData.fileSummaries.find((file) => file.path === activeFile.path) ?? null : null;
  const activeFileSourceContent = activeFile ? sourceContentByPath[activeFile.path] : undefined;
  const activeFileRecoveredPatch = activeFile ? recoveredPatchByReviewKeyAndPath[selectedPullRequestReviewKey]?.[activeFile.path] : undefined;
  const activeFileSummaryForDiff =
    activeFileSummary && typeof activeFileRecoveredPatch === "string" && !activeFileSummary.patch
      ? {
          ...activeFileSummary,
          patch: activeFileRecoveredPatch,
        }
      : activeFileSummary;
  const activeFileExpandedHunkContexts = activeFile ? (expandedHunkContexts[activeFile.path] ?? {}) : {};
  const activeLayerThreads = effectiveThreads.filter((thread) => selectedLayerFilePaths.includes(thread.filePath));
  const activeFileThreads = activeFile ? effectiveThreads.filter((thread) => thread.filePath === activeFile.path) : [];
  const activeFileLineDrafts = activeFile
    ? publishedDrafts
        .filter((draft): draft is PublishedLineDraft => draft.target?.subjectType === "LINE" && draft.target.path === activeFile.path)
    : [];
  const diffState =
    activeFileSummaryForDiff && activeFile
      ? buildLazyDiffState(activeFileSummaryForDiff, {
          mode: diffMode,
          repository: selectedPullRequest.repository,
          pullRequestNumber: selectedPullRequest.number,
          loadedHunkIds: getDefaultLoadedDiffHunkIds(activeFileSummaryForDiff),
          expandedHunkContexts: activeFileExpandedHunkContexts,
          sourceContent: typeof activeFileSourceContent === "string" ? activeFileSourceContent : null,
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
  const activeFileCollapsed = activeFile ? fileCollapseOverrides[activeFile.path] ?? activeFileViewed : false;
  const lineCommentTarget = commentTarget?.subjectType === "LINE" ? commentTarget : null;
  const sidePanelCommentTarget = commentTarget?.subjectType === "LINE" ? null : commentTarget;
  const activeCommentFeedback =
    commentTarget && commentFeedback?.targetLabel === commentTarget.label ? commentFeedback : null;
  const updateBusy = updater.isChecking || updater.isUpdating;
  const updateButtonLabel = updater.isUpdating ? "Updating" : updater.isChecking ? "Checking" : "Check updates";
  const updateStatusLabel =
    updater.statusMessage === "Updates ready" && !updater.updateInfo
      ? "Current"
      : updater.updateInfo && updater.statusMessage === "Updates ready"
        ? `Update ${updater.updateInfo.version}`
        : updater.statusMessage;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("narview.theme", theme);
  }, [theme]);

  useEffect(() => {
    writeDiffModePreference(diffMode);
  }, [diffMode]);

  useEffect(() => {
    selectedPullRequestReviewKeyRef.current = selectedPullRequestReviewKey;
  }, [selectedPullRequestReviewKey]);

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
    setViewedBusyPaths([]);
    setViewedBusyStackIds([]);
    setFileCollapseOverrides({});
    setSourceContentByPath({});
    setRecoveredPatchByReviewKeyAndPath({});
    setExpandedHunkContexts({});
    setOptimisticThreads([]);
    setThreadStateOverrides({});
    setPendingReview(null);
    setPublishedDrafts([]);
    setCommentTarget(null);
    setLineCommentViewerTarget(null);
    setCommentBody("");
    setCommentFeedback(null);
    setActionMessage(null);
  }, [selectedPullRequestReviewKey]);

  useEffect(() => {
    if (selectedPullRequestIsFallback || authSession.state !== "signed-in") {
      return;
    }

    const reviewKey = selectedPullRequestReviewKey;
    let active = true;

    async function reconnectPendingReview() {
      try {
        const snapshot = await reviewActionClient.findPendingReview({
          repository: selectedPullRequest.repository,
          pullRequestNumber: selectedPullRequest.number,
        });

        if (!active || selectedPullRequestReviewKeyRef.current !== reviewKey || !snapshot) {
          return;
        }

        setPendingReview({
          pullRequestId: snapshot.pullRequestId,
          pullRequestReviewId: snapshot.pullRequestReviewId,
          state: snapshot.state,
          message: snapshot.message,
        });
        setPublishedDrafts(draftsFromPendingReviewSnapshot(snapshot));
        setOptimisticThreads((current) => mergeReviewThreads(current, optimisticThreadsFromPendingReviewSnapshot(snapshot)));
      } catch (error) {
        if (active && selectedPullRequestReviewKeyRef.current === reviewKey) {
          setActionMessage(`Could not reconnect to the pending review: ${getErrorMessage(error)}`);
        }
      }
    }

    void reconnectPendingReview();

    return () => {
      active = false;
    };
  }, [
    authSession.state,
    reviewActionClient,
    selectedPullRequest.repository,
    selectedPullRequest.number,
    selectedPullRequestReviewKey,
    selectedPullRequestIsFallback,
  ]);

  useEffect(() => {
    const path = activeFileSummary?.path;
    if (
      !path ||
      activeFile?.kind !== "text" ||
      selectedPullRequestIsFallback ||
      activeFileSummary.patch ||
      activeFileRecoveredPatch !== undefined
    ) {
      return;
    }

    const activePath = path;
    const reviewKey = selectedPullRequestReviewKey;
    let active = true;

    async function readActiveFilePatch() {
      const readPatch = () => workspaceClient.readPullRequestFilePatches(selectedPullRequest, [activePath]);

      try {
        let response = await readPatch();
        let filePatch = response.files.find((file) => file.path === activePath) ?? response.files[0] ?? null;
        if (filePatch?.state !== "loaded" && !clonePrepareAttemptedRef.current.has(reviewKey)) {
          clonePrepareAttemptedRef.current.add(reviewKey);
          await workspaceClient.preparePullRequestReviewClone(selectedPullRequest);
          response = await readPatch();
          filePatch = response.files.find((file) => file.path === activePath) ?? response.files[0] ?? null;
        }

        if (!active || selectedPullRequestReviewKeyRef.current !== reviewKey) {
          return;
        }
        setRecoveredPatchByReviewKeyAndPath((current) => ({
          ...current,
          [reviewKey]: {
            ...(current[reviewKey] ?? {}),
            [activePath]: filePatch?.state === "loaded" ? (filePatch.content ?? "") : null,
          },
        }));
      } catch {
        if (active && selectedPullRequestReviewKeyRef.current === reviewKey) {
          setRecoveredPatchByReviewKeyAndPath((current) => ({
            ...current,
            [reviewKey]: {
              ...(current[reviewKey] ?? {}),
              [activePath]: null,
            },
          }));
        }
      }
    }

    void readActiveFilePatch();

    return () => {
      active = false;
    };
  }, [
    activeFileRecoveredPatch,
    activeFile?.kind,
    activeFileSummary?.patch,
    activeFileSummary?.path,
    selectedPullRequest,
    selectedPullRequestIsFallback,
    selectedPullRequestReviewKey,
    workspaceClient,
  ]);

  useEffect(() => {
    const path = activeFile?.path;
    if (!path || selectedPullRequestIsFallback || activeFileSourceContent !== undefined) {
      return;
    }

    const activePath = path;
    let active = true;
    async function readActiveFileSource() {
      const readSource = () => workspaceClient.readPullRequestAnalysisFiles(selectedPullRequest, [activePath]);

      try {
        let response = await readSource();
        let fileContent = response.files.find((file) => file.path === activePath) ?? response.files[0] ?? null;
        const prepareKey = selectedPullRequestReviewKey;
        if (fileContent?.state !== "loaded" && !clonePrepareAttemptedRef.current.has(prepareKey)) {
          clonePrepareAttemptedRef.current.add(prepareKey);
          await workspaceClient.preparePullRequestReviewClone(selectedPullRequest);
          response = await readSource();
          fileContent = response.files.find((file) => file.path === activePath) ?? response.files[0] ?? null;
        }

        if (!active) {
          return;
        }
        setSourceContentByPath((current) => ({
          ...current,
          [activePath]: fileContent?.state === "loaded" ? (fileContent.content ?? "") : null,
        }));
      } catch {
        if (active) {
          setSourceContentByPath((current) => ({ ...current, [activePath]: null }));
        }
      }
    }

    void readActiveFileSource();

    return () => {
      active = false;
    };
  }, [
    activeFile?.path,
    activeFileSourceContent,
    selectedPullRequest,
    selectedPullRequestIsFallback,
    selectedPullRequestReviewKey,
    workspaceClient,
  ]);

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
        setLivePullRequestDataByKey((current) => ({
          ...current,
          [selectedPullRequestReviewKey]: data,
        }));
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
    if (!pullRequestPickerOpen || authSession.state !== "signed-in" || routedPullRequests.length === 0) {
      return;
    }

    const pullRequestsMissingChecks = routedPullRequests.filter((pullRequest) => {
      const entry = cacheStore.entries[getPullRequestKey(pullRequest)];
      return !entry || entry.checks.length === 0;
    });

    if (pullRequestsMissingChecks.length === 0) {
      return;
    }

    let active = true;
    async function hydratePullRequestPickerChecks() {
      for (const pullRequest of pullRequestsMissingChecks) {
        try {
          const response = await workspaceClient.fetchPullRequestChecks(pullRequest);
          if (!active) {
            return;
          }
          upsertCachedPullRequest(pullRequest, {
            checks: response.checks,
            rateLimit: response.rateLimit,
            fetchedAtEpochMs: response.fetchedAtEpochMs,
          });
          setCacheRevision((current) => current + 1);
        } catch {
          // The picker still has useful PR metadata when checks cannot be refreshed.
        }
      }
    }

    void hydratePullRequestPickerChecks();

    return () => {
      active = false;
    };
  }, [authSession.state, cacheStore, pullRequestPickerOpen, routedPullRequests, workspaceClient]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
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
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openSelectedPullRequestInGithub();
      }
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPullRequestPickerOpen(true);
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
      setLivePullRequestDataByKey({});
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
    const previousCollapseOverride = fileCollapseOverrides[path];
    const nextState: FileViewedState = viewed ? "VIEWED" : "UNVIEWED";
    setViewedBusyPaths((current) => [...new Set([...current, path])]);
    setViewedOverrides((current) => ({ ...current, [path]: nextState }));
    setFileCollapseOverride(path, viewed);
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
      setFileCollapseOverride(path, result.viewerViewedState === "VIEWED");
      applyViewedStateToCache(path, result.viewerViewedState);
      setActionMessage(result.message);
    } catch (error) {
      setViewedOverrides((current) => ({ ...current, [path]: previousState }));
      restoreFileCollapseOverride(path, previousCollapseOverride);
      applyViewedStateToCache(path, previousState);
      setActionMessage(getErrorMessage(error));
    } finally {
      setViewedBusyPaths((current) => current.filter((busyPath) => busyPath !== path));
    }
  }

  function handleMarkStackViewed(stack: ReviewStack) {
    if (viewedBusyStackIds.includes(stack.id)) {
      return;
    }

    const unviewedFiles = stack.filePaths.filter((path) => getViewedState(path) !== "VIEWED" && !viewedBusyPaths.includes(path));
    if (unviewedFiles.length === 0) {
      setActionMessage("Stack is already viewed.");
      return;
    }

    const reviewKey = selectedPullRequestReviewKey;
    const pullRequest = selectedPullRequest;
    const stackId = stack.id;
    const previousCollapseOverrides = new Map<string, boolean | undefined>();
    const previousStates = new Map<string, FileViewedState>();

    setViewedBusyStackIds((current) => [...new Set([...current, stackId])]);
    setViewedBusyPaths((current) => [...new Set([...current, ...unviewedFiles])]);
    setActionMessage(
      `Marking ${unviewedFiles.length} file${unviewedFiles.length === 1 ? "" : "s"} viewed in the background.`,
    );

    for (const path of unviewedFiles) {
      const previousState = getViewedState(path);
      previousStates.set(path, previousState);
      previousCollapseOverrides.set(path, fileCollapseOverrides[path]);
      setViewedOverrides((current) => ({ ...current, [path]: "VIEWED" }));
      setFileCollapseOverride(path, true);
      applyViewedStateToCache(path, "VIEWED", reviewKey);
    }

    async function syncStackViewedInBackground() {
      const failures: string[] = [];

      for (const path of unviewedFiles) {
        const previousState = previousStates.get(path) ?? "UNVIEWED";
        try {
          const result = await reviewActionClient.setFileViewed({
            repository: pullRequest.repository,
            pullRequestNumber: pullRequest.number,
            path,
            viewed: true,
          });
          if (!result.ok) {
            throw new Error(result.message);
          }
          applyViewedStateToCache(path, result.viewerViewedState, reviewKey);
          if (selectedPullRequestReviewKeyRef.current === reviewKey) {
            setViewedOverrides((current) => ({ ...current, [path]: result.viewerViewedState }));
            setFileCollapseOverride(path, result.viewerViewedState === "VIEWED");
          }
        } catch (error) {
          failures.push(`${path}: ${getErrorMessage(error)}`);
          applyViewedStateToCache(path, previousState, reviewKey);
          if (selectedPullRequestReviewKeyRef.current === reviewKey) {
            setViewedOverrides((current) => ({ ...current, [path]: previousState }));
            restoreFileCollapseOverride(path, previousCollapseOverrides.get(path));
          }
        } finally {
          if (selectedPullRequestReviewKeyRef.current === reviewKey) {
            setViewedBusyPaths((current) => current.filter((busyPath) => busyPath !== path));
          }
        }
      }

      if (selectedPullRequestReviewKeyRef.current === reviewKey) {
        setViewedBusyStackIds((current) => current.filter((busyStackId) => busyStackId !== stackId));
        setActionMessage(
          failures.length === 0
            ? `Marked ${unviewedFiles.length} file${unviewedFiles.length === 1 ? "" : "s"} viewed on GitHub.`
            : `Viewed sync failed for ${failures.length} file${failures.length === 1 ? "" : "s"}: ${failures.join("; ")}`,
        );
      }
    }

    void syncStackViewedInBackground();
  }

  async function handleAddPendingComment() {
    const target = commentTarget;
    const body = commentBody.trim();
    if (!target) {
      setActionMessage("Choose a comment target first.");
      return;
    }

    const input = buildPendingCommentInput(target, body);
    const validation = validatePendingReviewThreadInput(input);
    if (validation) {
      setCommentFeedback({ targetLabel: target.label, kind: "error", message: validation });
      setActionMessage(validation);
      return;
    }

    setActionBusy(true);
    setCommentFeedback({
      targetLabel: target.label,
      kind: "info",
      message: "Adding draft comment to the pending review.",
    });
    try {
      const result = await reviewActionClient.addPendingReviewThread(input);
      setPendingReview({
        pullRequestId: result.pullRequestId,
        pullRequestReviewId: result.pullRequestReviewId,
        state: result.state,
        message: result.message,
      });
      if (result.thread) {
        setOptimisticThreads((current) => mergeReviewThreads(current, [result.thread!]));
      }
      setPublishedDrafts((current) => [
        ...current,
        {
          id: result.thread?.id ?? `draft:${Date.now()}`,
          body,
          targetLabel: target.label,
          target,
        },
      ]);
      setCommentBody("");
      setCommentTarget(null);
      setCommentFeedback(null);
      setActionMessage(result.message);
    } catch (error) {
      const message = getErrorMessage(error);
      setCommentFeedback({ targetLabel: target.label, kind: "error", message });
      setActionMessage(message);
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
      setLivePullRequestDataByKey((current) => ({
        ...current,
        [selectedPullRequestReviewKey]: data,
      }));
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

  async function openSelectedPullRequestInGithub() {
    if (!selectedPullRequest.url) {
      setActionMessage("No GitHub URL is available for this pull request.");
      return;
    }

    try {
      await openUrl(selectedPullRequest.url);
      setActionMessage("Opened pull request in GitHub.");
    } catch (error) {
      setActionMessage(getErrorMessage(error));
    }
  }

  function buildPendingCommentInput(target: CommentTarget, body: string): AddPendingReviewThreadInput {
    const base = {
      repository: selectedPullRequest.repository,
      pullRequestNumber: selectedPullRequest.number,
      pullRequestReviewId: pendingReview?.pullRequestReviewId ?? null,
      body,
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

  function applyViewedStateToCache(path: string, state: FileViewedState, reviewKey = selectedPullRequestReviewKey) {
    if (selectedPullRequestIsFallback) {
      return;
    }

    setLivePullRequestDataByKey((current) => {
      const liveEntry = current[reviewKey];
      if (!liveEntry) {
        return current;
      }

      return {
        ...current,
        [reviewKey]: {
          ...liveEntry,
          fileSummaries: liveEntry.fileSummaries.map((file) =>
            file.path === path
              ? {
                  ...file,
                  viewerViewedState: state,
                }
              : file,
          ),
        },
      };
    });

    const current = readCacheStore().entries[reviewKey];
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

  function setFileCollapseOverride(path: string, collapsed: boolean) {
    setFileCollapseOverrides((current) => ({ ...current, [path]: collapsed }));
  }

  function restoreFileCollapseOverride(path: string, previousOverride: boolean | undefined) {
    setFileCollapseOverrides((current) => {
      const next = { ...current };
      if (previousOverride === undefined) {
        delete next[path];
      } else {
        next[path] = previousOverride;
      }
      return next;
    });
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

  function toggleActiveFileCollapsed() {
    if (!activeFile) {
      return;
    }
    setFileCollapseOverride(activeFile.path, !activeFileCollapsed);
  }

  function moveActiveFile(direction: 1 | -1) {
    if (selectedLayerFilePaths.length === 0) {
      return;
    }

    const currentIndex = activeFileIndex >= 0 ? activeFileIndex : 0;
    const nextIndex = (currentIndex + direction + selectedLayerFilePaths.length) % selectedLayerFilePaths.length;
    setActiveFilePath(selectedLayerFilePaths[nextIndex]);
  }

  function expandActiveHunkContext(hunkId: string, direction: "before" | "after") {
    if (!activeFile) {
      return;
    }

    setExpandedHunkContexts((current) => {
      const fileContexts = current[activeFile.path] ?? {};
      const previous = fileContexts[hunkId] ?? { before: 0, after: 0 };
      return {
        ...current,
        [activeFile.path]: {
          ...fileContexts,
          [hunkId]: {
            ...previous,
            [direction]: previous[direction] + 20,
          },
        },
      };
    });
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

          <PullRequestPickerDialog
            open={pullRequestPickerOpen}
            onOpenChange={setPullRequestPickerOpen}
            options={pullRequestPickerOptions}
            selectedKey={selectedPullRequestReviewKey}
            busy={workspaceBusy}
            onRefresh={() => void refreshPullRequests(includeDrafts)}
            onSelect={(key) => {
              setSelectedPullRequestKey(key);
              setPullRequestPickerOpen(false);
            }}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="hidden h-8 max-w-[24rem] min-w-0 justify-start lg:flex"
                aria-label="Pull Request"
              >
                <GitPullRequest className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">{selectedPullRequestPickerOption.title}</span>
                <Badge variant={selectedPullRequestPickerOption.checksVariant}>{selectedPullRequestPickerOption.checksLabel}</Badge>
                <Kbd>P</Kbd>
              </Button>
            }
          />

          <Button variant="outline" size="icon" aria-label="Refresh Pull Requests" onClick={() => void refreshPullRequests(includeDrafts)} disabled={workspaceBusy}>
            <RefreshCw className={cn("h-4 w-4", workspaceBusy && "animate-spin")} aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" aria-label={themeLabel} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </Button>
          <SubmitReviewDialog
            open={submitDialogOpen}
            onOpenChange={setSubmitDialogOpen}
            event={reviewEvent}
            body={reviewSummary}
            drafts={publishedDrafts}
            pendingReview={pendingReview}
            busy={actionBusy}
            trigger={
              <Button
                variant={publishedDrafts.length > 0 ? "default" : "outline"}
                size="sm"
                disabled={actionBusy}
                aria-label={`Submit review (${publishedDrafts.length} comment${publishedDrafts.length === 1 ? "" : "s"})`}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Submit review
                <Badge variant={publishedDrafts.length > 0 ? "default" : "muted"}>{publishedDrafts.length}</Badge>
              </Button>
            }
            onEventChange={setReviewEvent}
            onBodyChange={setReviewSummary}
            onSubmit={handleSubmitReview}
          />
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
                    markViewedBusy={viewedBusyStackIds.includes(stack.id)}
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
                  variant={activeFileCollapsed ? "secondary" : "outline"}
                  size="icon"
                  aria-label={
                    activeFile
                      ? activeFileCollapsed
                        ? `Expand ${activeFile.path}`
                        : `Collapse ${activeFile.path}`
                      : "Collapse active file"
                  }
                  disabled={!activeFile}
                  onClick={toggleActiveFileCollapsed}
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform", activeFileCollapsed && "-rotate-90")} aria-hidden="true" />
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

            <LayerFileBar
              filePaths={selectedLayerFilePaths}
              filesByPath={stackModel.filesByPath}
              activeFile={activeFile}
              activeFileIndex={activeFileIndex}
              viewedBusyPaths={viewedBusyPaths}
              getViewedState={getViewedState}
              onSelectFile={setActiveFilePath}
              onMoveFile={moveActiveFile}
            />

            <div className="min-h-0 flex-1 overflow-auto" aria-label="Diff scroll area">
              {diffState && activeFile ? (
                activeFileCollapsed ? (
                  <CollapsedDiffPlaceholder file={activeFile} onExpand={() => setFileCollapseOverride(activeFile.path, false)} />
                ) : (
                  <DiffViewer
                    file={activeFile}
                    diffMode={diffMode}
                    diffState={diffState}
                    symbolIndex={symbolIndex}
                    threads={activeFileThreads}
                    drafts={activeFileLineDrafts}
                    commentViewerTarget={lineCommentViewerTarget}
                    commentTarget={lineCommentTarget}
                    commentBody={lineCommentTarget ? commentBody : ""}
                    commentFeedback={lineCommentTarget ? activeCommentFeedback : null}
                    commentBusy={actionBusy}
                    sourceAvailable={typeof activeFileSourceContent === "string"}
                    onExpandHunkContext={expandActiveHunkContext}
                    onComment={(target) => {
                      setLineCommentViewerTarget(null);
                      setCommentTarget(target);
                      setCommentBody("");
                      setCommentFeedback(null);
                    }}
                    onViewComments={(target) => {
                      setCommentTarget(null);
                      setCommentBody("");
                      setCommentFeedback(null);
                      setLineCommentViewerTarget(target);
                    }}
                    onCloseCommentViewer={() => setLineCommentViewerTarget(null)}
                    onCommentBodyChange={(body) => {
                      setCommentBody(body);
                      if (activeCommentFeedback?.kind === "error") {
                        setCommentFeedback(null);
                      }
                    }}
                    onSubmitComment={() => void handleAddPendingComment()}
                    onCancelComment={() => {
                      setCommentTarget(null);
                      setCommentBody("");
                      setCommentFeedback(null);
                    }}
                    onSymbolClick={setSymbolSelection}
                  />
                )
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
                        onClick={() => {
                          setCommentTarget({
                            subjectType: "FILE",
                            path: activeFile.path,
                            label: activeFile.path,
                          });
                          setCommentBody("");
                          setCommentFeedback(null);
                        }}
                      >
                        <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        File
                      </Button>
                    ) : null}
                  </div>
                  {sidePanelCommentTarget ? (
                    <>
                      <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">{sidePanelCommentTarget.label}</div>
                      <textarea
                        className="min-h-24 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={commentBody}
                        onChange={(event) => {
                          setCommentBody(event.target.value);
                          if (activeCommentFeedback?.kind === "error") {
                            setCommentFeedback(null);
                          }
                        }}
                        aria-label="Draft review comment"
                      />
                      {activeCommentFeedback ? <CommentComposerFeedback feedback={activeCommentFeedback} /> : null}
                      <Button className="w-full" onClick={() => void handleAddPendingComment()} disabled={actionBusy || commentBody.trim().length === 0}>
                        {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquare className="h-4 w-4" aria-hidden="true" />}
                        {actionBusy ? "Adding..." : "Add To Review"}
                      </Button>
                    </>
                  ) : (
                    <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
                      {lineCommentTarget ? `Line draft: ${lineCommentTarget.label}` : "Choose a file or thread."}
                    </div>
                  )}
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
                          setCommentFeedback(null);
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
            <button className="hover:text-foreground" onClick={() => void openSelectedPullRequestInGithub()}>
              GitHub
            </button>
            <span className="whitespace-nowrap font-mono">App v{updater.currentVersion}</span>
            <button
              className="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void updater.checkForUpdates()}
              disabled={updateBusy}
              aria-label={`Check for updates. Current version ${updater.currentVersion}`}
              title={updater.error ?? updater.statusMessage}
            >
              {updateBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{updateButtonLabel}</span>
            </button>
            <span className="hidden max-w-48 truncate md:inline" title={updater.error ?? updater.statusMessage}>
              {updateStatusLabel}
            </span>
            <span className="hidden items-center gap-1 lg:flex">
              <Kbd>J</Kbd>/<Kbd>K</Kbd>
              <Kbd>Z</Kbd>
              <Kbd>P</Kbd>
              <Kbd>O</Kbd>
            </span>
          </div>
        </footer>
      </div>
      <SymbolReferencesDialog
        selection={symbolSelection}
        symbolIndex={symbolIndex}
        files={reviewData.fileSummaries}
        pullRequest={selectedPullRequest}
        workspaceClient={workspaceClient}
        hydrationDisabled={selectedPullRequestIsFallback}
        sourceContentByPath={sourceContentByPath}
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

function draftsFromPendingReviewSnapshot(snapshot: PendingReviewSnapshot): PublishedDraft[] {
  return snapshot.drafts.map((draft) => ({
    id: draft.id,
    body: draft.body,
    targetLabel: pendingDraftTargetLabel(draft),
    target: commentTargetFromPendingDraft(draft),
  }));
}

function optimisticThreadsFromPendingReviewSnapshot(snapshot: PendingReviewSnapshot): CachedReviewThread[] {
  return snapshot.drafts
    .filter((draft) => draft.filePath)
    .map((draft) => ({
      id: `pending-review-draft:${draft.id}`,
      authorLogin: draft.authorLogin,
      filePath: draft.filePath ?? "",
      line: draft.line,
      state: "unresolved",
      body: draft.body,
      updatedAt: draft.updatedAt,
      comments: [
        {
          id: draft.id,
          authorLogin: draft.authorLogin,
          body: draft.body,
          updatedAt: draft.updatedAt,
          url: draft.url,
        },
      ],
    }));
}

function mergeReviewThreads(current: CachedReviewThread[], next: CachedReviewThread[]): CachedReviewThread[] {
  if (next.length === 0) {
    return current;
  }

  const byId = new Map(current.map((thread) => [thread.id, thread]));
  for (const thread of next) {
    byId.set(thread.id, thread);
  }
  return [...byId.values()];
}

function commentTargetFromPendingDraft(draft: PendingReviewDraft): CommentTarget | undefined {
  if (!draft.filePath) {
    return undefined;
  }

  if (draft.line && draft.line > 0) {
    const label = `${draft.filePath}:${draft.line}`;
    return {
      subjectType: "LINE",
      path: draft.filePath,
      line: draft.line,
      side: "RIGHT",
      label,
    };
  }

  return {
    subjectType: "FILE",
    path: draft.filePath,
    label: draft.filePath,
  };
}

function pendingDraftTargetLabel(draft: PendingReviewDraft): string {
  if (draft.filePath && draft.line) {
    return `${draft.filePath}:${draft.line}`;
  }
  if (draft.filePath) {
    return draft.filePath;
  }
  return "Pending review comment";
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
        <Dialog.Content className="fixed inset-x-4 top-24 z-50 mx-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border bg-card p-4 shadow-lg">
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
          {markViewedBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
          )}
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

function LayerFileBar({
  filePaths,
  filesByPath,
  activeFile,
  activeFileIndex,
  viewedBusyPaths,
  getViewedState,
  onSelectFile,
  onMoveFile,
}: {
  filePaths: string[];
  filesByPath: Map<string, ReviewStackFile>;
  activeFile: ReviewStackFile | null;
  activeFileIndex: number;
  viewedBusyPaths: string[];
  getViewedState: (path: string) => FileViewedState;
  onSelectFile: (path: string) => void;
  onMoveFile: (direction: 1 | -1) => void;
}) {
  const activePath = activeFile ? splitFilePath(activeFile.path) : null;
  const fileCountLabel =
    activeFile && activeFileIndex >= 0 ? `File ${activeFileIndex + 1} of ${filePaths.length}` : `${filePaths.length} files`;

  return (
    <div className="shrink-0 border-b bg-background" aria-label="Layer files">
      <div className="flex min-h-16 items-center gap-3 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous file in layer"
            disabled={filePaths.length <= 1}
            onClick={() => onMoveFile(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next file in layer"
            disabled={filePaths.length <= 1}
            onClick={() => onMoveFile(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {activeFile && activePath ? (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {activeFile.kind === "text" ? (
                <FileCode2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <h2 className="truncate text-sm font-semibold">{activePath.name}</h2>
              <Badge variant="muted">{formatFileStatus(activeFile.status)}</Badge>
              <ViewedStateIcon
                path={activeFile.path}
                viewed={getViewedState(activeFile.path) === "VIEWED"}
                busy={viewedBusyPaths.includes(activeFile.path)}
              />
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <code className="min-w-0 max-w-full truncate font-mono text-muted-foreground">
                {activePath.directory ? `${activePath.directory}/` : ""}
                <span className="text-foreground">{activePath.name}</span>
              </code>
              <ChangeStat additions={activeFile.additions} deletions={activeFile.deletions} />
              <span className="shrink-0 text-muted-foreground">{fileCountLabel}</span>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">No file selected.</div>
        )}
      </div>

      {filePaths.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2" aria-label="Files in active layer">
          {filePaths.map((path) => {
            const file = filesByPath.get(path);
            const pathParts = splitFilePath(path);
            const viewed = getViewedState(path) === "VIEWED";
            const busy = viewedBusyPaths.includes(path);
            return (
              <button
                key={path}
                className={cn(
                  "group inline-flex h-8 min-w-48 max-w-[24rem] shrink-0 items-center gap-2 rounded-md border bg-card px-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-accent-foreground",
                  activeFile?.path === path && "border-primary bg-accent text-accent-foreground",
                )}
                title={path}
                onClick={() => onSelectFile(path)}
              >
                {file?.kind === "text" ? (
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{pathParts.name}</span>
                {file ? <ChangeStat additions={file.additions} deletions={file.deletions} compact /> : null}
                <ViewedStateIcon path={path} viewed={viewed} busy={busy} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ChangeStat({
  additions,
  deletions,
  compact = false,
}: {
  additions: number;
  deletions: number;
  compact?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 font-mono", compact ? "text-[11px]" : "text-xs")}
      aria-label={`${additions} additions and ${deletions} deletions`}
    >
      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">+{additions}</span>
      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">-{deletions}</span>
    </span>
  );
}

function ViewedStateIcon({
  path,
  viewed,
  busy,
}: {
  path: string;
  viewed: boolean;
  busy: boolean;
}) {
  return (
    <span className="inline-flex shrink-0 rounded p-0.5" aria-label={viewed ? `${path} viewed` : `${path} unviewed`}>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : viewed ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

function CollapsedDiffPlaceholder({
  file,
  onExpand,
}: {
  file: ReviewStackFile;
  onExpand: () => void;
}) {
  return (
    <div className="flex h-full min-h-80 items-center justify-center bg-background px-4 text-center">
      <div className="max-w-xl">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-sm font-semibold">Viewed file collapsed</h2>
        <p className="mt-1 truncate text-xs text-muted-foreground">{file.path}</p>
        <Button className="mt-4" variant="outline" size="sm" onClick={onExpand} aria-label={`Show diff for ${file.path}`}>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          Show diff
        </Button>
      </div>
    </div>
  );
}

function DiffViewer({
  file,
  diffMode,
  diffState,
  symbolIndex,
  threads,
  drafts,
  commentViewerTarget,
  commentTarget,
  commentBody,
  commentFeedback,
  commentBusy,
  sourceAvailable,
  onExpandHunkContext,
  onComment,
  onViewComments,
  onCloseCommentViewer,
  onCommentBodyChange,
  onSubmitComment,
  onCancelComment,
  onSymbolClick,
}: {
  file: ReviewStackFile;
  diffMode: DiffMode;
  diffState: LazyDiffState;
  symbolIndex: CodeSymbolIndex;
  threads: CachedReviewThread[];
  drafts: PublishedLineDraft[];
  commentViewerTarget: Extract<CommentTarget, { subjectType: "LINE" }> | null;
  commentTarget: CommentTarget | null;
  commentBody: string;
  commentFeedback: CommentFeedback | null;
  commentBusy: boolean;
  sourceAvailable: boolean;
  onExpandHunkContext: (hunkId: string, direction: "before" | "after") => void;
  onComment: (target: CommentTarget) => void;
  onViewComments: (target: Extract<CommentTarget, { subjectType: "LINE" }>) => void;
  onCloseCommentViewer: () => void;
  onCommentBodyChange: (body: string) => void;
  onSubmitComment: () => void;
  onCancelComment: () => void;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const hunks = diffState.fullFileLines
    ? [
        {
          id: `${file.path}:full-file`,
          header: file.path,
          loaded: true,
          expandable: false,
          expanded: false,
          canExpandBefore: false,
          canExpandAfter: false,
          contextBefore: 0,
          contextAfter: 0,
          lines: diffState.fullFileLines,
        } satisfies DiffHunkView,
      ]
    : diffState.hunks;
  const totalLines = hunks.reduce((total, hunk) => total + hunk.lines.length, 0);

  if (file.kind !== "text") {
    return (
      <div className="m-4 rounded-md border bg-card p-4">
        <h2 className="text-sm font-semibold">{file.path}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Binary or non-text change.</p>
      </div>
    );
  }

  if (totalLines === 0) {
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
            {hunks.map((hunk, hunkIndex) => (
              <Fragment key={hunk.id}>
                <DiffContextBreak
                  hunk={hunk}
                  previousHunk={hunks[hunkIndex - 1] ?? null}
                  sourceAvailable={sourceAvailable}
                  onExpandBefore={() => onExpandHunkContext(hunk.expandBeforeHunkId ?? hunk.id, "before")}
                />
                {hunk.lines.map((line, index) => (
                  <SplitDiffLine
                    key={`${hunk.id}:${line.oldLine ?? "new"}:${line.newLine ?? "old"}:${index}`}
                    line={line}
                    file={file}
                    symbolIndex={symbolIndex}
                    threads={threads}
                    drafts={drafts}
                    commentViewerTarget={commentViewerTarget}
                    commentTarget={commentTarget}
                    commentBody={commentBody}
                    commentFeedback={commentFeedback}
                    commentBusy={commentBusy}
                    onComment={onComment}
                    onViewComments={onViewComments}
                    onCloseCommentViewer={onCloseCommentViewer}
                    onCommentBodyChange={onCommentBodyChange}
                    onSubmitComment={onSubmitComment}
                    onCancelComment={onCancelComment}
                    onSymbolClick={onSymbolClick}
                  />
                ))}
                <DiffContextAfterBreak
                  hunk={hunk}
                  sourceAvailable={sourceAvailable}
                  onExpandAfter={() => onExpandHunkContext(hunk.expandAfterHunkId ?? hunk.id, "after")}
                />
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="diff-code-grid min-w-[56rem]">
            {hunks.map((hunk, hunkIndex) => (
              <Fragment key={hunk.id}>
                <DiffContextBreak
                  hunk={hunk}
                  previousHunk={hunks[hunkIndex - 1] ?? null}
                  sourceAvailable={sourceAvailable}
                  onExpandBefore={() => onExpandHunkContext(hunk.expandBeforeHunkId ?? hunk.id, "before")}
                />
                {hunk.lines.map((line, index) => (
                  <UnifiedDiffLine
                    key={`${hunk.id}:${line.oldLine ?? "new"}:${line.newLine ?? "old"}:${index}`}
                    line={line}
                    file={file}
                    symbolIndex={symbolIndex}
                    threads={threads}
                    drafts={drafts}
                    commentViewerTarget={commentViewerTarget}
                    commentTarget={commentTarget}
                    commentBody={commentBody}
                    commentFeedback={commentFeedback}
                    commentBusy={commentBusy}
                    onComment={onComment}
                    onViewComments={onViewComments}
                    onCloseCommentViewer={onCloseCommentViewer}
                    onCommentBodyChange={onCommentBodyChange}
                    onSubmitComment={onSubmitComment}
                    onCancelComment={onCancelComment}
                    onSymbolClick={onSymbolClick}
                  />
                ))}
                <DiffContextAfterBreak
                  hunk={hunk}
                  sourceAvailable={sourceAvailable}
                  onExpandAfter={() => onExpandHunkContext(hunk.expandAfterHunkId ?? hunk.id, "after")}
                />
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffContextBreak({
  hunk,
  previousHunk,
  sourceAvailable,
  onExpandBefore,
}: {
  hunk: DiffHunkView;
  previousHunk: DiffHunkView | null;
  sourceAvailable: boolean;
  onExpandBefore: () => void;
}) {
  const gap = getGapBetweenHunks(previousHunk, hunk);
  const label = getHunkContextLabel(hunk);
  const shouldShow = previousHunk !== null || label || hunk.canExpandBefore;
  if (!shouldShow) {
    return null;
  }

  return (
    <div className="diff-context-break flex min-w-full items-center gap-3 border-y bg-muted/45 px-3 py-1 text-xs text-muted-foreground">
      <span className="shrink-0 font-medium">{gap > 0 ? `${gap} unchanged line${gap === 1 ? "" : "s"}` : "Context"}</span>
      {label ? <code className="min-w-0 truncate font-mono">{label}</code> : <span className="min-w-0 truncate">{formatHunkHeader(hunk.header)}</span>}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {hunk.canExpandBefore ? (
          <button className="rounded px-2 py-0.5 hover:bg-accent hover:text-accent-foreground" onClick={onExpandBefore}>
            Show 20 earlier
          </button>
        ) : sourceAvailable ? null : (
          <span className="hidden sm:inline">Prepare review clone for expandable context</span>
        )}
      </div>
    </div>
  );
}

function DiffContextAfterBreak({
  hunk,
  sourceAvailable,
  onExpandAfter,
}: {
  hunk: DiffHunkView;
  sourceAvailable: boolean;
  onExpandAfter: () => void;
}) {
  if (!hunk.canExpandAfter) {
    return null;
  }

  return (
    <div className="diff-context-break flex min-w-full items-center justify-center border-y bg-muted/35 px-3 py-1 text-xs text-muted-foreground">
      <button
        className="rounded px-2 py-0.5 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!sourceAvailable}
        onClick={onExpandAfter}
      >
        Show 20 more lines
      </button>
    </div>
  );
}

function UnifiedDiffLine({
  line,
  file,
  symbolIndex,
  threads,
  drafts,
  commentViewerTarget,
  commentTarget,
  commentBody,
  commentFeedback,
  commentBusy,
  onComment,
  onViewComments,
  onCloseCommentViewer,
  onCommentBodyChange,
  onSubmitComment,
  onCancelComment,
  onSymbolClick,
}: {
  line: DiffLine;
  file: ReviewStackFile;
  symbolIndex: CodeSymbolIndex;
  threads: CachedReviewThread[];
  drafts: PublishedLineDraft[];
  commentViewerTarget: Extract<CommentTarget, { subjectType: "LINE" }> | null;
  commentTarget: CommentTarget | null;
  commentBody: string;
  commentFeedback: CommentFeedback | null;
  commentBusy: boolean;
  onComment: (target: CommentTarget) => void;
  onViewComments: (target: Extract<CommentTarget, { subjectType: "LINE" }>) => void;
  onCloseCommentViewer: () => void;
  onCommentBodyChange: (body: string) => void;
  onSubmitComment: () => void;
  onCancelComment: () => void;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const anchor = getCommentAnchor(file.path, line);
  const activeCommentTarget = anchor ? isSameLineCommentTarget(anchor, commentTarget) : false;
  const activeCommentViewer = anchor ? isSameLineCommentTarget(anchor, commentViewerTarget) : false;
  const activeLineTarget = activeCommentTarget && commentTarget?.subjectType === "LINE" ? commentTarget : null;
  const lineComments = anchor ? getDiffLineComments(file.path, line, anchor, threads, drafts) : [];
  const hasCommentAnchor = lineComments.length > 0;
  return (
    <>
      <div className={cn("diff-row relative grid grid-cols-[52px_52px_24px_max-content]", getDiffLineClass(line.kind), (activeCommentTarget || activeCommentViewer) && "diff-row-line-selected")}>
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
        {anchor ? (
          <button
            className={cn("diff-line-comment-button", hasCommentAnchor && "diff-line-comment-button-visible", (activeCommentTarget || activeCommentViewer) && "diff-line-comment-button-active")}
            aria-label={hasCommentAnchor ? `View ${lineComments.length} comment${lineComments.length === 1 ? "" : "s"} on ${anchor.label}` : `Comment on ${anchor.label}`}
            onClick={() => (hasCommentAnchor ? onViewComments(anchor) : onComment(anchor))}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {activeCommentViewer && anchor && lineComments.length > 0 ? (
        <InlineDiffCommentViewer
          target={anchor}
          comments={lineComments}
          onAddComment={() => onComment(anchor)}
          onClose={onCloseCommentViewer}
        />
      ) : null}
      {activeLineTarget ? (
        <InlineDiffCommentComposer
          target={activeLineTarget}
          body={commentBody}
          feedback={commentFeedback}
          busy={commentBusy}
          onBodyChange={onCommentBodyChange}
          onSubmit={onSubmitComment}
          onCancel={onCancelComment}
        />
      ) : null}
    </>
  );
}

function SplitDiffLine({
  line,
  file,
  symbolIndex,
  threads,
  drafts,
  commentViewerTarget,
  commentTarget,
  commentBody,
  commentFeedback,
  commentBusy,
  onComment,
  onViewComments,
  onCloseCommentViewer,
  onCommentBodyChange,
  onSubmitComment,
  onCancelComment,
  onSymbolClick,
}: {
  line: DiffLine;
  file: ReviewStackFile;
  symbolIndex: CodeSymbolIndex;
  threads: CachedReviewThread[];
  drafts: PublishedLineDraft[];
  commentViewerTarget: Extract<CommentTarget, { subjectType: "LINE" }> | null;
  commentTarget: CommentTarget | null;
  commentBody: string;
  commentFeedback: CommentFeedback | null;
  commentBusy: boolean;
  onComment: (target: CommentTarget) => void;
  onViewComments: (target: Extract<CommentTarget, { subjectType: "LINE" }>) => void;
  onCloseCommentViewer: () => void;
  onCommentBodyChange: (body: string) => void;
  onSubmitComment: () => void;
  onCancelComment: () => void;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const anchor = getCommentAnchor(file.path, line);
  const activeCommentTarget = anchor ? isSameLineCommentTarget(anchor, commentTarget) : false;
  const activeCommentViewer = anchor ? isSameLineCommentTarget(anchor, commentViewerTarget) : false;
  const activeLineTarget = activeCommentTarget && commentTarget?.subjectType === "LINE" ? commentTarget : null;
  const lineComments = anchor ? getDiffLineComments(file.path, line, anchor, threads, drafts) : [];
  const hasCommentAnchor = lineComments.length > 0;
  const showLeft = line.kind === "deletion" || line.kind === "context";
  const showRight = line.kind === "addition" || line.kind === "context";
  return (
    <>
      <div className={cn("diff-side-row relative grid grid-cols-[minmax(28rem,max-content)_minmax(28rem,max-content)]", (activeCommentTarget || activeCommentViewer) && "diff-row-line-selected")}>
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
        {anchor ? (
          <button
            className={cn("diff-line-comment-button", hasCommentAnchor && "diff-line-comment-button-visible", (activeCommentTarget || activeCommentViewer) && "diff-line-comment-button-active")}
            aria-label={hasCommentAnchor ? `View ${lineComments.length} comment${lineComments.length === 1 ? "" : "s"} on ${anchor.label}` : `Comment on ${anchor.label}`}
            onClick={() => (hasCommentAnchor ? onViewComments(anchor) : onComment(anchor))}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {activeCommentViewer && anchor && lineComments.length > 0 ? (
        <InlineDiffCommentViewer
          target={anchor}
          comments={lineComments}
          onAddComment={() => onComment(anchor)}
          onClose={onCloseCommentViewer}
        />
      ) : null}
      {activeLineTarget ? (
        <InlineDiffCommentComposer
          target={activeLineTarget}
          body={commentBody}
          feedback={commentFeedback}
          busy={commentBusy}
          onBodyChange={onCommentBodyChange}
          onSubmit={onSubmitComment}
          onCancel={onCancelComment}
        />
      ) : null}
    </>
  );
}

function InlineDiffCommentViewer({
  target,
  comments,
  onAddComment,
  onClose,
}: {
  target: Extract<CommentTarget, { subjectType: "LINE" }>;
  comments: InlineLineComment[];
  onAddComment: () => void;
  onClose: () => void;
}) {
  return (
    <div className="diff-inline-comment-viewer" role="group" aria-label={`Comments for ${target.label}`}>
      <div className="diff-inline-comment-card">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
          <div className="min-w-0 truncate text-xs font-medium">{target.label}</div>
          <Badge variant="info">{comments.length} comment{comments.length === 1 ? "" : "s"}</Badge>
        </div>
        <div className="divide-y">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-xs font-semibold">{comment.authorLogin ?? "Draft review"}</div>
                <Badge variant={comment.source === "draft" ? "warning" : comment.state === "resolved" ? "success" : comment.state === "outdated" ? "muted" : "info"}>
                  {comment.source === "draft" ? "Draft" : comment.state}
                </Badge>
              </div>
              <MarkdownContent className="text-sm" value={comment.body} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t bg-muted/25 px-3 py-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" size="sm" onClick={onAddComment}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Add another
          </Button>
        </div>
      </div>
    </div>
  );
}

function InlineDiffCommentComposer({
  target,
  body,
  feedback,
  busy,
  onBodyChange,
  onSubmit,
  onCancel,
}: {
  target: Extract<CommentTarget, { subjectType: "LINE" }>;
  body: string;
  feedback: CommentFeedback | null;
  busy: boolean;
  onBodyChange: (body: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [target.path, target.line, target.side]);

  return (
    <div className="diff-inline-comment-composer" role="group" aria-label={`Draft comment for ${target.label}`}>
      <div className="diff-inline-comment-card">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
          <div className="min-w-0 truncate text-xs font-medium">{target.label}</div>
          <Badge variant={target.side === "RIGHT" ? "success" : "danger"}>{target.side.toLowerCase()}</Badge>
        </div>
        <textarea
          ref={textareaRef}
          className="min-h-24 w-full resize-y border-0 bg-background p-3 text-sm outline-none"
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
            if (event.key === "Escape" && body.trim().length === 0) {
              event.preventDefault();
              onCancel();
            }
          }}
          aria-label="Inline draft review comment"
        />
        {feedback ? <CommentComposerFeedback feedback={feedback} /> : null}
        <div className="flex items-center justify-end gap-2 border-t bg-muted/25 px-3 py-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={busy || body.trim().length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquare className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Adding..." : "Add To Review"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentComposerFeedback({ feedback }: { feedback: CommentFeedback }) {
  return (
    <div
      className={cn(
        "border-t px-3 py-2 text-xs",
        feedback.kind === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-primary/20 bg-primary/10 text-primary",
      )}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.message}
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

function PullRequestPickerDialog({
  open,
  onOpenChange,
  options,
  selectedKey,
  busy,
  trigger,
  onRefresh,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: PullRequestPickerOption[];
  selectedKey: string;
  busy: boolean;
  trigger: ReactNode;
  onRefresh: () => void;
  onSelect: (key: string) => void;
}) {
  const [activeKey, setActiveKey] = useState(selectedKey);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const pickerWasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      pickerWasOpenRef.current = false;
      return;
    }

    if (pickerWasOpenRef.current) {
      return;
    }

    pickerWasOpenRef.current = true;
    const initialKey = options.some((option) => option.key === selectedKey) ? selectedKey : (options[0]?.key ?? "");
    setActiveKey(initialKey);
    if (initialKey) {
      rowRefs.current.get(initialKey)?.focus();
    }
  }, [open, options, selectedKey]);

  useEffect(() => {
    if (!open || options.length === 0 || options.some((option) => option.key === activeKey)) {
      return;
    }

    const fallbackKey = options.some((option) => option.key === selectedKey) ? selectedKey : options[0].key;
    setActiveKey(fallbackKey);
  }, [activeKey, open, options, selectedKey]);

  function focusOption(key: string) {
    setActiveKey(key);
    const row = rowRefs.current.get(key);
    row?.focus();
    row?.scrollIntoView?.({ block: "nearest" });
  }

  function moveActiveOption(direction: 1 | -1) {
    if (options.length === 0) {
      return;
    }
    const currentIndex = options.findIndex((option) => option.key === activeKey);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : options.length - 1
        : (currentIndex + direction + options.length) % options.length;
    focusOption(options[nextIndex].key);
  }

  function handlePickerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const control = target?.closest("[data-pr-picker-control='true']");

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveOption(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveOption(-1);
      return;
    }

    if (event.key === "Home" && options.length > 0) {
      event.preventDefault();
      focusOption(options[0].key);
      return;
    }

    if (event.key === "End" && options.length > 0) {
      event.preventDefault();
      focusOption(options[options.length - 1].key);
      return;
    }

    if (event.key === "Enter" && !control) {
      const activeOption = options.find((option) => option.key === activeKey);
      if (activeOption) {
        event.preventDefault();
        onSelect(activeOption.key);
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content
          className="fixed inset-x-4 top-8 z-50 mx-auto flex max-h-[calc(100vh-4rem)] w-[min(58rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
          onKeyDown={handlePickerKeyDown}
        >
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
            <div className="min-w-0">
              <Dialog.Title className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <GitPullRequest className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Pull Requests</span>
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                {options.length === 0
                  ? "No open pull requests loaded."
                  : `${options.length} open pull request${options.length === 1 ? "" : "s"} loaded.`}
              </Dialog.Description>
            </div>
            <Button data-pr-picker-control="true" variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Available pull requests">
            {options.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Refresh saved repositories to load open pull requests.
              </div>
            ) : (
              <div className="divide-y">
                {options.map((option) => {
                  const selected = option.key === selectedKey;
                  const active = option.key === activeKey;
                  return (
                    <button
                      key={option.key}
                      ref={(node) => {
                        if (node) {
                          rowRefs.current.set(option.key, node);
                        } else {
                          rowRefs.current.delete(option.key);
                        }
                      }}
                      type="button"
                      data-pr-picker-row="true"
                      className={cn(
                        "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left text-xs hover:bg-accent",
                        active && !selected && "bg-muted/70",
                        selected && "bg-accent text-accent-foreground",
                      )}
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      aria-label={`Switch to ${option.title}`}
                      onFocus={() => setActiveKey(option.key)}
                      onClick={() => onSelect(option.key)}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="truncate text-xs font-semibold">{option.title}</h3>
                          {selected ? <span className="shrink-0 text-[10px] font-medium text-primary">Active</span> : null}
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <PullRequestListMeta icon={GitPullRequest} value={option.repositoryLabel} />
                          <PullRequestListMeta icon={User} value={option.authorLabel} />
                          <PullRequestListMeta icon={Users} value={option.assigneeLabel} label="Assignees" />
                          <PullRequestListMeta icon={CheckCheck} value={option.reviewerLabel} label="Reviewers" />
                          <PullRequestListMeta icon={GitBranch} value={option.branchLabel} />
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{option.changedFilesLabel}</span>
                          <span>{option.changedLinesLabel}</span>
                          <span>{option.reviewThreadsLabel}</span>
                          <span>{option.updatedLabel}</span>
                        </div>
                        {option.failingCheckNames.length > 0 ? (
                          <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-rose-700 dark:text-rose-300">
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">Failing: {option.failingCheckNames.join(", ")}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-[11px]">
                        <PullRequestListStatus variant={option.reviewReadinessVariant} label={option.reviewReadinessLabel} />
                        <PullRequestListStatus variant={option.reviewDecisionVariant} label={option.reviewDecisionLabel} />
                        <PullRequestListStatus variant={option.checksVariant} label={option.checksLabel} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>Details come from the latest list refresh plus cached PR data.</span>
            <Button data-pr-picker-control="true" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PullRequestListMeta({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof GitPullRequest;
  value: string;
  label?: string;
}) {
  return (
    <span className="flex min-w-0 max-w-48 items-center gap-1">
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label ? <span className="sr-only">{label}: </span> : null}
      <span className="truncate">{value}</span>
    </span>
  );
}

function PullRequestListStatus({ variant, label }: { variant: BadgeVariant; label: string }) {
  const Icon = variant === "success" ? Check : variant === "danger" ? X : variant === "warning" ? AlertTriangle : variant === "info" ? Clock3 : Circle;

  return (
    <span className={cn("flex items-center gap-1 whitespace-nowrap", getPickerStatusTextClass(variant))}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

function SubmitReviewDialog({
  open,
  onOpenChange,
  event,
  body,
  drafts,
  pendingReview,
  busy,
  trigger,
  onEventChange,
  onBodyChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: PullRequestReviewEvent;
  body: string;
  drafts: PublishedDraft[];
  pendingReview: PendingReview | null;
  busy: boolean;
  trigger?: ReactNode;
  onEventChange: (event: PullRequestReviewEvent) => void;
  onBodyChange: (body: string) => void;
  onSubmit: () => void;
}) {
  const reviewEvents: Array<{ value: PullRequestReviewEvent; label: string; detail: string }> = [
    { value: "COMMENT", label: "Comment", detail: "Leave feedback without blocking merge." },
    { value: "REQUEST_CHANGES", label: "Request changes", detail: "Block merge until issues are addressed." },
    { value: "APPROVE", label: "Approve", detail: "Approve the pull request." },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content className="fixed inset-x-4 top-8 z-50 mx-auto flex max-h-[calc(100vh-4rem)] w-[min(44rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
          <div className="border-b p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Dialog.Title className="text-base font-semibold">Submit Review</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {drafts.length} draft comment{drafts.length === 1 ? "" : "s"} ready to submit.
                </Dialog.Description>
              </div>
              <Badge variant={pendingReview ? "warning" : "muted"}>{pendingReview ? "Pending" : "No draft"}</Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <section aria-label="Pending review comments">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Review Comments</h3>
                <Badge variant="info">{drafts.length}</Badge>
              </div>
              {drafts.length === 0 ? (
                <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                  Added line, file, and thread comments will appear here before you submit the review.
                </div>
              ) : (
                <div className="space-y-2">
                  {drafts.map((draft, index) => (
                    <article key={draft.id} className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate text-xs font-medium">{draft.targetLabel}</div>
                        <Badge variant="muted">#{index + 1}</Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-5" aria-label="Review outcome">
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Submit As</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {reviewEvents.map((candidate) => (
                  <label
                    key={candidate.value}
                    className={cn(
                      "flex cursor-pointer flex-col rounded-md border bg-background p-3 hover:bg-accent",
                      event === candidate.value && "border-primary bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input
                        className="h-4 w-4 accent-primary"
                        type="radio"
                        name="review-event"
                        value={candidate.value}
                        checked={event === candidate.value}
                        onChange={() => onEventChange(candidate.value)}
                      />
                      {candidate.label}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">{candidate.detail}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="mt-5" aria-label="Review summary section">
              <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground" htmlFor="review-summary">
                Review Summary
              </label>
              <textarea
                id="review-summary"
                className="min-h-28 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={body}
                onChange={(event) => onBodyChange(event.target.value)}
                aria-label="Review summary"
              />
            </section>
          </div>

          <div className="flex items-center justify-between gap-2 border-t p-4">
            <span className="text-xs text-muted-foreground">{pendingReview ? "Pending review ready" : "Add a draft comment to start a pending review."}</span>
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
  symbolIndex,
  files,
  pullRequest,
  workspaceClient,
  hydrationDisabled,
  sourceContentByPath,
  onOpenChange,
  onNavigate,
}: {
  selection: SymbolSelection | null;
  symbolIndex: CodeSymbolIndex;
  files: CachedFileSummary[];
  pullRequest: PullRequestSummary;
  workspaceClient: WorkspaceClient;
  hydrationDisabled: boolean;
  sourceContentByPath: Record<string, string | null>;
  onOpenChange: (open: boolean) => void;
  onNavigate: (location: CodeSymbolLocation) => void;
}) {
  const [trail, setTrail] = useState<SymbolSelection[]>(selection ? [selection] : []);
  const [hydratedSourceByPath, setHydratedSourceByPath] = useState<Record<string, string>>({});
  const [hydrationStatus, setHydrationStatus] = useState<{
    state: "idle" | "loading" | "loaded" | "miss" | "error";
    message: string | null;
  }>({ state: "idle", message: null });
  const hydrationAttemptedRef = useRef<Set<string>>(new Set());
  const activeSelection = trail.at(-1) ?? selection;
  const parentSourceByPath = useMemo(() => {
    const loaded: Record<string, string> = {};
    for (const [path, content] of Object.entries(sourceContentByPath)) {
      if (typeof content === "string") {
        loaded[path] = content;
      }
    }
    return loaded;
  }, [sourceContentByPath]);
  const lookupSourceByPath = useMemo(
    () => ({ ...parentSourceByPath, ...hydratedSourceByPath }),
    [hydratedSourceByPath, parentSourceByPath],
  );
  const hydratedSourceFiles = useMemo<HydratedCodeSourceFile[]>(
    () => Object.entries(hydratedSourceByPath).map(([path, content]) => ({ path, content })),
    [hydratedSourceByPath],
  );
  const effectiveSymbolIndex = useMemo(
    () => (hydratedSourceFiles.length > 0 ? buildCodeSymbolIndex(files, hydratedSourceFiles) : symbolIndex),
    [files, hydratedSourceFiles, symbolIndex],
  );
  const record = activeSelection ? resolveCodeSymbolRecord(effectiveSymbolIndex, activeSelection) : null;
  const definitions = record?.definitions ?? [];
  const references = record?.references ?? [];
  const locations = useMemo(() => [...definitions, ...references], [definitions, references]);
  const initialLocation = useMemo(
    () =>
      locations.find((location) => location.path === activeSelection?.path && location.line === activeSelection.line) ??
      definitions[0] ??
      references[0] ??
      null,
    [activeSelection?.line, activeSelection?.path, definitions, locations, references],
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(initialLocation?.id ?? null);
  const [contextBefore, setContextBefore] = useState(4);
  const [contextAfter, setContextAfter] = useState(10);
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? initialLocation;
  const codePreview = useMemo(
    () => buildSymbolCodePreview(files, selectedLocation, contextBefore, contextAfter, hydratedSourceByPath),
    [contextAfter, contextBefore, files, hydratedSourceByPath, selectedLocation],
  );

  useEffect(() => {
    if (selection) {
      setTrail([selection]);
      setHydratedSourceByPath({});
      setHydrationStatus({ state: "idle", message: null });
      hydrationAttemptedRef.current.clear();
    }
  }, [selection?.name, selection?.path, selection?.line]);

  useEffect(() => {
    setSelectedLocationId(initialLocation?.id ?? null);
    setContextBefore(4);
    setContextAfter(10);
  }, [activeSelection?.name, initialLocation?.id]);

  useEffect(() => {
    if (!activeSelection || hydrationDisabled || definitions.length > 0) {
      return;
    }

    const attemptKey = `${activeSelection.name}:${activeSelection.path}:${activeSelection.line ?? "file"}`;
    if (hydrationAttemptedRef.current.has(attemptKey)) {
      return;
    }

    const candidatePaths = inferHydratableDefinitionPaths({
      selection: activeSelection,
      record,
      files,
      hydratedSourceByPath: lookupSourceByPath,
    }).filter((path) => hydratedSourceByPath[path] === undefined);

    hydrationAttemptedRef.current.add(attemptKey);
    if (candidatePaths.length === 0) {
      setHydrationStatus({
        state: "miss",
        message: "No likely source file could be inferred from the loaded imports.",
      });
      return;
    }

    let active = true;
    async function hydrateExternalDefinitions() {
      setHydrationStatus({
        state: "loading",
        message: `Looking outside the diff in ${candidatePaths.length} likely source file${candidatePaths.length === 1 ? "" : "s"}.`,
      });

      try {
        const readCandidates = () => workspaceClient.readPullRequestAnalysisFiles(pullRequest, candidatePaths);
        let response = await readCandidates();
        let loadedFiles = response.files.filter(
          (file): file is AnalysisFileContent & { content: string } => file.state === "loaded" && typeof file.content === "string",
        );

        if (loadedFiles.length === 0) {
          await workspaceClient.preparePullRequestReviewClone(pullRequest);
          response = await readCandidates();
          loadedFiles = response.files.filter(
            (file): file is AnalysisFileContent & { content: string } => file.state === "loaded" && typeof file.content === "string",
          );
        }

        if (!active) {
          return;
        }

        if (loadedFiles.length === 0) {
          setHydrationStatus({
            state: "miss",
            message: "No inferred source file was available in the review clone.",
          });
          return;
        }

        setHydratedSourceByPath((current) => {
          const next = { ...current };
          for (const file of loadedFiles) {
            next[file.path] = file.content;
          }
          return next;
        });
        setHydrationStatus({
          state: "loaded",
          message: `Loaded ${loadedFiles.length} source file${loadedFiles.length === 1 ? "" : "s"} outside the diff.`,
        });
      } catch (error) {
        if (active) {
          setHydrationStatus({ state: "error", message: getErrorMessage(error) });
        }
      }
    }

    void hydrateExternalDefinitions();

    return () => {
      active = false;
    };
  }, [
    activeSelection,
    definitions.length,
    files,
    hydratedSourceByPath,
    hydrationDisabled,
    lookupSourceByPath,
    pullRequest,
    record,
    workspaceClient,
  ]);

  function drillIntoSymbol(nextSelection: SymbolSelection) {
    if (!resolveCodeSymbolRecord(effectiveSymbolIndex, nextSelection)) {
      return;
    }
    setTrail((current) => [...current, nextSelection]);
  }

  return (
    <Dialog.Root open={Boolean(selection)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content className="fixed inset-x-4 top-8 z-50 mx-auto flex max-h-[calc(100vh-4rem)] w-[min(72rem,calc(100vw-2rem))] flex-col rounded-lg border bg-card shadow-lg">
          <div className="border-b p-4">
            <Dialog.Title className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <FileCode2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{activeSelection?.name ?? "Symbol"}</span>
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {record?.scoped && record.scopeName
                ? `Local definitions and references in ${record.scopeName}.`
                : "Definitions and references found in loaded pull request files."}
            </Dialog.Description>
            {hydrationStatus.message ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                {hydrationStatus.state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                <span>{hydrationStatus.message}</span>
              </div>
            ) : null}
            {trail.length > 1 ? (
              <nav className="mt-3 flex min-w-0 flex-wrap items-center gap-1 text-xs" aria-label="Symbol trail">
                {trail.map((entry, index) => (
                  <Fragment key={`${entry.name}:${entry.path}:${entry.line ?? "file"}:${index}`}>
                    {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                    <button
                      className={cn(
                        "max-w-44 truncate rounded-md border px-2 py-1 font-mono hover:bg-accent",
                        index === trail.length - 1 && "border-primary bg-accent text-accent-foreground",
                      )}
                      aria-label={`Go to ${entry.name} in symbol trail`}
                      onClick={() => setTrail((current) => current.slice(0, index + 1))}
                    >
                      {entry.name}
                    </button>
                  </Fragment>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-r p-3">
              <SymbolLocationList
                title="Definitions"
                emptyMessage={
                  hydrationStatus.state === "loading"
                    ? "Looking for this definition outside the visible diff."
                    : "No definition is loaded for this symbol yet."
                }
                locations={definitions}
                selectedLocationId={selectedLocation?.id ?? null}
                onSelect={setSelectedLocationId}
              />
              <SymbolLocationList
                title="References"
                emptyMessage="No references are loaded for this symbol."
                locations={references}
                selectedLocationId={selectedLocation?.id ?? null}
                onSelect={setSelectedLocationId}
              />
            </div>
            <SymbolCodePreview
              location={selectedLocation}
              preview={codePreview}
              symbolName={record?.name ?? activeSelection?.name ?? ""}
              symbolIndex={effectiveSymbolIndex}
              onExpandBefore={() => setContextBefore((current) => current + 8)}
              onExpandAfter={() => setContextAfter((current) => current + 12)}
              onNavigate={onNavigate}
              onSymbolClick={drillIntoSymbol}
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
  selectedLocationId,
  onSelect,
}: {
  title: string;
  emptyMessage: string;
  locations: CodeSymbolLocation[];
  selectedLocationId: string | null;
  onSelect: (locationId: string) => void;
}) {
  return (
    <section className="mb-3 min-w-0 rounded-md border bg-background" aria-label={title}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
        <Badge variant="muted">{locations.length}</Badge>
      </div>
      {locations.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="p-2">
          {locations.map((location) => (
            <button
              key={location.id}
              className={cn(
                "mb-2 block w-full min-w-0 rounded-md border bg-card p-2 text-left hover:bg-accent",
                location.id === selectedLocationId && "border-primary bg-accent text-accent-foreground",
              )}
              onClick={() => onSelect(location.id)}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{formatSymbolLocation(location)}</span>
                <Badge variant={getSymbolSideBadgeVariant(location)}>{formatSymbolSideLabel(location)}</Badge>
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

function SymbolCodePreview({
  location,
  preview,
  symbolName,
  symbolIndex,
  onExpandBefore,
  onExpandAfter,
  onNavigate,
  onSymbolClick,
}: {
  location: CodeSymbolLocation | null;
  preview: SymbolCodePreviewModel | null;
  symbolName: string;
  symbolIndex: CodeSymbolIndex;
  onExpandBefore: () => void;
  onExpandAfter: () => void;
  onNavigate: (location: CodeSymbolLocation) => void;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  if (!location) {
    return <div className="flex min-h-0 items-center justify-center p-6 text-sm text-muted-foreground">No symbol occurrence selected.</div>;
  }

  return (
    <section className="flex min-h-0 flex-col bg-background" aria-label="Symbol code preview">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <h3 className="truncate text-sm font-semibold">{formatSymbolLocation(location)}</h3>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={location.kind === "definition" ? "success" : "info"}>{location.kind}</Badge>
            <Badge variant={getSymbolSideBadgeVariant(location)}>{formatSymbolSideLabel(location)}</Badge>
            <span className="truncate">{location.path}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNavigate(location)}>
          <GitPullRequest className="h-4 w-4" aria-hidden="true" />
          Open in diff
        </Button>
      </div>

      {preview ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <button
            className="flex h-8 w-full items-center justify-center gap-2 border-b text-xs text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!preview.canExpandBefore}
            onClick={onExpandBefore}
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
            {preview.hiddenBefore > 0 ? `Show ${Math.min(8, preview.hiddenBefore)} earlier lines` : "No earlier loaded lines"}
          </button>
          <div className="diff-shell">
            <div className="diff-code-grid min-w-[44rem] py-1">
              {preview.lines.map((line, index) => (
                <div
                  key={`${line.oldLine ?? "old"}:${line.newLine ?? "new"}:${index}`}
                  className={cn("grid grid-cols-[4rem_1.5rem_max-content]", getDiffLineClass(line.kind), line.selected && "diff-row-line-selected")}
                >
                  <div className="diff-gutter px-2 py-0.5 text-right">{getPreviewLineNumber(line, location)}</div>
                  <div className="diff-marker px-1.5 py-0.5 text-center">{getDiffPrefix(line.kind)}</div>
                  <code className="diff-code-line diff-code-cell px-3 py-0.5">
                    <SymbolPreviewLineContent
                      content={line.content}
                      language={line.language}
                      line={line}
                      path={location.path}
                      symbolName={symbolName}
                      symbolIndex={symbolIndex}
                      onSymbolClick={onSymbolClick}
                    />
                  </code>
                </div>
              ))}
            </div>
          </div>
          <button
            className="flex h-8 w-full items-center justify-center gap-2 border-t text-xs text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!preview.canExpandAfter}
            onClick={onExpandAfter}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            {preview.hiddenAfter > 0 ? `Show ${Math.min(12, preview.hiddenAfter)} more lines` : "No later loaded lines"}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="max-w-xl rounded-md border bg-card p-4 text-sm">
            <div className="font-medium">Code preview unavailable</div>
            <code className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-muted-foreground">
              {location.snippet}
            </code>
          </div>
        </div>
      )}
    </section>
  );
}

function SymbolPreviewLineContent({
  content,
  language,
  line,
  path,
  symbolName,
  symbolIndex,
  onSymbolClick,
}: {
  content: string;
  language: string;
  line: DiffLine;
  path: string;
  symbolName: string;
  symbolIndex: CodeSymbolIndex;
  onSymbolClick: (selection: SymbolSelection) => void;
}) {
  const tokens = tokenizeCodeLine(content, language);
  if (tokens.length === 0) {
    return <span>{"\u00a0"}</span>;
  }

  return (
    <>
      {tokens.map((token, index) => {
        const className = cn(
          getSyntaxTokenClass(token.kind),
          token.symbolName === symbolName && "rounded bg-primary/15 px-0.5 text-primary",
        );
        if (token.symbolName && symbolIndex.recordsByName.has(token.symbolName)) {
          const lineNumber = line.newLine ?? line.oldLine ?? null;
          return (
            <button
              key={`${index}:${token.value}`}
              type="button"
              className={cn(className, "diff-token-symbol")}
              aria-label={`Drill into symbol ${token.symbolName}`}
              onClick={() => onSymbolClick({ name: token.symbolName!, path, line: lineNumber })}
            >
              {token.value}
            </button>
          );
        }

        return (
          <span key={`${index}:${token.value}`} className={className}>
            {token.value}
          </span>
        );
      })}
    </>
  );
}

type SymbolCodePreviewLine = DiffLine & { selected: boolean };

interface SymbolCodePreviewModel {
  lines: SymbolCodePreviewLine[];
  canExpandBefore: boolean;
  canExpandAfter: boolean;
  hiddenBefore: number;
  hiddenAfter: number;
}

function buildSymbolCodePreview(
  files: CachedFileSummary[],
  location: CodeSymbolLocation | null,
  contextBefore: number,
  contextAfter: number,
  hydratedSourceByPath: Record<string, string> = {},
): SymbolCodePreviewModel | null {
  if (!location) {
    return null;
  }

  const file = files.find((candidate) => candidate.path === location.path);
  let lines: DiffLine[] = [];
  if (file) {
    const diffState = buildLazyDiffState(file, {
      mode: "unified",
      repository: "local/local",
      pullRequestNumber: 0,
      loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
      fullFileLoaded: true,
    });
    lines = diffState.fullFileLines ?? diffState.hunks.flatMap((hunk) => hunk.lines);
  } else {
    lines = buildHydratedSymbolPreviewLines(location.path, hydratedSourceByPath[location.path]);
  }
  if (lines.length === 0) {
    return null;
  }

  const exactIndex = lines.findIndex((line) => lineMatchesSymbolLocation(line, location));
  const snippetIndex = lines.findIndex((line) => line.content.trim() === location.snippet);
  const selectedIndex = exactIndex >= 0 ? exactIndex : snippetIndex;
  if (selectedIndex < 0) {
    return null;
  }

  const startIndex = Math.max(0, selectedIndex - contextBefore);
  const endIndex = Math.min(lines.length - 1, selectedIndex + contextAfter);

  return {
    lines: lines.slice(startIndex, endIndex + 1).map((line, index) => ({
      ...line,
      selected: startIndex + index === selectedIndex,
    })),
    canExpandBefore: startIndex > 0,
    canExpandAfter: endIndex < lines.length - 1,
    hiddenBefore: startIndex,
    hiddenAfter: lines.length - endIndex - 1,
  };
}

function buildHydratedSymbolPreviewLines(path: string, content: string | undefined): DiffLine[] {
  if (content === undefined) {
    return [];
  }

  const language = getLanguageForPath(path);
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");

  return lines.map((line, index) => ({
    oldLine: index + 1,
    newLine: index + 1,
    kind: "context",
    content: line,
    highlighted: true,
    language,
    sourceContext: true,
  }));
}

function lineMatchesSymbolLocation(line: DiffLine, location: CodeSymbolLocation) {
  if (location.line === null) {
    return false;
  }
  if (location.side === "LEFT") {
    return line.oldLine === location.line;
  }
  if (location.side === "RIGHT") {
    return line.newLine === location.line;
  }
  return line.oldLine === location.line || line.newLine === location.line;
}

function getPreviewLineNumber(line: DiffLine, location: CodeSymbolLocation) {
  if (location.side === "LEFT") {
    return line.oldLine ?? "";
  }
  if (location.side === "RIGHT") {
    return line.newLine ?? "";
  }
  return line.newLine ?? line.oldLine ?? "";
}

function getGapBetweenHunks(previousHunk: DiffHunkView | null, hunk: DiffHunkView) {
  if (!previousHunk) {
    return 0;
  }

  const previousEnd = getHunkBoundaryLine(previousHunk, "end");
  const currentStart = getHunkBoundaryLine(hunk, "start");
  if (previousEnd === null || currentStart === null) {
    return 0;
  }

  return Math.max(0, currentStart - previousEnd - 1);
}

function getHunkBoundaryLine(hunk: DiffHunkView, edge: "start" | "end") {
  const lines = edge === "start" ? hunk.lines : hunk.lines.slice().reverse();
  for (const line of lines) {
    const lineNumber = line.newLine ?? line.oldLine;
    if (lineNumber !== null) {
      return lineNumber;
    }
  }
  return null;
}

function getHunkContextLabel(hunk: DiffHunkView) {
  const headerLabel = parseHunkHeaderLabel(hunk.header);
  if (headerLabel) {
    return headerLabel;
  }

  for (const line of hunk.lines) {
    const label = getDefinitionContextLabel(line.content);
    if (label) {
      return label;
    }
  }

  return null;
}

function parseHunkHeaderLabel(header: string) {
  const match = header.match(/^@@[^@]*@@\s*(.+)$/);
  return match?.[1]?.trim() || null;
}

function formatHunkHeader(header: string) {
  const match = header.match(/^@@\s+(.+?)\s+@@/);
  return match?.[1] ? match[1] : header;
}

function getDefinitionContextLabel(content: string) {
  const trimmed = content.trim();
  const patterns: Array<[RegExp, string]> = [
    [/^(?:async\s+)?def\s+([A-Za-z_]\w*)/, "function"],
    [/^class\s+([A-Za-z_]\w*)/, "class"],
    [/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, "function"],
    [/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, "class"],
    [/^(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, "definition"],
    [/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, "definition"],
    [/^([A-Za-z_$][\w$]*)\s*:\s*Mapped\[/, "field"],
  ];

  for (const [pattern, kind] of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return `${kind} ${match[1]}`;
    }
  }

  return null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function getCommentAnchor(path: string, line: DiffLine): Extract<CommentTarget, { subjectType: "LINE" }> | null {
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

function isSameLineCommentTarget(anchor: CommentTarget, target: CommentTarget | null) {
  return (
    anchor.subjectType === "LINE" &&
    target?.subjectType === "LINE" &&
    anchor.path === target.path &&
    anchor.line === target.line &&
    anchor.side === target.side
  );
}

function getDiffLineComments(
  filePath: string,
  line: DiffLine,
  anchor: CommentTarget,
  threads: CachedReviewThread[],
  drafts: PublishedLineDraft[],
): InlineLineComment[] {
  const lineNumbers = new Set<number>();
  if (line.oldLine) {
    lineNumbers.add(line.oldLine);
  }
  if (line.newLine) {
    lineNumbers.add(line.newLine);
  }

  const comments: InlineLineComment[] = [];
  for (const thread of threads) {
    if (thread.filePath !== filePath || thread.line === null || !lineNumbers.has(thread.line)) {
      continue;
    }

    const threadComments = thread.comments?.length
      ? thread.comments.map((comment) => ({
          id: `${thread.id}:${comment.id}`,
          authorLogin: comment.authorLogin,
          body: comment.body,
          label: anchor.label,
          state: thread.state,
          source: "thread" as const,
        }))
      : [
          {
            id: thread.id,
            authorLogin: thread.authorLogin,
            body: thread.body,
            label: anchor.label,
            state: thread.state,
            source: "thread" as const,
          },
        ];
    comments.push(...threadComments);
  }

  for (const draft of drafts) {
    if (isSameLineCommentTarget(anchor, draft.target)) {
      comments.push({
        id: draft.id,
        authorLogin: null,
        body: draft.body,
        label: draft.targetLabel,
        state: "draft",
        source: "draft",
      });
    }
  }

  const byContent = new Map<string, InlineLineComment>();
  for (const comment of comments) {
    const key = `${comment.label}\n${comment.authorLogin ?? ""}\n${comment.body.trim()}`;
    if (!byContent.has(key)) {
      byContent.set(key, comment);
    }
  }

  return [...byContent.values()];
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

function formatSymbolSideLabel(location: CodeSymbolLocation) {
  const sides = new Set(location.sides.length > 0 ? location.sides : [location.side]);
  if (sides.has("LEFT") && sides.has("RIGHT")) {
    return "changed";
  }
  if (sides.has("RIGHT")) {
    return "added";
  }
  if (sides.has("LEFT")) {
    return "removed";
  }
  if (sides.has("BOTH")) {
    return "unchanged";
  }
  return "unknown";
}

function getSymbolSideBadgeVariant(location: CodeSymbolLocation): "success" | "warning" | "danger" | "info" | "muted" {
  const label = formatSymbolSideLabel(location);
  if (label === "added") {
    return "success";
  }
  if (label === "removed") {
    return "danger";
  }
  if (label === "changed") {
    return "warning";
  }
  if (label === "unchanged") {
    return "muted";
  }
  return "info";
}

function splitFilePath(path: string) {
  const lastSlashIndex = path.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return { directory: "", name: path };
  }
  return {
    directory: path.slice(0, lastSlashIndex),
    name: path.slice(lastSlashIndex + 1) || path,
  };
}

function formatFileStatus(status: string) {
  return status.replace(/[_-]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildPullRequestPickerOption(
  pullRequest: PullRequestSummary,
  cachedData: CachedPullRequestData | null | undefined,
): PullRequestPickerOption {
  const key = getPullRequestKey(pullRequest);
  const metadata = cachedData?.metadata;
  const checksSummary = cachedData ? summarizeChecks(cachedData.checks) : null;
  const reviewDecision = metadata?.reviewDecision ?? null;
  const readinessIsDraft = metadata?.isDraft ?? pullRequest.isDraft;
  const assigneeLogins = pullRequest.assigneeLogins ?? cachedData?.pullRequest.assigneeLogins ?? [];
  const requestedReviewerLogins = pullRequest.requestedReviewerLogins ?? cachedData?.pullRequest.requestedReviewerLogins ?? [];
  const changedFiles = cachedData?.fileSummaries.length ?? null;
  const changedLines = cachedData
    ? cachedData.fileSummaries.reduce((total, file) => total + file.additions + file.deletions, 0)
    : null;
  const unresolvedThreads = cachedData?.reviewThreads.filter((thread) => thread.state === "unresolved").length ?? null;
  const totalThreads = cachedData?.reviewThreads.length ?? null;
  const headBranch = metadata?.headBranch ?? pullRequest.headBranch ?? null;
  const baseBranch = metadata?.baseBranch ?? pullRequest.baseBranch ?? null;
  const checksDisplay = getPickerChecksDisplay(checksSummary);
  const reviewDecisionDisplay = getPickerReviewDecisionDisplay(reviewDecision);

  return {
    key,
    pullRequest,
    title: metadata?.title ?? pullRequest.title,
    repositoryLabel: `${pullRequest.repository} #${pullRequest.number}`,
    authorLabel: pullRequest.authorLogin ? `@${pullRequest.authorLogin}` : "Unknown author",
    assigneeLabel: assigneeLogins.length > 0 ? formatLoginList(assigneeLogins) : "Unassigned",
    reviewerLabel: requestedReviewerLogins.length > 0 ? formatLoginList(requestedReviewerLogins) : "No reviewers",
    branchLabel: formatBranchPair(headBranch, baseBranch),
    updatedLabel: `Updated ${formatIsoDate(metadata?.updatedAt ?? pullRequest.updatedAt)}`,
    reviewReadinessLabel: readinessIsDraft ? "Draft" : "Ready for review",
    reviewReadinessVariant: readinessIsDraft ? "warning" : "success",
    reviewDecisionLabel: reviewDecisionDisplay.label,
    reviewDecisionVariant: reviewDecisionDisplay.variant,
    checksLabel: checksDisplay.label,
    checksVariant: checksDisplay.variant,
    checksDetailLabel: checksDisplay.detail,
    changedFilesLabel: changedFiles === null ? "Files not loaded" : `${changedFiles} changed ${pluralize("file", changedFiles)}`,
    changedLinesLabel: changedLines === null ? "Lines not loaded" : `${changedLines} changed ${pluralize("line", changedLines)}`,
    reviewThreadsLabel:
      unresolvedThreads === null || totalThreads === null
        ? "Threads not loaded"
        : unresolvedThreads > 0
          ? `${unresolvedThreads} unresolved ${pluralize("thread", unresolvedThreads)}`
          : totalThreads > 0
            ? `${totalThreads} resolved ${pluralize("thread", totalThreads)}`
            : "No review threads",
    cacheLabel: cachedData ? `Cached ${formatIsoDateFromEpoch(cachedData.fetchedAtEpochMs)}` : "Details not cached",
    failingCheckNames: checksSummary?.failingNames ?? [],
  };
}

function getPickerChecksDisplay(checksSummary: ChecksSummary | null): {
  label: string;
  detail: string;
  variant: BadgeVariant;
} {
  if (!checksSummary || checksSummary.total === 0) {
    return {
      label: "Checks unknown",
      detail: "CI/CD not loaded",
      variant: "muted",
    };
  }

  if (checksSummary.failing > 0) {
    const pendingLabel = checksSummary.pending > 0 ? `, ${checksSummary.pending} pending` : "";
    return {
      label: `${checksSummary.failing} failing`,
      detail: `${checksSummary.failing} failing${pendingLabel}`,
      variant: "danger",
    };
  }

  if (checksSummary.pending > 0) {
    return {
      label: `${checksSummary.pending} pending`,
      detail: `${checksSummary.pending} pending`,
      variant: "warning",
    };
  }

  return {
    label: `${checksSummary.passing}/${checksSummary.total} passing`,
    detail: `${checksSummary.passing} passing ${pluralize("check", checksSummary.passing)}`,
    variant: "success",
  };
}

function getPickerReviewDecisionDisplay(reviewDecision: CachedPullRequestData["metadata"]["reviewDecision"]): {
  label: string;
  variant: BadgeVariant;
} {
  switch (reviewDecision) {
    case "APPROVED":
      return { label: "Approved", variant: "success" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", variant: "danger" };
    case "REVIEW_REQUIRED":
      return { label: "Review required", variant: "warning" };
    default:
      return { label: "Review unknown", variant: "muted" };
  }
}

function getPickerStatusTextClass(variant: BadgeVariant) {
  switch (variant) {
    case "success":
      return "text-emerald-700 dark:text-emerald-300";
    case "warning":
      return "text-amber-700 dark:text-amber-300";
    case "danger":
      return "text-rose-700 dark:text-rose-300";
    case "info":
      return "text-sky-700 dark:text-sky-300";
    default:
      return "text-muted-foreground";
  }
}

function formatLoginList(logins: string[]) {
  const uniqueLogins = [...new Set(logins.filter(Boolean))];
  const visible = uniqueLogins.slice(0, 3).map((login) => `@${login}`);
  const remaining = uniqueLogins.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} +${remaining}` : visible.join(", ");
}

function formatBranchPair(headBranch: string | null | undefined, baseBranch: string | null | undefined) {
  if (headBranch && baseBranch) {
    return `${headBranch} -> ${baseBranch}`;
  }
  return headBranch ?? baseBranch ?? "Branches unknown";
}

function formatIsoDate(value: string | null | undefined) {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().slice(0, 10);
}

function formatIsoDateFromEpoch(epochMs: number) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) {
    return "unknown";
  }
  return formatIsoDate(new Date(epochMs).toISOString());
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
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
