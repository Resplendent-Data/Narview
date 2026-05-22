import * as Dialog from "@radix-ui/react-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Check,
  ChevronRight,
  Columns2,
  Command,
  Copy,
  Eye,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  Github,
  GitPullRequest,
  Keyboard,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { memo, type FormEvent, type Ref, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownContent } from "./components/markdown-content";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Kbd } from "./components/ui/kbd";
import {
  buildAttentionMapPresentation,
  buildOrReuseAnalysisIndex,
  writeAnalysisIndex,
  type AnalysisIndex,
  type AttentionMapEdge,
} from "./lib/analysis-index";
import { appReleaseDownloadUrl, type AppUpdateClient, useAppUpdater } from "./lib/app-updater";
import { type AuthClient, type AuthSession, type OAuthStartResponse, tauriAuthClient } from "./lib/auth";
import {
  buildLazyDiffState,
  getDefaultLoadedDiffHunkIds,
  readDiffModePreference,
  writeDiffModePreference,
  type DiffLine,
  type DiffMode,
} from "./lib/diff-viewer";
import { buildHandoffPacket, buildHumanFeedbackPacket, renderHandoffMarkdown, type HandoffPacketMode } from "./lib/handoff-packet";
import { getBoundedRenderWindow } from "./lib/large-pr-performance";
import {
  buildDiagnosticsPreview,
  renderDiagnosticsExport,
  summarizeFileChangeStore,
  summarizeReviewQueueStore,
  summarizeReviewSessionStore,
  telemetryPolicy,
  type DiagnosticsPreview,
} from "./lib/privacy-diagnostics";
import {
  buildIncrementalFetchPlan,
  cacheStats,
  clearFetchedGithubData,
  readCacheStore,
  readCachedPullRequest,
  setCachedPullRequestPinned,
  upsertCachedPullRequest,
  writeCachedPullRequestData,
  type CachedFileSummary,
  type CachedPullRequestData,
  type CachedReviewThreadComment,
  type CachedReviewThread,
  type CacheStats,
} from "./lib/pr-cache";
import {
  buildFileChangeCounts,
  buildFileChangeViews,
  clearFileChangeStore,
  defaultFileChangeFilters,
  filterFileChanges,
  readFileChangeStore,
  setFileChangeViewed,
  syncFileChanges,
  type FileChangeFilters,
  type FileChangeView,
  type FileKind,
} from "./lib/file-changes";
import { buildReviewOverview, type HotspotScore, type RepositoryHotspotOverride } from "./lib/review-overview";
import { buildReviewTargetInspectorModel, type ReviewTargetInspectorModel } from "./lib/review-target-inspector";
import { buildReviewPathItems, buildReviewWorkProgress, moveReviewPathSelection, type ReviewPathItem } from "./lib/review-path";
import {
  getReviewThreadFileAnchorState,
  getReviewThreadLineAnchorState,
  type ReviewThreadFileAnchor,
  type ReviewThreadLineAnchor,
} from "./lib/review-thread-anchors";
import {
  buildNeedsReReviewTargetIdSet,
  buildReviewedTargetIdSet,
  buildReviewTargetReviewStates,
  readReviewTargetStateStore,
  setReviewTargetReviewed as setStoredReviewTargetReviewed,
  syncReviewTargets,
  type ReviewTargetReviewState,
} from "./lib/review-target-state";
import { buildReviewTargets } from "./lib/review-targets";
import {
  buildReviewQueueCounts,
  buildReviewThreadViews,
  clearReviewQueueStore,
  defaultReviewQueueFilters,
  filterReviewThreads,
  getReviewThreadOrigin,
  readReviewQueueStore,
  setReviewThreadReviewed,
  syncReviewThreads,
  type ReviewOriginFilter,
  type ReviewQueueFilters,
  type ReviewReviewedFilter,
  type ReviewStateFilter,
  type ReviewThreadView,
} from "./lib/review-queue";
import {
  clearReviewSessionStore,
  getPullRequestKey,
  localReviewSessionClient,
  parsePullRequestUrl,
  readReviewSessionStore,
  type ReviewSessionClient,
  type ReviewSessionSnapshot,
} from "./lib/review-session";
import {
  createThreadActionFailure,
  tauriThreadActionClient,
  type ThreadActionClient,
  type ThreadActionResult,
  type ThreadWriteAction,
} from "./lib/thread-actions";
import { cn } from "./lib/utils";
import {
  idleRefreshStatus,
  createUnavailablePullRequestAnalysisInput,
  createUnavailableReviewCloneStatus,
  type PullRequestAnalysisFilesResponse,
  type PullRequestAnalysisInput,
  type PullRequestAnalysisInputState,
  type PullRequestSummary,
  type RefreshStatus,
  type ReviewCloneHealthState,
  type ReviewCloneStatus,
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
  updaterClient?: AppUpdateClient;
};

type CommandPaletteItem = {
  id: string;
  category: "Navigation" | "Review" | "Filters" | "Files" | "Bulk" | "Handoff";
  label: string;
  description: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  keywords?: string[];
  run: () => void | Promise<void>;
};

type QueueButton = {
  id: string;
  label: string;
  count: number;
  tone: "danger" | "warning" | "info" | "muted";
  filters: ReviewQueueFilters;
};

type FileExplorerRow =
  | {
      type: "directory";
      id: string;
      name: string;
      path: string;
      depth: number;
    }
  | {
      type: "file";
      id: string;
      name: string;
      path: string;
      depth: number;
      view: FileChangeView;
      threadCount: number;
      hotspot: HotspotScore | null;
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

const fallbackFileSummaries: CachedFileSummary[] = [
  { path: "src/auth/session.ts", additions: 128, deletions: 86, status: "modified" },
  { path: "src/review/queue.ts", additions: 94, deletions: 21, status: "modified" },
  { path: "src-tauri/src/github.rs", additions: 188, deletions: 0, status: "added" },
  { path: "assets/review-map.png", additions: 0, deletions: 0, status: "binary" },
  { path: "notebooks/review-findings.ipynb", additions: 0, deletions: 0, status: "modified" },
];

const selectedThread = {
  author: "coderabbitai",
  title: "Guard stale session reuse after token rotation",
  file: "src/auth/session.ts",
  line: 142,
  state: "Unresolved",
  body:
    "_⚠️ Potential issue_ | _Major_ | _Quick win_\n\nThe rotated token path can still reuse the previous session cache entry. Consider invalidating the session record before returning the new credential.\n\n<details><summary>Suggested migration hardening</summary>\n\n```ts\nsessionCache.invalidate(previousSession.id);\nreturn nextCredential;\n```\n\nVerify the rotated credential cannot read the old session record.\n</details>",
};

const handoffIntentOptions = [
  { value: "Fix selected feedback", label: "Fix selected feedback" },
  { value: "Explain why selected feedback is not applied", label: "Explain why feedback is not applied" },
  { value: "Audit the risky parts of this pull request", label: "Audit risky PR areas" },
];

const reviewThreadRenderLimit = 80;
const fullFileRenderLimit = 320;

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

function getReviewCloneBadge(state: ReviewCloneHealthState) {
  if (state === "ready") {
    return { label: "Ready", variant: "success" as const };
  }
  if (state === "cloning") {
    return { label: "Cloning", variant: "info" as const };
  }
  if (state === "stale") {
    return { label: "Stale", variant: "warning" as const };
  }
  if (state === "failed") {
    return { label: "Failed", variant: "danger" as const };
  }
  if (state === "unavailable") {
    return { label: "Unavailable", variant: "warning" as const };
  }
  return { label: "Not cloned", variant: "muted" as const };
}

function getReviewCloneActionLabel(state: ReviewCloneHealthState) {
  if (state === "ready") {
    return "Check clone";
  }
  if (state === "stale") {
    return "Repair clone";
  }
  if (state === "failed") {
    return "Retry clone";
  }
  if (state === "cloning") {
    return "Cloning...";
  }
  return "Initialize clone";
}

function getAnalysisInputBadge(state: PullRequestAnalysisInputState | "preparing") {
  if (state === "ready") {
    return { label: "Prepared", variant: "success" as const };
  }
  if (state === "preparing") {
    return { label: "Preparing", variant: "info" as const };
  }
  if (state === "failed") {
    return { label: "Failed", variant: "danger" as const };
  }
  return { label: "Unavailable", variant: "warning" as const };
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
  if (conclusion === "skipped") {
    return { label: "skipped", variant: "warning" as const };
  }
  if (!conclusion) {
    return { label: "Completed", variant: "muted" as const };
  }
  return { label: conclusion.replace("-", " "), variant: "danger" as const };
}

function getLiveChecksBadge(checks: { total: number; passing: number; failing: number; pending: number }, loading: boolean) {
  if (loading) {
    return { label: "Syncing", variant: "info" as const };
  }
  if (checks.failing > 0) {
    return { label: `${checks.failing} failing`, variant: "danger" as const };
  }
  if (checks.pending > 0) {
    return { label: `${checks.pending} running`, variant: "warning" as const };
  }
  if (checks.total === 0) {
    return { label: "No checks", variant: "muted" as const };
  }
  return { label: `${checks.passing}/${checks.total} passing`, variant: "success" as const };
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

function getLastCheckedLabel(timestamp: number | null) {
  if (!timestamp) {
    return "Never";
  }

  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFileStatusLabel(status: CachedFileSummary["status"]) {
  return status[0].toUpperCase() + status.slice(1);
}

function getFileKindLabel(kind: FileKind) {
  if (kind === "non-text") {
    return "Non-text";
  }
  return kind[0].toUpperCase() + kind.slice(1);
}

function getFileLineLabel(file: CachedFileSummary) {
  if (file.status === "binary" && file.additions + file.deletions === 0) {
    return "binary";
  }

  const additions = file.additions > 0 ? `+${file.additions}` : "+0";
  const deletions = file.deletions > 0 ? `-${file.deletions}` : "-0";
  return `${additions} ${deletions}`;
}

function buildFileExplorerRows(
  files: FileChangeView[],
  threads: ReviewThreadView[],
  hotspots: HotspotScore[],
): FileExplorerRow[] {
  const rows: FileExplorerRow[] = [];
  const seenDirectories = new Set<string>();
  const threadCountByPath = new Map<string, number>();
  const hotspotByPath = new Map(hotspots.map((hotspot) => [hotspot.path, hotspot]));

  for (const view of threads) {
    const path = view.thread.filePath;
    threadCountByPath.set(path, (threadCountByPath.get(path) ?? 0) + 1);
  }

  for (const view of [...files].sort((left, right) => left.file.path.localeCompare(right.file.path))) {
    const parts = view.file.path.split("/");
    for (let index = 0; index < parts.length - 1; index += 1) {
      const path = parts.slice(0, index + 1).join("/");
      if (seenDirectories.has(path)) {
        continue;
      }
      seenDirectories.add(path);
      rows.push({
        type: "directory",
        id: `directory:${path}`,
        name: parts[index],
        path,
        depth: index,
      });
    }

    rows.push({
      type: "file",
      id: view.id,
      name: parts.at(-1) ?? view.file.path,
      path: view.file.path,
      depth: Math.max(parts.length - 1, 0),
      view,
      threadCount: threadCountByPath.get(view.file.path) ?? 0,
      hotspot: hotspotByPath.get(view.file.path) ?? null,
    });
  }

  return rows;
}

interface ReviewTargetFlowProps {
  items: ReviewPathItem[];
  attentionEdges: AttentionMapEdge[];
  selectedTargetId: string | null;
  reviewedTargetIds: Set<string>;
  needsReReviewTargetIds: Set<string>;
  onSelectTarget: (targetId: string) => void;
  onOpenTarget: (targetId: string) => void;
}

type ReviewTargetNodeData = {
  order: number;
  title: string;
  primaryLabel: string;
  scopeLabel: string;
  kindLabel: string;
  hotspotScore: number;
  fileCount: number;
  changedLines: number;
  threadCount: number;
  compact: boolean;
  reviewed: boolean;
  needsReReview: boolean;
};

const ReviewTargetNode = memo(function ReviewTargetNode({ data, selected }: NodeProps<Node<ReviewTargetNodeData>>) {
  const emphasized = selected;

  return (
    <div
      className={cn(
        "review-target-node group relative overflow-hidden border bg-card text-card-foreground shadow-sm transition-shadow",
        data.compact ? "h-11 w-40 rounded-md px-2 py-1.5" : "h-28 w-64 rounded-lg p-3",
        emphasized && "border-primary shadow-lg ring-2 ring-primary/20",
        !emphasized && data.needsReReview && "border-amber-500/70 bg-amber-500/10",
        !emphasized && !data.needsReReview && "border-border",
        data.reviewed && "opacity-55",
      )}
      title={data.title}
    >
      <Handle id="target-top" className="opacity-0" position={Position.Top} type="target" />
      <Handle id="target-right" className="opacity-0" position={Position.Right} type="target" />
      <Handle id="target-bottom" className="opacity-0" position={Position.Bottom} type="target" />
      <Handle id="target-left" className="opacity-0" position={Position.Left} type="target" />
      <Handle id="source-top" className="opacity-0" position={Position.Top} type="source" />
      <Handle id="source-right" className="opacity-0" position={Position.Right} type="source" />
      <Handle id="source-bottom" className="opacity-0" position={Position.Bottom} type="source" />
      <Handle id="source-left" className="opacity-0" position={Position.Left} type="source" />
      {data.compact ? (
        <div className="flex h-full min-w-0 items-center gap-2">
          <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
            {data.order}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] font-semibold leading-4">{data.primaryLabel}</p>
            <p className="truncate text-[10px] leading-4 text-muted-foreground">{data.scopeLabel}</p>
            <span className="sr-only">{data.title}</span>
          </div>
          {data.threadCount > 0 && (
            <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              {data.threadCount}
            </span>
          )}
        </div>
      ) : (
        <div className="flex h-full min-w-0 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Badge variant={emphasized ? "info" : data.needsReReview ? "warning" : "muted"}>#{data.order}</Badge>
              <span className="truncate text-[11px] font-medium uppercase tracking-normal text-muted-foreground">{data.kindLabel}</span>
            </div>
            {data.hotspotScore > 0 && (
              <Badge variant={data.hotspotScore > 70 ? "danger" : "warning"}>{getReviewTargetScoreLabel(data.hotspotScore)}</Badge>
            )}
          </div>
          <p className="mt-2 truncate font-mono text-[13px] font-semibold leading-5">{data.primaryLabel}</p>
          <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">{data.scopeLabel}</p>
          <span className="sr-only">{data.title}</span>
          <div className="mt-auto flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            <span>{data.fileCount} file{data.fileCount === 1 ? "" : "s"}</span>
            <span>{data.changedLines} lines</span>
            {data.threadCount > 0 && <span>{data.threadCount} thread{data.threadCount === 1 ? "" : "s"}</span>}
          </div>
        </div>
      )}
    </div>
  );
}, areReviewTargetNodePropsEqual);

function areReviewTargetNodePropsEqual(
  previous: NodeProps<Node<ReviewTargetNodeData>>,
  next: NodeProps<Node<ReviewTargetNodeData>>,
) {
  return previous.selected === next.selected && previous.data === next.data;
}

const reviewTargetNodeTypes = {
  reviewTarget: ReviewTargetNode,
};

function ReviewTargetFlow({
  attentionEdges,
  items,
  selectedTargetId,
  reviewedTargetIds,
  needsReReviewTargetIds,
  onSelectTarget,
  onOpenTarget,
}: ReviewTargetFlowProps) {
  const visualItems = useMemo(() => getReviewTargetVisualItems(items), [items]);
  const denseBoard = visualItems.length > 120;
  const layoutItems = useMemo(
    () => getReviewTargetLayoutItems(visualItems, needsReReviewTargetIds),
    [needsReReviewTargetIds, visualItems],
  );
  const relationshipGroups = useMemo(
    () => buildReviewTargetRelationshipGroups(items, attentionEdges),
    [attentionEdges, items],
  );
  const positionsById = useMemo(
    () => layoutReviewTargetNodes(layoutItems, relationshipGroups),
    [layoutItems, relationshipGroups],
  );
  const baseNodes = useMemo(
    () => buildReviewTargetBaseNodes(layoutItems, positionsById, reviewedTargetIds, needsReReviewTargetIds),
    [layoutItems, needsReReviewTargetIds, positionsById, reviewedTargetIds],
  );
  const nodes = useMemo(
    () => applyReviewTargetSelectionToNodes(baseNodes, selectedTargetId),
    [baseNodes, selectedTargetId],
  );
  const edges = useMemo(
    () => buildReviewTargetRelationshipEdges(relationshipGroups, positionsById, selectedTargetId, visualItems.length),
    [positionsById, relationshipGroups, selectedTargetId, visualItems.length],
  );

  return (
    <ReactFlowProvider>
      <ReviewTargetFlowCanvas
        denseBoard={denseBoard}
        edges={edges}
        nodes={nodes}
        onOpenTarget={onOpenTarget}
        onSelectTarget={onSelectTarget}
        selectedTargetId={selectedTargetId}
      />
    </ReactFlowProvider>
  );
}

function ReviewTargetFlowCanvas({
  denseBoard,
  edges,
  nodes,
  onOpenTarget,
  onSelectTarget,
  selectedTargetId,
}: {
  denseBoard: boolean;
  edges: Edge[];
  nodes: Node<ReviewTargetNodeData>[];
  onOpenTarget: (targetId: string) => void;
  onSelectTarget: (targetId: string) => void;
  selectedTargetId: string | null;
}) {
  const flow = useReactFlow();

  useEffect(() => {
    if (!selectedTargetId) {
      return;
    }

    const focusNodeIds = getReviewTargetFocusNodeIds(selectedTargetId, nodes, edges);
    window.requestAnimationFrame(() => {
      void flow.fitView({
        nodes: focusNodeIds.map((id) => ({ id })),
        padding: 0.34,
        duration: 180,
      });
    });
  }, [edges, flow, nodes, selectedTargetId]);

  return (
    <div
      aria-label="Review target graph"
      className="h-full min-h-full overflow-hidden bg-background"
      data-edge-count={edges.length}
      data-focused-target-id={selectedTargetId ?? ""}
    >
      <ReactFlow
        colorMode="system"
        edges={edges}
        fitView
        maxZoom={1.8}
        minZoom={0.25}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        onlyRenderVisibleElements={denseBoard}
        nodeTypes={reviewTargetNodeTypes}
        onNodeDoubleClick={(_, node) => onOpenTarget(node.id)}
        onNodeClick={(_, node) => onSelectTarget(node.id)}
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} />
        <Controls showInteractive={false} />
        {!denseBoard && <MiniMap pannable={false} zoomable={false} nodeStrokeWidth={2} />}
      </ReactFlow>
    </div>
  );
}

function buildReviewTargetFlowElements(
  items: ReviewPathItem[],
  attentionEdges: AttentionMapEdge[],
  selectedTargetId: string | null,
  reviewedTargetIds: Set<string>,
  needsReReviewTargetIds: Set<string>,
): { nodes: Node<ReviewTargetNodeData>[]; edges: Edge[] } {
  const visualItems = getReviewTargetVisualItems(items);
  const layoutItems = getReviewTargetLayoutItems(visualItems, needsReReviewTargetIds);
  const relationshipGroups = buildReviewTargetRelationshipGroups(items, attentionEdges);
  const positionsById = layoutReviewTargetNodes(layoutItems, relationshipGroups);
  const baseNodes = buildReviewTargetBaseNodes(layoutItems, positionsById, reviewedTargetIds, needsReReviewTargetIds);
  const nodes = applyReviewTargetSelectionToNodes(baseNodes, selectedTargetId);
  const edges = buildReviewTargetRelationshipEdges(relationshipGroups, positionsById, selectedTargetId, visualItems.length);

  return {
    nodes,
    edges,
  };
}

function getReviewTargetVisualItems(items: ReviewPathItem[]) {
  return [...items].sort(
    (left, right) => left.order - right.order || left.target.modulePath.localeCompare(right.target.modulePath) || left.id.localeCompare(right.id),
  );
}

function getReviewTargetLayoutItems(
  visualItems: ReviewPathItem[],
  needsReReviewTargetIds: Set<string>,
): ReviewTargetLayoutItem[] {
  const denseBoard = visualItems.length > 120;
  const prominentLimit = denseBoard ? 18 : 24;
  const hotspotLimit = denseBoard ? 78 : 70;

  return visualItems.map((item) => ({
    item,
    compact: !needsReReviewTargetIds.has(item.id) && item.order > prominentLimit && item.hotspotScore < hotspotLimit,
  }));
}

function buildReviewTargetBaseNodes(
  layoutItems: ReviewTargetLayoutItem[],
  positionsById: Map<string, ReviewTargetNodeLayout>,
  reviewedTargetIds: Set<string>,
  needsReReviewTargetIds: Set<string>,
) {
  return layoutItems.map(({ item, compact }) => {
    const reviewed = reviewedTargetIds.has(item.id);
    const needsReReview = needsReReviewTargetIds.has(item.id);
    const position = positionsById.get(item.id) ?? { x: item.order * 32, y: item.order * 24 };

    return {
      id: item.id,
      type: "reviewTarget",
      data: buildReviewTargetNodeData(item, compact, reviewed, needsReReview),
      position,
      selected: false,
      zIndex: needsReReview ? 45 : compact ? 28 : 36,
    } satisfies Node<ReviewTargetNodeData>;
  });
}

function applyReviewTargetSelectionToNodes(
  baseNodes: Node<ReviewTargetNodeData>[],
  selectedTargetId: string | null,
) {
  if (!selectedTargetId) {
    return baseNodes;
  }

  return baseNodes.map((node) => {
    if (node.id !== selectedTargetId) {
      return node;
    }

    return {
      ...node,
      selected: true,
      zIndex: 80,
    } satisfies Node<ReviewTargetNodeData>;
  });
}

function getReviewTargetFocusNodeIds(selectedTargetId: string, nodes: Node<ReviewTargetNodeData>[], edges: Edge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const relatedIds = new Set<string>([selectedTargetId]);
  for (const edge of edges) {
    if (edge.source === selectedTargetId && nodeIds.has(edge.target)) {
      relatedIds.add(edge.target);
    }
    if (edge.target === selectedTargetId && nodeIds.has(edge.source)) {
      relatedIds.add(edge.source);
    }
  }

  if (relatedIds.size > 1) {
    return [...relatedIds].slice(0, 14);
  }

  return [selectedTargetId];
}

type ReviewTargetRelationshipKind = AttentionMapEdge["kind"] | "module-neighborhood" | "path-neighborhood";
type ReviewTargetRelationshipGroup = {
  source: string;
  target: string;
  count: number;
  kinds: Set<ReviewTargetRelationshipKind>;
};

function buildReviewTargetRelationshipGroups(
  items: ReviewPathItem[],
  attentionEdges: AttentionMapEdge[],
) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const targetIdsByNodeId = new Map<string, Set<string>>();
  const targetIdsByFileEndpoint = new Map<string, Set<string>>();

  for (const item of items) {
    for (const nodeId of item.target.nodeIds) {
      addMapSetValue(targetIdsByNodeId, nodeId, item.id);
    }
    for (const path of item.target.paths) {
      addMapSetValue(targetIdsByFileEndpoint, `file:${path}`, item.id);
    }
  }

  const edgeGroups = new Map<string, ReviewTargetRelationshipGroup>();
  const addRelationship = (leftTargetId: string, rightTargetId: string, kind: ReviewTargetRelationshipKind) => {
    if (leftTargetId === rightTargetId) {
      return;
    }

    const left = itemById.get(leftTargetId);
    const right = itemById.get(rightTargetId);
    if (!left || !right) {
      return;
    }

    const [source, target] =
      left.order < right.order || (left.order === right.order && left.id.localeCompare(right.id) <= 0)
        ? [leftTargetId, rightTargetId]
        : [rightTargetId, leftTargetId];
    const key = `${source}->${target}`;
    const existing = edgeGroups.get(key);
    if (existing) {
      existing.count += 1;
      existing.kinds.add(kind);
      return;
    }

    edgeGroups.set(key, { source, target, count: 1, kinds: new Set([kind]) });
  };

  for (const edge of attentionEdges) {
    const fromTargetIds = resolveReviewTargetEndpoint(edge.from, targetIdsByNodeId, targetIdsByFileEndpoint);
    const toTargetIds = resolveReviewTargetEndpoint(edge.to, targetIdsByNodeId, targetIdsByFileEndpoint);
    for (const fromTargetId of fromTargetIds) {
      for (const toTargetId of toTargetIds) {
        addRelationship(fromTargetId, toTargetId, edge.kind);
      }
    }
  }

  addNeighborhoodRelationships(items, edgeGroups, addRelationship);

  return [...edgeGroups.values()]
    .sort((left, right) => {
      return right.count - left.count || left.source.localeCompare(right.source) || left.target.localeCompare(right.target);
    })
    .slice(0, 900);
}

function buildReviewTargetRelationshipEdges(
  groups: ReviewTargetRelationshipGroup[],
  positionsById: Map<string, ReviewTargetNodeLayout>,
  selectedTargetId: string | null,
  targetCount: number,
) {
  const selectedNeighborIds = getReviewTargetNeighborIds(groups, selectedTargetId);
  const visibleGroups = getVisibleReviewTargetRelationshipGroups(groups, selectedTargetId, selectedNeighborIds, targetCount);

  return visibleGroups.map((group) => {
    const selected = group.source === selectedTargetId || group.target === selectedTargetId;
    const nearSelected =
      Boolean(selectedTargetId) && (selectedNeighborIds.has(group.source) || selectedNeighborIds.has(group.target));
    const background = Boolean(selectedTargetId) && !selected && !nearSelected;
    const direct = [...group.kinds].some((kind) => kind !== "module-neighborhood" && kind !== "path-neighborhood");
    const moduleOnly = !direct && group.kinds.has("module-neighborhood");
    const pathOnly = !direct && group.kinds.has("path-neighborhood");
    const handles = getReviewTargetEdgeHandles(group, positionsById);
    const opacity = getReviewTargetEdgeOpacity({ background, direct, moduleOnly, nearSelected, selected });
    const width = getReviewTargetEdgeWidth({ count: group.count, background, direct, moduleOnly, nearSelected, selected });

    return {
      id: `target-edge:${group.source}:${group.target}`,
      source: group.source,
      sourceHandle: handles.sourceHandle,
      target: group.target,
      targetHandle: handles.targetHandle,
      animated: selected,
      interactionWidth: 18,
      type: "default",
      zIndex: selected ? 2 : nearSelected ? 1 : 0,
      label: selected && group.count > 1 ? String(group.count) : undefined,
      labelStyle: { fill: selected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 650 },
      labelBgBorderRadius: 4,
      labelBgPadding: [4, 2],
      labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.92 },
      style: {
        stroke: selected
          ? "hsl(var(--primary))"
          : background
            ? "hsl(var(--muted-foreground))"
            : direct
              ? "hsl(var(--primary) / 0.58)"
            : moduleOnly
              ? "hsl(42 92% 50%)"
              : "hsl(var(--muted-foreground))",
        strokeDasharray: pathOnly ? "2 8" : moduleOnly ? "6 6" : undefined,
        strokeLinecap: "round",
        strokeOpacity: opacity,
        strokeWidth: width,
      },
    } satisfies Edge;
  });
}

function getVisibleReviewTargetRelationshipGroups(
  groups: ReviewTargetRelationshipGroup[],
  selectedTargetId: string | null,
  selectedNeighborIds: Set<string>,
  targetCount: number,
) {
  if (targetCount <= 120 || groups.length <= 360) {
    return groups;
  }

  if (!selectedTargetId) {
    return groups.slice(0, getDenseReviewTargetEdgeBudget(targetCount, false));
  }

  const selectedGroups: ReviewTargetRelationshipGroup[] = [];
  const nearSelectedGroups: ReviewTargetRelationshipGroup[] = [];
  const backgroundGroups: ReviewTargetRelationshipGroup[] = [];
  for (const group of groups) {
    if (group.source === selectedTargetId || group.target === selectedTargetId) {
      selectedGroups.push(group);
      continue;
    }
    if (selectedNeighborIds.has(group.source) || selectedNeighborIds.has(group.target)) {
      nearSelectedGroups.push(group);
      continue;
    }
    backgroundGroups.push(group);
  }

  const budget = getDenseReviewTargetEdgeBudget(targetCount, true);
  const selectedBudgetRemaining = Math.max(0, budget - selectedGroups.length);
  const nearBudget = Math.min(nearSelectedGroups.length, Math.max(120, Math.floor(selectedBudgetRemaining * 0.72)));
  const backgroundBudget = Math.max(0, budget - selectedGroups.length - nearBudget);

  return [
    ...selectedGroups,
    ...nearSelectedGroups.slice(0, nearBudget),
    ...backgroundGroups.slice(0, backgroundBudget),
  ];
}

function getDenseReviewTargetEdgeBudget(targetCount: number, selected: boolean) {
  if (targetCount > 260) {
    return selected ? 260 : 320;
  }
  return selected ? 300 : 360;
}

function getReviewTargetNeighborIds(groups: ReviewTargetRelationshipGroup[], selectedTargetId: string | null) {
  const neighbors = new Set<string>();
  if (!selectedTargetId) {
    return neighbors;
  }

  neighbors.add(selectedTargetId);
  for (const group of groups) {
    if (group.source === selectedTargetId) {
      neighbors.add(group.target);
    }
    if (group.target === selectedTargetId) {
      neighbors.add(group.source);
    }
  }

  return neighbors;
}

function getReviewTargetEdgeOpacity({
  background,
  direct,
  moduleOnly,
  nearSelected,
  selected,
}: {
  background: boolean;
  direct: boolean;
  moduleOnly: boolean;
  nearSelected: boolean;
  selected: boolean;
}) {
  if (selected) {
    return 0.92;
  }
  if (background) {
    return direct ? 0.12 : moduleOnly ? 0.09 : 0.07;
  }
  if (nearSelected) {
    return direct ? 0.34 : moduleOnly ? 0.24 : 0.18;
  }
  return direct ? 0.44 : moduleOnly ? 0.28 : 0.18;
}

function getReviewTargetEdgeWidth({
  background,
  count,
  direct,
  moduleOnly,
  nearSelected,
  selected,
}: {
  background: boolean;
  count: number;
  direct: boolean;
  moduleOnly: boolean;
  nearSelected: boolean;
  selected: boolean;
}) {
  if (selected) {
    return 2.6;
  }
  if (background) {
    return 0.9;
  }
  if (nearSelected) {
    return direct ? Math.min(1.9, 1 + count * 0.1) : moduleOnly ? 1.3 : 1;
  }
  return direct ? Math.min(2.1, 1.1 + count * 0.12) : moduleOnly ? 1.5 : 1.1;
}

type ReviewTargetLayoutItem = {
  item: ReviewPathItem;
  compact: boolean;
};
type ReviewTargetNodeLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type ReviewTargetSimulationNode = SimulationNodeDatum & {
  id: string;
  order: number;
  compact: boolean;
  width: number;
  height: number;
  radius: number;
  clusterX: number;
  clusterY: number;
};
type ReviewTargetSimulationLink = SimulationLinkDatum<ReviewTargetSimulationNode> & {
  count: number;
  direct: boolean;
};

const reviewTargetFullNodeSize = { width: 256, height: 112 };
const reviewTargetCompactNodeSize = { width: 160, height: 44 };
const reviewTargetLayoutMargin = 120;

function layoutReviewTargetNodes(
  layoutItems: ReviewTargetLayoutItem[],
  relationshipGroups: ReviewTargetRelationshipGroup[],
): Map<string, ReviewTargetNodeLayout> {
  if (layoutItems.length === 0) {
    return new Map();
  }

  const visibleIds = new Set(layoutItems.map(({ item }) => item.id));
  const components = buildReviewTargetLayoutComponents(layoutItems, relationshipGroups);
  const componentByTargetId = new Map<string, number>();
  const targetIndexInComponent = new Map<string, number>();
  components.forEach((component, componentIndex) => {
    component.ids.forEach((targetId, index) => {
      componentByTargetId.set(targetId, componentIndex);
      targetIndexInComponent.set(targetId, index);
    });
  });
  const componentCenters = getReviewTargetComponentCenters(components);
  const neighborhoodCenters = getReviewTargetNeighborhoodCenters(layoutItems, components, componentCenters);
  const nodes: ReviewTargetSimulationNode[] = layoutItems.map(({ item, compact }) => {
    const size = compact ? reviewTargetCompactNodeSize : reviewTargetFullNodeSize;
    const componentIndex = componentByTargetId.get(item.id) ?? 0;
    const component = components[componentIndex];
    const componentCenter = componentCenters.get(componentIndex) ?? { x: 0, y: 0 };
    const neighborhoodKey = getReviewTargetNeighborhoodKey(item.target) ?? getReviewTargetBroadNeighborhoodKey(item.target) ?? item.target.modulePath;
    const clusterCenter = neighborhoodCenters.get(`${componentIndex}:${neighborhoodKey}`) ?? componentCenter;
    const localIndex = targetIndexInComponent.get(item.id) ?? 0;
    const localRadius = Math.max(140, Math.sqrt(component?.ids.length ?? 1) * 56);
    const angle = localIndex * 2.399963229728653;

    return {
      id: item.id,
      order: item.order,
      compact,
      width: size.width,
      height: size.height,
      radius: Math.hypot(size.width, size.height) / 2 + (compact ? 36 : 58),
      clusterX: clusterCenter.x,
      clusterY: clusterCenter.y,
      x: clusterCenter.x + Math.cos(angle) * localRadius,
      y: clusterCenter.y + Math.sin(angle) * localRadius,
    };
  });
  const links: ReviewTargetSimulationLink[] = relationshipGroups
    .filter((group) => visibleIds.has(group.source) && visibleIds.has(group.target))
    .map((group) => ({
      source: group.source,
      target: group.target,
      count: group.count,
      direct: [...group.kinds].some((kind) => kind !== "module-neighborhood" && kind !== "path-neighborhood"),
    }));

  forceSimulation<ReviewTargetSimulationNode>(nodes)
    .stop()
    .force(
      "link",
      forceLink<ReviewTargetSimulationNode, ReviewTargetSimulationLink>(links)
        .id((node) => node.id)
        .distance((link) => (link.direct ? 230 : 300))
        .strength((link) => Math.min(0.36, link.direct ? 0.14 + link.count * 0.02 : 0.08)),
    )
    .force("charge", forceManyBody<ReviewTargetSimulationNode>().strength((node) => (node.compact ? -260 : -640)).theta(0.85))
    .force("collision", forceCollide<ReviewTargetSimulationNode>().radius((node) => node.radius).strength(0.96).iterations(3))
    .force("x", forceX<ReviewTargetSimulationNode>((node) => node.clusterX).strength(0.045))
    .force("y", forceY<ReviewTargetSimulationNode>((node) => node.clusterY).strength(0.045))
    .alpha(1)
    .alphaDecay(getReviewTargetLayoutAlphaDecay(layoutItems.length))
    .velocityDecay(0.36)
    .tick(getReviewTargetLayoutIterations(layoutItems.length));

  return normalizeReviewTargetLayout(nodes);
}

function buildReviewTargetLayoutComponents(layoutItems: ReviewTargetLayoutItem[], relationshipGroups: ReviewTargetRelationshipGroup[]) {
  const ids = layoutItems.map(({ item }) => item.id);
  const idSet = new Set(ids);
  const adjacency = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const group of relationshipGroups) {
    if (!idSet.has(group.source) || !idSet.has(group.target)) {
      continue;
    }
    adjacency.get(group.source)?.add(group.target);
    adjacency.get(group.target)?.add(group.source);
  }

  const itemById = new Map(layoutItems.map(({ item }) => [item.id, item]));
  const visited = new Set<string>();
  const components: Array<{ ids: string[]; minOrder: number }> = [];
  for (const id of ids) {
    if (visited.has(id)) {
      continue;
    }

    const queue = [id];
    const componentIds: string[] = [];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      componentIds.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    componentIds.sort((left, right) => (itemById.get(left)?.order ?? 0) - (itemById.get(right)?.order ?? 0) || left.localeCompare(right));
    components.push({
      ids: componentIds,
      minOrder: Math.min(...componentIds.map((targetId) => itemById.get(targetId)?.order ?? Number.MAX_SAFE_INTEGER)),
    });
  }

  return components.sort((left, right) => left.minOrder - right.minOrder || right.ids.length - left.ids.length);
}

function getReviewTargetComponentCenters(components: Array<{ ids: string[]; minOrder: number }>) {
  const centers = new Map<number, { x: number; y: number }>();
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const maxRowWidth = 3600;

  components.forEach((component, index) => {
    const width = Math.max(520, Math.ceil(Math.sqrt(component.ids.length)) * 280);
    const height = Math.max(360, Math.ceil(component.ids.length / Math.max(1, Math.ceil(Math.sqrt(component.ids.length)))) * 190);
    if (cursorX > 0 && cursorX + width > maxRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + 320;
      rowHeight = 0;
    }

    centers.set(index, {
      x: cursorX + width / 2,
      y: cursorY + height / 2,
    });
    cursorX += width + 280;
    rowHeight = Math.max(rowHeight, height);
  });

  return centers;
}

function getReviewTargetNeighborhoodCenters(
  layoutItems: ReviewTargetLayoutItem[],
  components: Array<{ ids: string[]; minOrder: number }>,
  componentCenters: Map<number, { x: number; y: number }>,
) {
  const itemById = new Map(layoutItems.map(({ item }) => [item.id, item]));
  const centers = new Map<string, { x: number; y: number }>();

  components.forEach((component, componentIndex) => {
    const componentCenter = componentCenters.get(componentIndex) ?? { x: 0, y: 0 };
    const keys = [
      ...new Set(
        component.ids.map((targetId) => {
          const target = itemById.get(targetId)?.target;
          return target ? getReviewTargetNeighborhoodKey(target) ?? getReviewTargetBroadNeighborhoodKey(target) ?? target.modulePath : "unknown";
        }),
      ),
    ].sort((left, right) => left.localeCompare(right));
    const ringRadius = Math.max(190, Math.sqrt(keys.length) * 170);

    keys.forEach((key, index) => {
      const angle = keys.length === 1 ? 0 : (index / keys.length) * Math.PI * 2 - Math.PI / 2;
      centers.set(`${componentIndex}:${key}`, {
        x: componentCenter.x + Math.cos(angle) * ringRadius,
        y: componentCenter.y + Math.sin(angle) * ringRadius,
      });
    });
  });

  return centers;
}

function normalizeReviewTargetLayout(nodes: ReviewTargetSimulationNode[]) {
  const minX = Math.min(...nodes.map((node) => (node.x ?? 0) - node.width / 2));
  const minY = Math.min(...nodes.map((node) => (node.y ?? 0) - node.height / 2));
  return new Map(
    nodes.map((node) => [
      node.id,
      {
        x: (node.x ?? 0) - node.width / 2 - minX + reviewTargetLayoutMargin,
        y: (node.y ?? 0) - node.height / 2 - minY + reviewTargetLayoutMargin,
        width: node.width,
        height: node.height,
      },
    ]),
  );
}

function getReviewTargetEdgeHandles(group: ReviewTargetRelationshipGroup, positionsById: Map<string, ReviewTargetNodeLayout>) {
  const source = positionsById.get(group.source);
  const target = positionsById.get(group.target);
  if (!source || !target) {
    return { sourceHandle: "source-bottom", targetHandle: "target-top" };
  }

  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }

  return deltaY > 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

function getReviewTargetLayoutIterations(count: number) {
  if (count <= 80) {
    return 280;
  }
  if (count <= 320) {
    return 220;
  }
  if (count <= 800) {
    return 160;
  }
  return 120;
}

function getReviewTargetLayoutAlphaDecay(count: number) {
  if (count <= 320) {
    return 0.018;
  }
  return 0.026;
}

function resolveReviewTargetEndpoint(
  endpointId: string,
  targetIdsByNodeId: Map<string, Set<string>>,
  targetIdsByFileEndpoint: Map<string, Set<string>>,
) {
  const nodeTargets = targetIdsByNodeId.get(endpointId);
  if (nodeTargets && nodeTargets.size > 0) {
    return [...nodeTargets];
  }

  const fileTargets = targetIdsByFileEndpoint.get(endpointId);
  if (fileTargets && fileTargets.size > 0) {
    return [...fileTargets];
  }

  return [];
}

function addNeighborhoodRelationships(
  items: ReviewPathItem[],
  edgeGroups: Map<string, ReviewTargetRelationshipGroup>,
  addRelationship: (leftTargetId: string, rightTargetId: string, kind: ReviewTargetRelationshipKind) => void,
) {
  const exactGroups = new Map<string, ReviewPathItem[]>();
  const broadGroups = new Map<string, ReviewPathItem[]>();
  for (const item of items) {
    const key = getReviewTargetNeighborhoodKey(item.target);
    if (key) {
      exactGroups.set(key, [...(exactGroups.get(key) ?? []), item]);
    }

    const broadKey = getReviewTargetBroadNeighborhoodKey(item.target);
    if (broadKey) {
      broadGroups.set(broadKey, [...(broadGroups.get(broadKey) ?? []), item]);
    }
  }

  const maxFallbackEdges = Math.min(700, items.length * 3);
  let fallbackEdges = 0;
  fallbackEdges += addGroupedNeighborEdges({
    edgeGroups,
    groups: exactGroups,
    kind: "module-neighborhood",
    maxEdges: maxFallbackEdges - fallbackEdges,
    neighborsPerTarget: 2,
    addRelationship,
  });

  addGroupedNeighborEdges({
    edgeGroups,
    groups: broadGroups,
    kind: "path-neighborhood",
    maxEdges: Math.max(0, maxFallbackEdges - fallbackEdges),
    neighborsPerTarget: 1,
    addRelationship,
  });
}

function addGroupedNeighborEdges({
  addRelationship,
  edgeGroups,
  groups,
  kind,
  maxEdges,
  neighborsPerTarget,
}: {
  addRelationship: (leftTargetId: string, rightTargetId: string, kind: ReviewTargetRelationshipKind) => void;
  edgeGroups: Map<string, ReviewTargetRelationshipGroup>;
  groups: Map<string, ReviewPathItem[]>;
  kind: "module-neighborhood" | "path-neighborhood";
  maxEdges: number;
  neighborsPerTarget: number;
}) {
  let added = 0;

  for (const [, groupItems] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (added >= maxEdges || groupItems.length < 2) {
      continue;
    }

    const sortedItems = [...groupItems].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    for (let index = 0; index < sortedItems.length - 1 && added < maxEdges; index += 1) {
      for (let offset = 1; offset <= neighborsPerTarget && index + offset < sortedItems.length && added < maxEdges; offset += 1) {
        const left = sortedItems[index];
        const right = sortedItems[index + offset];
        const pairKey =
          left.order < right.order || (left.order === right.order && left.id.localeCompare(right.id) <= 0)
            ? `${left.id}->${right.id}`
            : `${right.id}->${left.id}`;
        if (edgeGroups.has(pairKey)) {
          continue;
        }
        addRelationship(left.id, right.id, kind);
        added += 1;
      }
    }
  }

  return added;
}

function getReviewTargetNeighborhoodKey(target: ReviewPathItem["target"]) {
  if (target.modulePath && target.modulePath !== "Generated Cluster" && target.modulePath !== "Unknown module") {
    const parts = target.modulePath.split("/").filter(Boolean);
    return parts.length > 5 ? parts.slice(0, 5).join("/") : target.modulePath;
  }

  const firstPath = target.paths[0];
  if (!firstPath) {
    return null;
  }

  const parts = firstPath.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, Math.min(parts.length - 1, 5)).join("/") : parts[0];
}

function getReviewTargetBroadNeighborhoodKey(target: ReviewPathItem["target"]) {
  const anchor = target.modulePath && target.modulePath !== "Generated Cluster" && target.modulePath !== "Unknown module"
    ? target.modulePath
    : target.paths[0];
  if (!anchor) {
    return null;
  }

  const parts = anchor.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts[0] === "apps" && parts.length >= 3) {
    return parts.slice(0, 3).join("/");
  }
  if (parts[0] === "packages" && parts.length >= 2) {
    return parts.slice(0, 2).join("/");
  }
  return parts[0];
}

function addMapSetValue<Key, Value>(map: Map<Key, Set<Value>>, key: Key, value: Value) {
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

function buildReviewTargetNodeData(
  item: ReviewPathItem,
  compact: boolean,
  reviewed: boolean,
  needsReReview: boolean,
): ReviewTargetNodeData {
  return {
    order: item.order,
    title: item.target.title,
    primaryLabel: getReviewTargetPrimaryLabel(item.target),
    scopeLabel: getReviewTargetScopeLabel(item.target),
    kindLabel: getReviewTargetKindLabel(item.target),
    hotspotScore: item.hotspotScore,
    fileCount: item.target.size.files,
    changedLines: item.target.size.changedLines,
    threadCount: item.target.size.reviewThreads,
    compact,
    reviewed,
    needsReReview,
  };
}

function getReviewTargetPrimaryLabel(target: ReviewPathItem["target"]) {
  if (target.kind === "generated-cluster") {
    return target.modulePath === "Generated Cluster" ? "Generated cluster" : getPathTail(target.modulePath, 2);
  }
  if (target.filePath) {
    return target.filePath.split("/").at(-1) ?? target.filePath;
  }
  const firstPath = target.paths[0];
  if (firstPath) {
    return getPathTail(firstPath, 2);
  }
  return target.title.replace(/\s+(grouped|hunk)\s+review$/i, "");
}

function getReviewTargetScopeLabel(target: ReviewPathItem["target"]) {
  if (target.filePath) {
    const directory = target.filePath.split("/").slice(0, -1).join("/");
    return directory || target.filePath;
  }
  if (target.paths.length > 1) {
    return `${getPathTail(target.modulePath, 3)} · ${target.paths.length} files`;
  }
  return target.modulePath || target.title;
}

function getReviewTargetKindLabel(target: ReviewPathItem["target"]) {
  if (target.kind === "generated-cluster") {
    return "Cluster";
  }
  if (target.kind === "thread-group") {
    return "Thread";
  }
  if (target.fallback && target.filePath && target.size.nodes > 1) {
    return "File";
  }
  return target.fallback ? "Hunk" : "Symbol";
}

function getReviewTargetScoreLabel(score: number) {
  return `Score ${score}`;
}

function getPathTail(path: string, parts: number) {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(-parts).join("/") || path;
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

function getDiffLineReviewAnchor(filePath: string, line: DiffLine, anchors: ReviewThreadLineAnchor[]) {
  const side = line.kind === "deletion" ? "LEFT" : "RIGHT";
  const lineNumber = line.kind === "deletion" ? line.oldLine : line.newLine;
  if (lineNumber === null) {
    return null;
  }

  return anchors.find((anchor) => anchor.path === filePath && anchor.side === side && anchor.line === lineNumber) ?? null;
}

function getDiffThreadAnchorKey(diffState: { filePath: string; hunks: { id: string; loaded: boolean; lines: DiffLine[] }[] }, thread: CachedReviewThread | null) {
  if (!thread || thread.line === null || diffState.filePath !== thread.filePath) {
    return null;
  }

  for (const hunk of diffState.hunks) {
    if (!hunk.loaded) {
      continue;
    }
    const lineIndex = hunk.lines.findIndex((line) => line.newLine === thread.line);
    if (lineIndex >= 0) {
      return `${hunk.id}:${lineIndex}`;
    }
  }

  for (const hunk of diffState.hunks) {
    if (!hunk.loaded) {
      continue;
    }
    const lineIndex = hunk.lines.findIndex((line) => line.oldLine === thread.line);
    if (lineIndex >= 0) {
      return `${hunk.id}:${lineIndex}`;
    }
  }

  return null;
}

type DiffSyntaxToken = {
  text: string;
  className?: string;
};

const baseSyntaxKeywords = [
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "null",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
];

const languageSyntaxKeywords: Record<string, string[]> = {
  c: ["bool", "char", "double", "float", "include", "int", "long", "short", "sizeof", "struct", "typedef", "unsigned"],
  cpp: ["auto", "bool", "char", "double", "float", "include", "int", "long", "namespace", "private", "protected", "public", "short", "template", "typename", "using"],
  csharp: ["bool", "decimal", "delegate", "double", "event", "foreach", "int", "namespace", "private", "protected", "public", "string", "using"],
  css: ["important"],
  dart: ["final", "late", "mixin", "required", "typedef"],
  go: ["chan", "defer", "fallthrough", "func", "go", "map", "package", "range", "select", "struct"],
  java: ["boolean", "double", "final", "implements", "int", "package", "private", "protected", "public", "string", "throws"],
  kotlin: ["data", "fun", "object", "package", "val", "var"],
  php: ["echo", "namespace", "private", "protected", "public", "use"],
  python: ["and", "def", "elif", "except", "global", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "self", "with"],
  ruby: ["begin", "def", "end", "module", "nil", "require", "rescue", "unless"],
  rust: ["crate", "impl", "let", "match", "mod", "mut", "pub", "self", "trait", "use"],
  shell: ["case", "done", "elif", "esac", "fi", "then"],
  sql: ["add", "alter", "and", "as", "by", "column", "create", "delete", "drop", "from", "group", "insert", "into", "join", "not", "null", "on", "or", "order", "select", "set", "table", "update", "values", "where"],
  swift: ["associatedtype", "extension", "func", "guard", "let", "protocol", "var"],
};

function getDiffSyntaxTokens(content: string, language: string): DiffSyntaxToken[] {
  if (!content) {
    return [{ text: " " }];
  }

  const tokens: DiffSyntaxToken[] = [];
  const specialPattern = /("""(?:\\.|[\s\S])*?"""|'''(?:\\.|[\s\S])*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|--.*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = specialPattern.exec(content))) {
    if (match.index > cursor) {
      tokens.push(...tokenizePlainCode(content.slice(cursor, match.index), language));
    }

    tokens.push({
      text: match[0],
      className: isCommentToken(match[0]) ? "diff-token-comment" : "diff-token-string",
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) {
    tokens.push(...tokenizePlainCode(content.slice(cursor), language));
  }

  return tokens.length > 0 ? tokens : [{ text: content }];
}

function tokenizePlainCode(content: string, language: string): DiffSyntaxToken[] {
  const keywords = new Set([...baseSyntaxKeywords, ...(languageSyntaxKeywords[language] ?? [])].map((keyword) => keyword.toLowerCase()));
  const keywordAlternation = Array.from(keywords)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");
  const tokenPattern = new RegExp(`\\b(?:${keywordAlternation})\\b|\\b\\d+(?:\\.\\d+)?\\b|\\b[A-Z][A-Z0-9_]+\\b`, "gi");
  const tokens: DiffSyntaxToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(content))) {
    if (match.index > cursor) {
      tokens.push({ text: content.slice(cursor, match.index) });
    }

    const text = match[0];
    const lower = text.toLowerCase();
    tokens.push({
      text,
      className: keywords.has(lower)
        ? "diff-token-keyword"
        : /^\d/.test(text)
          ? "diff-token-number"
          : /^[A-Z][A-Z0-9_]+$/.test(text)
            ? "diff-token-constant"
            : undefined,
    });
    cursor = match.index + text.length;
  }

  if (cursor < content.length) {
    tokens.push({ text: content.slice(cursor) });
  }

  return tokens;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCommentToken(token: string) {
  const trimmed = token.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("--");
}

function DiffCodeLine({ line, muted = false }: { line: DiffLine; muted?: boolean }) {
  const tokens = line.highlighted ? getDiffSyntaxTokens(line.content, line.language) : [{ text: line.content || " " }];

  return (
    <span className={cn("diff-code-line", muted && "text-muted-foreground")}>
      {tokens.map((token, index) =>
        token.className ? (
          <span className={token.className} key={`${index}-${token.text}`}>
            {token.text}
          </span>
        ) : (
          <span key={`${index}-${token.text}`}>{token.text}</span>
        ),
      )}
    </span>
  );
}

function ReviewTargetInspector({
  baseComparisonOpen,
  model,
  onOpenFile,
  onToggleBaseComparison,
  onToggleReviewed,
  reviewState,
}: {
  baseComparisonOpen: boolean;
  model: ReviewTargetInspectorModel | null;
  onOpenFile: (path: string) => void;
  onToggleBaseComparison: () => void;
  onToggleReviewed: () => void;
  reviewState: ReviewTargetReviewState;
}) {
  const reviewed = reviewState === "reviewed";
  const needsReReview = reviewState === "needs-re-review";

  return (
    <section className="border-b border-border p-3" aria-label="Review Target Inspector">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <FileCode2 className="h-4 w-4" aria-hidden="true" />
          <span>Review Target</span>
        </div>
        <Badge variant={model ? "info" : "muted"}>{model ? "Selected" : "None"}</Badge>
      </div>

      {!model ? (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          Select a Review Target from the map or Review Path.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{model.target.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{model.target.paths.join(", ")}</p>
              </div>
              <Badge variant={reviewed ? "success" : needsReReview ? "warning" : model.target.priority === "high" ? "warning" : "muted"}>
                {reviewed ? "Reviewed" : needsReReview ? "Needs re-review" : model.target.priority}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Files</p>
                <p className="mt-1 font-semibold">{model.target.size.files}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Nodes</p>
                <p className="mt-1 font-semibold">{model.target.size.nodes}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Threads</p>
                <p className="mt-1 font-semibold">{model.reviewThreads.length}</p>
              </div>
            </div>
            <Button className="w-full justify-between" size="sm" variant="outline" onClick={onToggleReviewed}>
              {reviewed ? "Mark target active" : "Mark target reviewed"}
              <Kbd>Path</Kbd>
            </Button>
          </div>

          <details className="rounded-md border border-border bg-background/70 p-2" aria-label="Review Target review threads">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              <span>Review Threads</span>
              <Badge variant={model.reviewThreads.length > 0 ? "info" : "muted"}>{model.reviewThreads.length}</Badge>
            </summary>
            <div className="mt-2 space-y-2">
              {model.reviewThreads.length > 0 ? (
                <div className="space-y-2">
                  {model.reviewThreads.slice(0, 4).map((thread) => {
                    const origin = getReviewThreadOrigin(thread);
                    return (
                      <div
                        className={cn(
                          "rounded-md border border-border bg-background p-2 text-xs",
                          thread.state === "outdated" && "border-amber-500/50 bg-amber-500/10",
                        )}
                        key={thread.id}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{getThreadTitle(thread.body)}</p>
                            <p className="mt-1 truncate font-mono text-muted-foreground">
                              {thread.filePath}
                              {thread.line !== null ? `:${thread.line}` : " · file"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            <Badge variant={origin === "coderabbit" ? "warning" : "info"}>
                              {origin === "coderabbit" ? "CodeRabbit" : "Human"}
                            </Badge>
                            <Badge variant={thread.state === "outdated" ? "warning" : "muted"}>
                              {getThreadStateLabel(thread.state)}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-muted-foreground">{stripMarkdownPreview(thread.body, 160)}</p>
                      </div>
                    );
                  })}
                  {model.reviewThreads.length > 4 && (
                    <p className="text-xs text-muted-foreground">
                      {model.reviewThreads.length - 4} more Review Thread{model.reviewThreads.length - 4 === 1 ? "" : "s"} attached.
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                  No GitHub Review Threads are attached to this target.
                </p>
              )}
            </div>
          </details>

          <details className="rounded-md border border-border bg-background/70 p-2" aria-label="Review Target changed context">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              <span>Changed Context</span>
              <Badge variant={model.changedContexts.length > 0 ? "info" : "muted"}>{model.changedContexts.length}</Badge>
            </summary>
            <div className="mt-2 space-y-2">
              {model.changedContexts.length > 0 ? (
                model.changedContexts.slice(0, 3).map((context) => (
                  <div className="overflow-hidden rounded-md border border-border bg-background" key={context.id}>
                    <div className="border-b border-border px-2 py-1">
                      <p className="truncate font-mono text-xs text-muted-foreground">{context.title}</p>
                    </div>
                    <div className="diff-code-grid max-h-52 overflow-auto font-mono text-xs">
                      {context.lines.slice(0, 18).map((line, index) => (
                        <div
                          className={cn("diff-row grid grid-cols-[42px_18px_minmax(0,1fr)] border-t first:border-t-0", getDiffLineClass(line.kind))}
                          key={`${context.id}:${index}`}
                        >
                          <div className="px-1 py-1 text-right text-muted-foreground">{line.newLine ?? line.oldLine ?? ""}</div>
                          <div className="diff-marker px-1 py-1 text-center">{getDiffPrefix(line.kind)}</div>
                          <div className="diff-code-cell min-w-0 py-1 pl-2 pr-3">
                            <DiffCodeLine line={line} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                  No changed hunk context is available for this target.
                </p>
              )}
            </div>
          </details>

          <details className="rounded-md border border-border bg-background/70 p-2" aria-label="Review Target head version">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              <span>Head Version</span>
              <Badge variant={model.headContexts.length > 0 ? "info" : "muted"}>{model.headContexts.length}</Badge>
            </summary>
            <div className="mt-2 space-y-2">
              {model.headContexts.slice(0, 3).map((context) => (
                <div className="overflow-hidden rounded-md border border-border bg-background" key={context.id}>
                  <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
                    <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">{context.title}</p>
                    <Badge variant={context.source === "head-symbol" ? "success" : "warning"}>
                      {context.source === "head-symbol" ? "Head" : "Fallback"}
                    </Badge>
                  </div>
                  {context.lines.length > 0 ? (
                    <div className="max-h-52 overflow-auto font-mono text-xs">
                      {context.lines.slice(0, 24).map((line) => (
                        <div className="grid grid-cols-[42px_minmax(0,1fr)] border-t first:border-t-0" key={`${context.id}:${line.lineNumber}`}>
                          <div className="bg-muted/60 px-1 py-1 text-right text-muted-foreground">{line.lineNumber}</div>
                          <pre className="min-w-0 overflow-x-auto px-2 py-1 text-foreground">{line.content || " "}</pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="p-2 text-xs text-muted-foreground">{context.message}</p>
                  )}
                </div>
              ))}
            </div>
          </details>

          <div className="space-y-2">
            <Button className="w-full justify-between" size="sm" variant="outline" onClick={onToggleBaseComparison}>
              {baseComparisonOpen ? "Hide base comparison" : "Show base comparison"}
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            {baseComparisonOpen && (
              <div className="space-y-2" aria-label="Review Target base comparison">
                {model.baseComparisons.length > 0 ? (
                  model.baseComparisons.slice(0, 3).map((comparison) => (
                    <div className="overflow-hidden rounded-md border border-border bg-background" key={comparison.id}>
                      <p className="truncate border-b border-border px-2 py-1 font-mono text-xs text-muted-foreground">{comparison.title}</p>
                      <div className="diff-code-grid max-h-48 overflow-auto font-mono text-xs">
                        {comparison.lines.slice(0, 18).map((line, index) => (
                          <div
                            className={cn("diff-row grid grid-cols-[42px_18px_minmax(0,1fr)] border-t first:border-t-0", getDiffLineClass(line.kind))}
                            key={`${comparison.id}:${index}`}
                          >
                            <div className="px-1 py-1 text-right text-muted-foreground">{line.oldLine ?? line.newLine ?? ""}</div>
                            <div className="diff-marker px-1 py-1 text-center">{getDiffPrefix(line.kind)}</div>
                            <div className="diff-code-cell min-w-0 py-1 pl-2 pr-3">
                              <DiffCodeLine line={line} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                    No base-side comparison is available.
                  </p>
                )}
              </div>
            )}
          </div>

          <details className="rounded-md border border-border bg-background/70 p-2" aria-label="Review Target related context">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              <span>Related Context</span>
              <Badge variant={model.relatedEdges.length + model.relatedTests.length > 0 ? "info" : "muted"}>
                {model.relatedEdges.length + model.relatedTests.length}
              </Badge>
            </summary>
            <div className="mt-2 space-y-2">
              <div className="rounded-md border border-border p-2 text-xs">
                <p className="font-medium">Context nodes</p>
                <div className="mt-1 space-y-1 text-muted-foreground">
                  {[...model.nodes, ...model.relatedNodes].slice(0, 6).map((node) => (
                    <button
                      className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-accent"
                      key={node.id}
                      onClick={() => onOpenFile(node.filePath)}
                      type="button"
                    >
                      {node.label} · {node.filePath}
                    </button>
                  ))}
                  {model.nodes.length + model.relatedNodes.length === 0 && <p>No related nodes.</p>}
                </div>
              </div>
              <div className="rounded-md border border-border p-2 text-xs">
                <p className="font-medium">Edges</p>
                <div className="mt-1 space-y-1 text-muted-foreground">
                  {model.relatedEdges.slice(0, 5).map((edge) => (
                    <p key={edge.id}>{edge.reason}</p>
                  ))}
                  {model.relatedEdges.length === 0 && <p>No related edges.</p>}
                </div>
              </div>
              <div className="rounded-md border border-border p-2 text-xs">
                <p className="font-medium">Tests</p>
                <div className="mt-1 space-y-1 text-muted-foreground">
                  {model.relatedTests.map((edge) => (
                    <p key={edge.id}>{edge.reason}</p>
                  ))}
                  {model.relatedTests.length === 0 && <p>No related tests.</p>}
                </div>
              </div>
              <div className="rounded-md border border-border p-2 text-xs">
                <p className="font-medium">Reasons</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  {model.reasons.slice(0, 6).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function StartReviewThreadPanel({
  body,
  fileAnchor,
  fileDisabledReason,
  lineAnchors,
  lineDisabledReason,
  mode,
  onBodyChange,
  onMarkOriginReviewed,
  onModeChange,
  onSelectLineAnchor,
  onStartFileThread,
  onStartLineThread,
  result,
  selectedLineAnchorId,
  targetTitle,
  threadActionBusy,
  canMarkOriginReviewed,
}: {
  body: string;
  fileAnchor: ReviewThreadFileAnchor | null;
  fileDisabledReason: string | null;
  lineAnchors: ReviewThreadLineAnchor[];
  lineDisabledReason: string | null;
  mode: "line" | "file";
  onBodyChange: (body: string) => void;
  onMarkOriginReviewed: () => void;
  onModeChange: (mode: "line" | "file") => void;
  onSelectLineAnchor: (anchorId: string) => void;
  onStartFileThread: () => void;
  onStartLineThread: () => void;
  result: ThreadActionResult | null;
  selectedLineAnchorId: string;
  targetTitle: string | null;
  threadActionBusy: ThreadWriteAction | null;
  canMarkOriginReviewed: boolean;
}) {
  const activeDisabledReason = mode === "line" ? lineDisabledReason : fileDisabledReason;
  const activeBusy = mode === "line" ? threadActionBusy === "create-line" : threadActionBusy === "create-file";
  const bodyMissing = body.trim().length === 0;
  const canStart =
    !activeDisabledReason &&
    !bodyMissing &&
    threadActionBusy === null &&
    (mode === "line" ? lineAnchors.length > 0 : Boolean(fileAnchor));

  return (
    <div className="space-y-3 border-b border-border p-3" aria-label="Start Review Thread">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Start Review Thread</span>
        </div>
        <Badge variant={targetTitle ? "info" : "muted"}>{targetTitle ? "Target" : "None"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="Review Thread anchor type">
        <button
          aria-selected={mode === "line"}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium",
            mode === "line" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onModeChange("line")}
          role="tab"
          type="button"
        >
          Line
        </button>
        <button
          aria-selected={mode === "file"}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium",
            mode === "file" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onModeChange("file")}
          role="tab"
          type="button"
        >
          File
        </button>
      </div>

      {mode === "line" ? (
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Changed line anchor</span>
          <select
            aria-label="Changed line anchor"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={Boolean(lineDisabledReason) || threadActionBusy !== null}
            onChange={(event) => onSelectLineAnchor(event.target.value)}
            value={selectedLineAnchorId}
          >
            {lineAnchors.map((anchor) => (
              <option key={anchor.id} value={anchor.id}>
                {anchor.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="rounded-md border border-border p-2 text-xs">
          <p className="font-medium text-muted-foreground">File anchor</p>
          <p className="mt-1 truncate font-mono">{fileAnchor?.path ?? "Unavailable"}</p>
        </div>
      )}

      {activeDisabledReason && (
        <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300" role="status">
          {activeDisabledReason}
        </p>
      )}

      <textarea
        aria-label="New Review Thread body"
        className="min-h-20 w-full resize-none rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={Boolean(activeDisabledReason) || threadActionBusy !== null}
        onChange={(event) => onBodyChange(event.target.value)}
        placeholder="Write Review Thread feedback"
        value={body}
      />
      <Button
        className="w-full justify-between"
        disabled={!canStart}
        onClick={mode === "line" ? onStartLineThread : onStartFileThread}
        title={activeDisabledReason ?? (bodyMissing ? "Review Thread body is required." : undefined)}
      >
        {activeBusy ? "Publishing..." : mode === "line" ? "Start line thread" : "Start file thread"}
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>

      {result && (
        <div
          className={cn(
            "space-y-2 rounded-md p-2 text-xs",
            result.ok
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : result.retryable
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          <p>{result.message}</p>
          {result.ok && canMarkOriginReviewed && (
            <Button size="sm" variant="outline" onClick={onMarkOriginReviewed}>
              Mark originating target reviewed
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function InlineReviewThread({
  anchorRef,
  canResolve,
  onResolveState,
  onSelect,
  onToggleReviewed,
  pathCount,
  pathIndex,
  resolveBusy,
  stateLabel,
  view,
}: {
  anchorRef?: Ref<HTMLDivElement>;
  canResolve: boolean;
  onResolveState: (view: ReviewThreadView) => void;
  onSelect: (view: ReviewThreadView) => void;
  onToggleReviewed: (view: ReviewThreadView) => void;
  pathCount: number;
  pathIndex: number;
  resolveBusy: boolean;
  stateLabel: string;
  view: ReviewThreadView;
}) {
  const resolveLabel = view.thread.state === "resolved" ? "Unresolve" : "Resolve";

  return (
    <div
      aria-label="Inline review thread"
      className="diff-inline-thread"
      onClick={() => onSelect(view)}
      ref={anchorRef}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Review Thread {pathIndex} of {pathCount}
            {view.thread.line !== null ? ` · line ${view.thread.line}` : ""}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            @{view.thread.authorLogin ?? "unknown"} on {view.thread.filePath}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={view.origin === "coderabbit" ? "warning" : "info"}>{view.origin === "coderabbit" ? "CodeRabbit" : "Human"}</Badge>
          <Badge variant={view.thread.state === "outdated" ? "warning" : "muted"}>{stateLabel}</Badge>
          {view.reviewed && <Badge variant="success">Reviewed</Badge>}
        </div>
      </div>
      <ReviewThreadConversation thread={view.thread} emptyFallback="No review comment body was returned by GitHub." />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={(event) => {
            event.stopPropagation();
            onToggleReviewed(view);
          }}
          size="sm"
          type="button"
          variant={view.reviewed ? "secondary" : "outline"}
        >
          {view.reviewed ? "Mark unreviewed" : "Mark reviewed"}
        </Button>
        <Button
          disabled={!canResolve || resolveBusy || view.thread.state === "outdated"}
          onClick={(event) => {
            event.stopPropagation();
            onResolveState(view);
          }}
          size="sm"
          title={view.thread.state === "outdated" ? "Outdated GitHub threads cannot be resolved from the current diff." : undefined}
          type="button"
          variant="outline"
        >
          {resolveLabel}
        </Button>
      </div>
    </div>
  );
}

function ReviewThreadConversation({
  emptyFallback,
  thread,
}: {
  emptyFallback: string;
  thread: CachedReviewThread | null;
}) {
  if (!thread) {
    return <p className="text-sm text-muted-foreground">{emptyFallback}</p>;
  }

  const comments = getThreadComments(thread);
  const [initialComment, ...replies] = comments;
  const initialCommentTime = formatThreadCommentTime(initialComment.updatedAt);

  return (
    <div className="space-y-3 font-sans text-sm">
      <article>
        <p className="mb-2 text-xs text-muted-foreground">
          @{initialComment.authorLogin ?? "unknown"} commented{initialCommentTime ? ` ${initialCommentTime}` : ""}
        </p>
        <MarkdownContent
          value={initialComment.body}
          emptyFallback={<p className="text-sm text-muted-foreground">{emptyFallback}</p>}
        />
      </article>
      {replies.length > 0 && (
        <div className="space-y-3 border-t border-border pt-3" aria-label="Review thread replies">
          {replies.map((reply) => {
            const replyTime = formatThreadCommentTime(reply.updatedAt);

            return (
              <article className="border-l border-border pl-3" key={reply.id}>
                <p className="mb-2 text-xs text-muted-foreground">
                  @{reply.authorLogin ?? "unknown"} replied{replyTime ? ` ${replyTime}` : ""}
                </p>
                <MarkdownContent
                  value={reply.body}
                  emptyFallback={<p className="text-sm text-muted-foreground">Reply body was not returned by GitHub.</p>}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function stripMarkdownPreview(value: string, maxLength = 140) {
  const stripped = value
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<\/?(details|summary|br|p|div|span|strong|em|ul|ol|li|code|pre|blockquote|h[1-6])[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s>*_-]*[-+*]\s+/gm, "")
    .replace(/[*_~>#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length <= maxLength) {
    return stripped;
  }

  return `${stripped.slice(0, maxLength - 1).trim()}…`;
}

function getPullRequestSummaryPreview(value: string) {
  const withoutLeadHeading = value.replace(/^\s{0,3}#{1,6}\s+(summary|overview|description)\s*\n+/i, "");
  return stripMarkdownPreview(withoutLeadHeading, 120);
}

function getThreadTitle(body: string) {
  return stripMarkdownPreview(body, 96) || "Review thread";
}

function getThreadComments(thread: CachedReviewThread): CachedReviewThreadComment[] {
  if (thread.comments && thread.comments.length > 0) {
    return thread.comments;
  }

  return [
    {
      id: `${thread.id}:initial`,
      authorLogin: thread.authorLogin,
      body: thread.body,
      updatedAt: thread.updatedAt,
      url: null,
    },
  ];
}

function formatThreadCommentTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function filtersMatch(left: ReviewQueueFilters, right: ReviewQueueFilters) {
  return left.origin === right.origin && left.reviewed === right.reviewed && left.state === right.state;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function getNumericShortcutIndex(key: string) {
  if (key === "0") {
    return 9;
  }

  if (/^[1-9]$/.test(key)) {
    return Number(key) - 1;
  }

  return null;
}

function commandMatchesQuery(command: CommandPaletteItem, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    command.category,
    command.label,
    command.description,
    command.shortcut,
    command.disabledReason,
    ...(command.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
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

  if (normalizedCached) {
    return normalizedCached;
  }

  if (pullRequest.repository === fallbackPullRequest.repository && pullRequest.number === fallbackPullRequest.number) {
    return createDemoOverviewCache(pullRequest, cached);
  }

  return {
    pullRequest,
    metadata: {
      title: pullRequest.title,
      description: null,
      repository: pullRequest.repository,
      number: pullRequest.number,
      authorLogin: pullRequest.authorLogin,
      baseBranch: null,
      headBranch: null,
      mergeable: null,
      mergeStateStatus: null,
      reviewDecision: null,
      url: pullRequest.url,
      isDraft: pullRequest.isDraft,
      updatedAt: pullRequest.updatedAt,
    },
    reviewThreads: [],
    fileSummaries: [],
    checks: [],
    rateLimit: {
      remaining: null,
      resetEpochSeconds: null,
    },
    fetchedAtEpochMs: Date.now(),
    lastAccessedEpochMs: Date.now(),
    pinned: cached?.pinned ?? false,
  };
}

function createDemoOverviewCache(pullRequest: PullRequestSummary, cached?: CachedPullRequestData): CachedPullRequestData {
  return {
    pullRequest,
    metadata: {
      title: pullRequest.title,
      description:
        "## Summary\n\nRemote-first PR review workspace shell with deterministic overview signals.\n\n- Shows **high-level review state** before the diff.\n- Keeps GitHub-provided Pull Request context local and markdown-rendered.\n\nThe reviewer should be able to read the whole Pull Request summary before deciding which thread or file deserves attention.",
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
    fileSummaries: fallbackFileSummaries,
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
  updaterClient,
}: AppProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [pullRequestDialogOpen, setPullRequestDialogOpen] = useState(false);
  const [pullRequestDialogQuery, setPullRequestDialogQuery] = useState("");
  const [threadDialogOpen, setThreadDialogOpen] = useState(false);
  const [threadDialogQuery, setThreadDialogQuery] = useState("");
  const [reviewThreadDialogOpen, setReviewThreadDialogOpen] = useState(false);
  const [startReviewThreadDialogOpen, setStartReviewThreadDialogOpen] = useState(false);
  const [targetDiffDialogOpen, setTargetDiffDialogOpen] = useState(false);
  const [hotspotsDialogOpen, setHotspotsDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession>(checkingSession);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [oauthFlow, setOauthFlow] = useState<OAuthStartResponse | null>(null);
  const [oauthCopyMessage, setOauthCopyMessage] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<WorkspaceRepository[]>([]);
  const [repositoryInput, setRepositoryInput] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [reviewCloneStatuses, setReviewCloneStatuses] = useState<Record<string, ReviewCloneStatus>>({});
  const [reviewCloneBusyKey, setReviewCloneBusyKey] = useState<string | null>(null);
  const [reviewCloneMessage, setReviewCloneMessage] = useState<string | null>(null);
  const [analysisInputStatuses, setAnalysisInputStatuses] = useState<Record<string, PullRequestAnalysisInput>>({});
  const [analysisInputBusyKey, setAnalysisInputBusyKey] = useState<string | null>(null);
  const [analysisFileContents, setAnalysisFileContents] = useState<Record<string, PullRequestAnalysisFilesResponse>>({});
  const [analysisFileContentBusyKey, setAnalysisFileContentBusyKey] = useState<string | null>(null);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [quickOpenedPullRequest, setQuickOpenedPullRequest] = useState<PullRequestSummary | null>(null);
  const [quickOpenInput, setQuickOpenInput] = useState("");
  const [quickOpenError, setQuickOpenError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [selectedPullRequestKey, setSelectedPullRequestKey] = useState<string | null>(null);
  const [selectedReviewThreadId, setSelectedReviewThreadId] = useState<string | null>(null);
  const [selectedReviewTargetId, setSelectedReviewTargetId] = useState<string | null>(null);
  const [targetBaseComparisonOpen, setTargetBaseComparisonOpen] = useState(false);
  const [reviewTargetRevision, setReviewTargetRevision] = useState(0);
  const [reviewQueueFilters, setReviewQueueFilters] = useState<ReviewQueueFilters>(defaultReviewQueueFilters);
  const [reviewQueueRevision, setReviewQueueRevision] = useState(0);
  const [fileChangeFilters, setFileChangeFilters] = useState<FileChangeFilters>(defaultFileChangeFilters);
  const [fileChangeRevision, setFileChangeRevision] = useState(0);
  const [selectedFileChangeId, setSelectedFileChangeId] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>(readDiffModePreference);
  const [loadedDiffHunks, setLoadedDiffHunks] = useState<Record<string, string[]>>({});
  const [expandedDiffHunks, setExpandedDiffHunks] = useState<Record<string, string[]>>({});
  const [fullFileDiffs, setFullFileDiffs] = useState<Record<string, boolean>>({});
  const [handoffPacketMode, setHandoffPacketMode] = useState<HandoffPacketMode>("selected-review-threads");
  const [humanPacketIncludeCodeRabbit, setHumanPacketIncludeCodeRabbit] = useState(false);
  const [handoffIntentPreset, setHandoffIntentPreset] = useState("Fix selected feedback");
  const [handoffCustomIntent, setHandoffCustomIntent] = useState("");
  const [handoffCopyMessage, setHandoffCopyMessage] = useState<string | null>(null);
  const [threadStateOverrides, setThreadStateOverrides] = useState<Record<string, CachedReviewThread["state"]>>({});
  const [replyDraft, setReplyDraft] = useState("");
  const [newThreadMode, setNewThreadMode] = useState<"line" | "file">("line");
  const [newThreadBody, setNewThreadBody] = useState("");
  const [selectedNewThreadLineAnchorId, setSelectedNewThreadLineAnchorId] = useState("");
  const [inlineCommentAnchorId, setInlineCommentAnchorId] = useState<string | null>(null);
  const [hoveredDiffLineAnchorId, setHoveredDiffLineAnchorId] = useState<string | null>(null);
  const [newThreadResult, setNewThreadResult] = useState<ThreadActionResult | null>(null);
  const [newThreadOriginTargetId, setNewThreadOriginTargetId] = useState<string | null>(null);
  const [threadActionBusy, setThreadActionBusy] = useState<ThreadWriteAction | null>(null);
  const [threadActionResult, setThreadActionResult] = useState<ThreadActionResult | null>(null);
  const [optimisticCreatedReviewThreads, setOptimisticCreatedReviewThreads] = useState<CachedReviewThread[]>([]);
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
  const [pullRequestDataStatus, setPullRequestDataStatus] = useState<{ key: string | null; state: "idle" | "loading" | "loaded" | "failed"; message: string | null }>({
    key: null,
    state: "idle",
    message: null,
  });
  const [checkRefreshStatus, setCheckRefreshStatus] = useState<{ key: string | null; state: "idle" | "loading" | "loaded" | "failed"; message: string | null }>({
    key: null,
    state: "idle",
    message: null,
  });
  const pullRequestDataInFlightKeyRef = useRef<string | null>(null);
  const checkRefreshInFlightKeyRef = useRef<string | null>(null);
  const reviewCanvasScrollRef = useRef<HTMLDivElement | null>(null);
  const activeInlineThreadRef = useRef<HTMLDivElement | null>(null);
  const inlineCommentBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<DiagnosticsPreview | null>(null);
  const [diagnosticsCopyMessage, setDiagnosticsCopyMessage] = useState<string | null>(null);
  const [resetHistoryConfirmOpen, setResetHistoryConfirmOpen] = useState(false);
  const updater = useAppUpdater({ client: updaterClient });
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
  const normalizedPullRequestDialogQuery = pullRequestDialogQuery.trim().toLowerCase();
  const pullRequestDialogPullRequests = normalizedPullRequestDialogQuery
    ? routedPullRequests.filter((pullRequest) => {
        const haystack = [
          pullRequest.title,
          pullRequest.repository,
          String(pullRequest.number),
          pullRequest.authorLogin ?? "",
          pullRequest.isDraft ? "draft" : "open",
        ]
          .join(" ")
          .toLowerCase();

        return normalizedPullRequestDialogQuery.split(/\s+/).every((term) => haystack.includes(term));
      })
    : routedPullRequests;
  const selectedPullRequest =
    routedPullRequests.find((pullRequest) => getPullRequestKey(pullRequest) === selectedPullRequestKey) ??
    routedPullRequests[0] ??
    fallbackPullRequest;
  const selectedPullRequestReviewKey = getPullRequestKey(selectedPullRequest);
  const selectedRepositoryKey = selectedPullRequest.repository.toLowerCase();
  const reviewCloneRepositorySlugs = useMemo(
    () => Array.from(new Set([...repositories.map((repository) => repository.slug), selectedPullRequest.repository])).sort(),
    [repositories, selectedPullRequest.repository],
  );
  const selectedReviewCloneStatus =
    reviewCloneStatuses[selectedRepositoryKey] ??
    createUnavailableReviewCloneStatus(
      selectedPullRequest.repository,
      "Review Clone status has not been checked yet.",
    );
  const selectedReviewCloneBusy = reviewCloneBusyKey === selectedRepositoryKey || selectedReviewCloneStatus.state === "cloning";
  const reviewCloneBadge = getReviewCloneBadge(selectedReviewCloneStatus.state);
  const reviewCloneWriteBadge = selectedReviewCloneStatus.writePermission
    ? ({ label: "GitHub writes available", variant: "success" as const })
    : ({ label: "Read-Only Mode", variant: "warning" as const });
  const customThreadActionClient = threadActionClient !== tauriThreadActionClient;
  const canPublishReviewThreads = selectedReviewCloneStatus.writePermission || customThreadActionClient;
  const reviewThreadWriteDisabledReason = canPublishReviewThreads
    ? null
    : "Read-Only Mode: GitHub write access is needed to publish line-level and file-level Review Threads. Inspection, Attention Map navigation, and local Reviewed state still work.";
  const selectedPullRequestDisplay = `${selectedPullRequest.repository} #${selectedPullRequest.number}`;
  const selectedPullRequestTitle = selectedPullRequest.title.trim() || "Untitled Pull Request";
  const activePullRequestKey = routedPullRequests.length > 0 ? getPullRequestKey(selectedPullRequest) : null;
  const selectedAnalysisInputStatus =
    activePullRequestKey && analysisInputStatuses[activePullRequestKey]
      ? analysisInputStatuses[activePullRequestKey]
      : createUnavailablePullRequestAnalysisInput(
          selectedPullRequest,
          "Pull Request head has not been prepared in the Review Clone yet.",
        );
  const selectedAnalysisInputBusy = activePullRequestKey !== null && analysisInputBusyKey === activePullRequestKey;
  const analysisInputBadge = getAnalysisInputBadge(
    selectedAnalysisInputBusy ? "preparing" : selectedAnalysisInputStatus.state,
  );
  const cacheStore = useMemo(() => readCacheStore(), [cacheSummary]);
  const selectedCacheEntry = activePullRequestKey ? cacheStore.entries[activePullRequestKey] : null;
  const selectedPullRequestPinned = selectedCacheEntry?.pinned ?? false;
  const selectedPullRequestLoadingData =
    activePullRequestKey !== null &&
    pullRequestDataStatus.key === activePullRequestKey &&
    pullRequestDataStatus.state === "loading";
  const reviewOverviewCache = useMemo(
    () => createOverviewCache(selectedPullRequest, selectedCacheEntry ?? undefined),
    [selectedCacheEntry, selectedPullRequest],
  );
  const effectiveReviewThreads = useMemo(() => {
    const threadsById = new Map<string, CachedReviewThread>();
    for (const thread of reviewOverviewCache.reviewThreads) {
      threadsById.set(thread.id, thread);
    }
    for (const thread of optimisticCreatedReviewThreads) {
      threadsById.set(thread.id, thread);
    }

    return [...threadsById.values()];
  }, [optimisticCreatedReviewThreads, reviewOverviewCache.reviewThreads]);
  const selectedAnalysisFileContents = activePullRequestKey ? analysisFileContents[activePullRequestKey] : null;
  const analysisIndex: AnalysisIndex = useMemo(
    () =>
      buildOrReuseAnalysisIndex({
        pullRequest: selectedPullRequest,
        files: reviewOverviewCache.fileSummaries,
        analysisInput: selectedAnalysisInputStatus,
        fileContents: selectedAnalysisFileContents?.files ?? [],
      }),
    [reviewOverviewCache.fileSummaries, selectedAnalysisFileContents, selectedAnalysisInputStatus, selectedPullRequest],
  );
  const attentionMapPresentation = useMemo(
    () => buildAttentionMapPresentation(analysisIndex, reviewOverviewCache),
    [analysisIndex, reviewOverviewCache],
  );
  useEffect(() => {
    if (analysisIndex.headSha !== "head-unavailable") {
      writeAnalysisIndex(analysisIndex);
    }
  }, [analysisIndex]);
  const rateLimitMessage =
    reviewOverviewCache.rateLimit.remaining === 0
      ? `GitHub rate limit reached${reviewOverviewCache.rateLimit.resetEpochSeconds ? ` until ${reviewOverviewCache.rateLimit.resetEpochSeconds}` : ""}. Cached partial data stays visible.`
      : null;
  const reviewOverview = useMemo(
    () =>
      buildReviewOverview(
        reviewOverviewCache,
        repositoryHotspotOverrides[selectedPullRequest.repository],
        analysisIndex,
      ),
    [analysisIndex, reviewOverviewCache, repositoryHotspotOverrides, selectedPullRequest.repository],
  );
  const reviewTargets = useMemo(
    () =>
      buildReviewTargets({
        analysisIndex,
        attentionMap: attentionMapPresentation,
        currentData: reviewOverviewCache,
        hotspots: reviewOverview.hotspots,
      }),
    [analysisIndex, attentionMapPresentation, reviewOverview.hotspots, reviewOverviewCache],
  );
  const reviewTargetStore = useMemo(() => readReviewTargetStateStore(), [reviewTargetRevision]);
  const reviewTargetReviewStates = useMemo(
    () => buildReviewTargetReviewStates(currentUserKey, reviewTargets, reviewTargetStore),
    [currentUserKey, reviewTargetStore, reviewTargets],
  );
  const reviewedTargetIds = useMemo(
    () => buildReviewedTargetIdSet(currentUserKey, reviewTargets, reviewTargetStore),
    [currentUserKey, reviewTargetStore, reviewTargets],
  );
  const needsReReviewTargetIds = useMemo(
    () => buildNeedsReReviewTargetIdSet(currentUserKey, reviewTargets, reviewTargetStore),
    [currentUserKey, reviewTargetStore, reviewTargets],
  );
  const reviewPathItems = useMemo(
    () => buildReviewPathItems(reviewTargets, reviewOverview.hotspots),
    [reviewOverview.hotspots, reviewTargets],
  );
  const selectedReviewPathItem = reviewPathItems.find((item) => item.id === selectedReviewTargetId) ?? null;
  const selectedReviewTargetInspector = useMemo(
    () =>
      buildReviewTargetInspectorModel({
        target: selectedReviewPathItem?.target ?? null,
        analysisIndex,
        pullRequest: selectedPullRequest,
        files: reviewOverviewCache.fileSummaries,
        fileContents: selectedAnalysisFileContents?.files ?? [],
        reviewThreads: effectiveReviewThreads,
      }),
    [
      analysisIndex,
      effectiveReviewThreads,
      reviewOverviewCache.fileSummaries,
      selectedAnalysisFileContents,
      selectedPullRequest,
      selectedReviewPathItem,
    ],
  );
  const lineThreadAnchorState = useMemo(
    () => getReviewThreadLineAnchorState(selectedReviewTargetInspector),
    [selectedReviewTargetInspector],
  );
  const fileThreadAnchorState = useMemo(
    () => getReviewThreadFileAnchorState(selectedReviewTargetInspector),
    [selectedReviewTargetInspector],
  );
  const selectedNewThreadLineAnchor =
    lineThreadAnchorState.anchors.find((anchor) => anchor.id === selectedNewThreadLineAnchorId) ??
    lineThreadAnchorState.anchors[0] ??
    null;
  const lineThreadDisabledReason = reviewThreadWriteDisabledReason ?? lineThreadAnchorState.disabled?.reason ?? null;
  const fileThreadDisabledReason = reviewThreadWriteDisabledReason ?? fileThreadAnchorState.disabled?.reason ?? null;
  const activeReviewPathItems = reviewPathItems.filter((item) => !reviewedTargetIds.has(item.id));
  const reviewedReviewPathItems = reviewPathItems.filter((item) => reviewedTargetIds.has(item.id));
  const readinessBadge = getReadinessBadge(reviewOverview.readiness.state);
  const selectedPullRequestRefreshingChecks =
    activePullRequestKey !== null &&
    checkRefreshStatus.key === activePullRequestKey &&
    checkRefreshStatus.state === "loading";
  const liveChecksBadge = getLiveChecksBadge(reviewOverview.checks, selectedPullRequestRefreshingChecks);
  const liveChecksCanRefresh = Boolean(activePullRequestKey) && authSession.state === "signed-in" && !selectedPullRequestRefreshingChecks;
  const liveChecksRefreshDisabledReason = !activePullRequestKey
    ? "Open a Pull Request first."
    : authSession.state !== "signed-in"
      ? "Sign in to refresh GitHub checks."
      : null;
  const reviewThreadSignature = effectiveReviewThreads
    .map((thread) => `${thread.id}:${thread.state}:${thread.updatedAt}`)
    .join("|");
  const fileChangeSignature = reviewOverviewCache.fileSummaries
    .map((file) => `${file.path}:${file.status}:${file.additions}:${file.deletions}`)
    .join("|");
  const reviewQueueStore = useMemo(() => readReviewQueueStore(), [reviewQueueRevision]);
  const fileChangeStore = useMemo(() => readFileChangeStore(), [fileChangeRevision]);
  const reviewQueueDiagnostics = summarizeReviewQueueStore(reviewQueueStore);
  const fileChangeDiagnostics = summarizeFileChangeStore(fileChangeStore);
  const reviewSessionDiagnostics = summarizeReviewSessionStore(readReviewSessionStore());
  const diagnosticsPreviewText = diagnosticsPreview ? renderDiagnosticsExport(diagnosticsPreview) : "";
  const updaterBadge = updater.error
    ? { label: "Check failed", variant: "warning" as const }
    : updater.isUpdating
      ? { label: "Updating", variant: "info" as const }
      : updater.updateInfo
        ? { label: `v${updater.updateInfo.version}`, variant: "info" as const }
        : { label: "Ready", variant: "success" as const };
  const baseReviewThreadViews = buildReviewThreadViews(
    currentUserKey,
    selectedPullRequestReviewKey,
    effectiveReviewThreads,
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
  const reviewWorkProgress = buildReviewWorkProgress(reviewPathItems, reviewedTargetIds, reviewThreadViews);
  const reviewPathItemSignature = reviewPathItems.map((item) => item.id).join("|");
  const activeReviewPathItemSignature = activeReviewPathItems.map((item) => item.id).join("|");
  const reviewTargetSyncSignature = reviewTargets
    .map((target) => `${target.id}:${target.stableKey}:${target.paths.join(",")}`)
    .join("|");
  const filteredReviewThreads = filterReviewThreads(reviewThreadViews, reviewQueueFilters);
  const normalizedThreadDialogQuery = threadDialogQuery.trim().toLowerCase();
  const threadDialogSourceViews = filteredReviewThreads;
  const threadDialogViews = normalizedThreadDialogQuery
    ? threadDialogSourceViews.filter((view) => {
        const haystack = [
          getThreadTitle(view.thread.body),
          stripMarkdownPreview(view.thread.body, 240),
          ...getThreadComments(view.thread).map((comment) => stripMarkdownPreview(comment.body, 240)),
          view.thread.filePath,
          view.thread.authorLogin ?? "",
          view.thread.state,
          view.origin,
          view.reviewed ? "reviewed" : "unreviewed",
          view.thread.line !== null ? `line ${view.thread.line}` : "",
        ]
          .join(" ")
          .toLowerCase();

        return normalizedThreadDialogQuery.split(/\s+/).every((term) => haystack.includes(term));
      })
    : threadDialogSourceViews;

  useEffect(() => {
    setOptimisticCreatedReviewThreads([]);
  }, [selectedPullRequestReviewKey]);

  useEffect(() => {
    syncReviewTargets(currentUserKey, selectedPullRequestReviewKey, reviewTargets);
    setReviewTargetRevision((current) => current + 1);
  }, [currentUserKey, reviewTargetSyncSignature, selectedPullRequestReviewKey]);

  useEffect(() => {
    if (reviewPathItems.length === 0) {
      if (selectedReviewTargetId !== null) {
        setSelectedReviewTargetId(null);
      }
      return;
    }

    if (selectedReviewTargetId && reviewPathItems.some((item) => item.id === selectedReviewTargetId)) {
      return;
    }

    setSelectedReviewTargetId(activeReviewPathItems[0]?.id ?? reviewPathItems[0].id);
  }, [activeReviewPathItemSignature, reviewPathItemSignature, reviewPathItems, selectedReviewTargetId]);

  useEffect(() => {
    setTargetBaseComparisonOpen(false);
    setNewThreadBody("");
    setNewThreadResult(null);
    setNewThreadOriginTargetId(null);
    setInlineCommentAnchorId(null);
    setHoveredDiffLineAnchorId(null);
  }, [selectedReviewTargetId]);

  useEffect(() => {
    if (lineThreadAnchorState.anchors.length === 0) {
      if (selectedNewThreadLineAnchorId) {
        setSelectedNewThreadLineAnchorId("");
      }
      return;
    }

    if (lineThreadAnchorState.anchors.some((anchor) => anchor.id === selectedNewThreadLineAnchorId)) {
      return;
    }

    setSelectedNewThreadLineAnchorId(lineThreadAnchorState.anchors[0].id);
  }, [lineThreadAnchorState.anchors, selectedNewThreadLineAnchorId]);

  const reviewQueueCounts = buildReviewQueueCounts(reviewThreadViews);
  const fileChangeViews = buildFileChangeViews(
    currentUserKey,
    getPullRequestKey(selectedPullRequest),
    reviewOverviewCache.fileSummaries,
    fileChangeStore,
  );
  const filteredFileChanges = filterFileChanges(fileChangeViews, fileChangeFilters);
  const reviewThreadWindow = getBoundedRenderWindow(filteredReviewThreads, { limit: reviewThreadRenderLimit });
  const renderedReviewThreads = reviewThreadWindow.items;
  const fileChangeCounts = buildFileChangeCounts(fileChangeViews);
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
    renderedReviewThreads.length > 0 && renderedReviewThreads.every((view) => selectedBulkThreadSet.has(view.id));
  const selectedReviewThreadIndex = selectedReviewThread
    ? Math.max(filteredReviewThreads.findIndex((view) => view.id === selectedReviewThread.id), 0)
    : 0;
  const activeThread = selectedReviewThread?.thread ?? null;
  const activeThreadFileHint = activeThread?.filePath ?? null;
  const selectedFileChange =
    fileChangeViews.find((view) => view.id === selectedFileChangeId) ??
    (activeThreadFileHint ? fileChangeViews.find((view) => view.file.path === activeThreadFileHint) : null) ??
    fileChangeViews[0] ??
    null;
  const activeThreadAuthor = activeThread?.authorLogin ?? null;
  const activeThreadFile = activeThread?.filePath ?? selectedFileChange?.file.path ?? "No file selected";
  const activeThreadLine = activeThread?.line ?? null;
  const activeThreadState = activeThread?.state ?? "unresolved";
  const activeThreadStateLabel = activeThread ? getThreadStateLabel(activeThread.state) : "No thread";
  const activeThreadBody = activeThread?.body ?? "No GitHub review thread is selected for this Pull Request.";
  const threadResolveAction: ThreadWriteAction = activeThreadState === "resolved" ? "unresolve" : "resolve";
  const replyCanSubmit =
    Boolean(selectedReviewThread) && canPublishReviewThreads && threadActionBusy === null && replyDraft.trim().length > 0;
  const selectedFileDiffState = selectedFileChange
    ? buildLazyDiffState(selectedFileChange.file, {
        mode: diffMode,
        repository: selectedPullRequest.repository,
        pullRequestNumber: selectedPullRequest.number,
        loadedHunkIds: loadedDiffHunks[selectedFileChange.id],
        expandedHunkIds: expandedDiffHunks[selectedFileChange.id],
        fullFileLoaded: fullFileDiffs[selectedFileChange.id],
      })
    : null;
  const diffDialogLineAnchors = selectedFileDiffState
    ? lineThreadAnchorState.anchors.filter((anchor) => anchor.path === selectedFileDiffState.filePath)
    : lineThreadAnchorState.anchors;
  const selectedDiffDialogLineAnchor =
    diffDialogLineAnchors.find((anchor) => anchor.id === selectedNewThreadLineAnchorId) ?? diffDialogLineAnchors[0] ?? null;
  const hoveredDiffDialogLineAnchor =
    diffDialogLineAnchors.find((anchor) => anchor.id === hoveredDiffLineAnchorId) ?? null;
  const diffDialogLineAnchorSignature = diffDialogLineAnchors.map((anchor) => anchor.id).join("|");
  const diffDialogThreadsByLineKey = useMemo(() => {
    const threadsByLineKey = new Map<string, ReviewThreadView[]>();
    if (!selectedFileDiffState) {
      return threadsByLineKey;
    }

    for (const view of reviewThreadViews) {
      if (view.thread.filePath !== selectedFileDiffState.filePath) {
        continue;
      }

      const lineKey = getDiffThreadAnchorKey(selectedFileDiffState, view.thread);
      if (!lineKey) {
        continue;
      }

      threadsByLineKey.set(lineKey, [...(threadsByLineKey.get(lineKey) ?? []), view]);
    }

    return threadsByLineKey;
  }, [reviewThreadViews, selectedFileDiffState]);
  const activeThreadAnchorKey = selectedFileDiffState ? getDiffThreadAnchorKey(selectedFileDiffState, activeThread) : null;
  const activeThreadAnchoredInDiff = Boolean(selectedReviewThread && activeThreadAnchorKey);

  useEffect(() => {
    if (!targetDiffDialogOpen || diffDialogLineAnchors.length === 0) {
      return;
    }

    if (!diffDialogLineAnchors.some((anchor) => anchor.id === selectedNewThreadLineAnchorId)) {
      setSelectedNewThreadLineAnchorId(diffDialogLineAnchors[0].id);
    }
    if (hoveredDiffLineAnchorId && !diffDialogLineAnchors.some((anchor) => anchor.id === hoveredDiffLineAnchorId)) {
      setHoveredDiffLineAnchorId(null);
    }
  }, [diffDialogLineAnchorSignature, diffDialogLineAnchors, hoveredDiffLineAnchorId, selectedNewThreadLineAnchorId, targetDiffDialogOpen]);

  const fullFileLineWindow = selectedFileDiffState?.fullFileLines
    ? getBoundedRenderWindow(selectedFileDiffState.fullFileLines, { limit: fullFileRenderLimit })
    : null;
  const fileExplorerRows = buildFileExplorerRows(filteredFileChanges, reviewThreadViews, reviewOverview.hotspots);
  const selectedHandoffThreadViews = selectedBulkThreads.length > 0 ? selectedBulkThreads : selectedReviewThread ? [selectedReviewThread] : [];
  const humanFeedbackThreadViews = filteredReviewThreads.filter((view) => {
    if (view.thread.state !== "unresolved") {
      return false;
    }
    return view.origin === "human" || (humanPacketIncludeCodeRabbit && view.origin === "coderabbit");
  });
  const handoffThreadViews =
    handoffPacketMode === "human-feedback" ? humanFeedbackThreadViews : selectedHandoffThreadViews;
  const handoffIntent = handoffCustomIntent.trim() || handoffIntentPreset;
  const handoffDiffContextByPath = Object.fromEntries(
    handoffThreadViews.map((view) => {
      const fileView = fileChangeViews.find((fileChange) => fileChange.file.path === view.thread.filePath);
      if (!fileView) {
        return [view.thread.filePath, []];
      }

      const state = buildLazyDiffState(fileView.file, {
        mode: "unified",
        repository: selectedPullRequest.repository,
        pullRequestNumber: selectedPullRequest.number,
        loadedHunkIds: loadedDiffHunks[fileView.id] ?? getDefaultLoadedDiffHunkIds(fileView.file),
        expandedHunkIds: expandedDiffHunks[fileView.id],
        fullFileLoaded: fullFileDiffs[fileView.id],
      });
      return [view.thread.filePath, state.fullFileLines ?? state.hunks.flatMap((hunk) => hunk.lines)];
    }),
  );
  const handoffPacket =
    handoffPacketMode === "human-feedback"
      ? buildHumanFeedbackPacket({
          intent: handoffIntent,
          pullRequest: reviewOverviewCache.metadata,
          threads: filteredReviewThreads.map((view) => view.thread),
          includeCodeRabbitThreads: humanPacketIncludeCodeRabbit,
          files: reviewOverviewCache.fileSummaries,
          diffContextByPath: handoffDiffContextByPath,
          githubDataFetchedAtEpochMs: reviewOverviewCache.fetchedAtEpochMs,
          sourceRevision: selectedAnalysisInputStatus.headSha ?? reviewOverviewCache.metadata.updatedAt,
        })
      : buildHandoffPacket({
          intent: handoffIntent,
          pullRequest: reviewOverviewCache.metadata,
          threads: handoffThreadViews.map((view) => view.thread),
          files: reviewOverviewCache.fileSummaries,
          diffContextByPath: handoffDiffContextByPath,
          githubDataFetchedAtEpochMs: reviewOverviewCache.fetchedAtEpochMs,
          sourceRevision: selectedAnalysisInputStatus.headSha ?? reviewOverviewCache.metadata.updatedAt,
        });
  const handoffMarkdown = renderHandoffMarkdown(handoffPacket);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
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
    let active = true;

    for (const repository of reviewCloneRepositorySlugs) {
      workspaceClient
        .getReviewCloneStatus(repository)
        .then((status) => {
          if (!active) {
            return;
          }

          setReviewCloneStatuses((current) => ({
            ...current,
            [status.repository.slug.toLowerCase()]: status,
          }));
        })
        .catch((error) => {
          if (active) {
            setReviewCloneMessage(error instanceof Error ? error.message : String(error));
          }
        });
    }

    return () => {
      active = false;
    };
  }, [reviewCloneRepositorySlugs, workspaceClient]);

  useEffect(() => {
    if (authSession.state === "signed-in" && repositories.length > 0) {
      void refreshPullRequests(includeDrafts);
    }
  }, [authSession.state, repositories.length]);

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
    if (!activePullRequestKey || routedPullRequests.length === 0) {
      return;
    }

    const cachedAtStart = readCacheStore().entries[activePullRequestKey];
    const hasRemoteDataAtStart = Boolean(
      cachedAtStart &&
        (cachedAtStart.fileSummaries.length > 0 ||
          cachedAtStart.reviewThreads.length > 0 ||
          cachedAtStart.checks.length > 0),
    );

    if (authSession.state !== "signed-in") {
      if (!hasRemoteDataAtStart) {
        setPullRequestDataStatus({
          key: activePullRequestKey,
          state: "failed",
          message: "Sign in to load Pull Request files, checks, and review threads from GitHub.",
        });
      }
      return;
    }

    if (pullRequestDataInFlightKeyRef.current === activePullRequestKey) {
      return;
    }

    let active = true;
    pullRequestDataInFlightKeyRef.current = activePullRequestKey;
    setPullRequestDataStatus({
      key: activePullRequestKey,
      state: "loading",
      message: hasRemoteDataAtStart
        ? "Refreshing latest Pull Request threads and checks in the background."
        : "Loading Pull Request review data from GitHub.",
    });

    workspaceClient
      .fetchPullRequestData(selectedPullRequest)
      .then((data) => {
        if (!active) {
          return;
        }

        writeCachedPullRequestData(data);
        syncReviewThreads(currentUserKey, getPullRequestKey(data.pullRequest), data.reviewThreads);
        syncFileChanges(currentUserKey, getPullRequestKey(data.pullRequest), data.fileSummaries);
        setCacheSummary(cacheStats());
        setCacheMessage(
          hasRemoteDataAtStart
            ? "Background refreshed latest GitHub Pull Request review data."
            : "Loaded GitHub Pull Request review data.",
        );
        setPullRequestDataStatus({
          key: activePullRequestKey,
          state: "loaded",
          message: `${hasRemoteDataAtStart ? "Background refreshed" : "Loaded"} ${data.fileSummaries.length} file changes and ${data.reviewThreads.length} review threads.`,
        });
        setReviewQueueRevision((current) => current + 1);
        setFileChangeRevision((current) => current + 1);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setPullRequestDataStatus({
          key: activePullRequestKey,
          state: "failed",
          message,
        });
        setCacheMessage(message);
      })
      .finally(() => {
        if (pullRequestDataInFlightKeyRef.current === activePullRequestKey) {
          pullRequestDataInFlightKeyRef.current = null;
        }
      });

    return () => {
      active = false;
      if (pullRequestDataInFlightKeyRef.current === activePullRequestKey) {
        pullRequestDataInFlightKeyRef.current = null;
      }
    };
  }, [
    activePullRequestKey,
    authSession.state,
    currentUserKey,
    routedPullRequests.length,
    selectedPullRequest,
    workspaceClient,
  ]);

  useEffect(() => {
    if (!activePullRequestKey || routedPullRequests.length === 0 || authSession.state !== "signed-in") {
      return;
    }
    if (analysisInputStatuses[activePullRequestKey]?.state === "ready") {
      return;
    }

    let active = true;
    setAnalysisInputBusyKey(activePullRequestKey);

    workspaceClient
      .preparePullRequestReviewClone(selectedPullRequest)
      .then((status) => {
        if (!active) {
          return;
        }

        setAnalysisInputStatuses((current) => ({
          ...current,
          [getPullRequestKey(selectedPullRequest)]: status,
        }));
        setReviewCloneStatuses((current) => ({
          ...current,
          [status.reviewClone.repository.slug.toLowerCase()]: status.reviewClone,
        }));
        setReviewCloneMessage(status.message);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setAnalysisInputStatuses((current) => ({
          ...current,
          [activePullRequestKey]: createUnavailablePullRequestAnalysisInput(selectedPullRequest, message),
        }));
        setReviewCloneMessage(message);
      })
      .finally(() => {
        if (active) {
          setAnalysisInputBusyKey((current) => (current === activePullRequestKey ? null : current));
        }
      });

    return () => {
      active = false;
    };
  }, [
    activePullRequestKey,
    authSession.state,
    routedPullRequests.length,
    selectedPullRequest,
    workspaceClient,
  ]);

  useEffect(() => {
    if (
      analysisFileContentBusyKey &&
      (!activePullRequestKey ||
        authSession.state !== "signed-in" ||
        selectedAnalysisInputStatus.state !== "ready")
    ) {
      setAnalysisFileContentBusyKey(null);
    }
  }, [activePullRequestKey, analysisFileContentBusyKey, authSession.state, selectedAnalysisInputStatus.state]);

  useEffect(() => {
    if (
      !activePullRequestKey ||
      routedPullRequests.length === 0 ||
      authSession.state !== "signed-in" ||
      selectedAnalysisInputStatus.state !== "ready" ||
      reviewOverviewCache.fileSummaries.length === 0
    ) {
      return;
    }

    const paths = reviewOverviewCache.fileSummaries.map((file) => file.path);
    const existing = analysisFileContents[activePullRequestKey];
    const existingPathSignature = existing?.files.map((file) => file.path).join("|") ?? "";
    const nextPathSignature = paths.join("|");
    if (
      existing &&
      existingPathSignature === nextPathSignature &&
      (existing.headSha === selectedAnalysisInputStatus.headSha || existing.headSha === null)
    ) {
      return;
    }

    let active = true;
    setAnalysisFileContentBusyKey(activePullRequestKey);

    workspaceClient
      .readPullRequestAnalysisFiles(selectedPullRequest, paths)
      .then((contents) => {
        if (!active) {
          return;
        }

        setAnalysisFileContents((current) => ({
          ...current,
          [activePullRequestKey]: contents,
        }));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setAnalysisFileContents((current) => ({
          ...current,
          [activePullRequestKey]: {
            repository: selectedAnalysisInputStatus.repository,
            pullRequestNumber: selectedAnalysisInputStatus.pullRequestNumber,
            headSha: selectedAnalysisInputStatus.headSha,
            files: paths.map((path) => ({
              path,
              state: "unavailable",
              content: null,
              message,
            })),
          },
        }));
      })
      .finally(() => {
        if (active) {
          setAnalysisFileContentBusyKey((current) => (current === activePullRequestKey ? null : current));
        }
      });

    return () => {
      active = false;
    };
  }, [
    activePullRequestKey,
    analysisFileContents,
    authSession.state,
    fileChangeSignature,
    reviewOverviewCache.fileSummaries,
    routedPullRequests.length,
    selectedAnalysisInputStatus.headSha,
    selectedAnalysisInputStatus.state,
    selectedPullRequest,
    workspaceClient,
  ]);

  useEffect(() => {
    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
    setReviewQueueRevision((current) => current + 1);
  }, [currentUserKey, reviewThreadSignature, selectedPullRequest]);

  useEffect(() => {
    syncFileChanges(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.fileSummaries);
    setFileChangeRevision((current) => current + 1);
  }, [currentUserKey, fileChangeSignature, selectedPullRequest]);

  useEffect(() => {
    if (
      !activePullRequestKey ||
      routedPullRequests.length === 0 ||
      authSession.state !== "signed-in" ||
      reviewOverview.checks.pending === 0
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshSelectedPullRequestChecks(selectedPullRequest, "Auto-refreshed GitHub checks.");
    }, 45_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    activePullRequestKey,
    authSession.state,
    reviewOverview.checks.pending,
    routedPullRequests.length,
    selectedPullRequest.repository,
    selectedPullRequest.number,
  ]);

  useEffect(() => {
    setThreadActionResult(null);
  }, [selectedReviewThread?.id]);

  const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const authBadge = getAuthBadge(authSession);
  const signInDisabled = authBusy || authSession.state === "storage-unavailable" || oauthFlow !== null;
  const oauthVerificationUrl = oauthFlow?.verificationUriComplete ?? oauthFlow?.verificationUri ?? "#";

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setOauthCopyMessage(null);
    try {
      const flow = await authClient.startSignIn();
      setOauthFlow(flow);
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(flow.userCode);
          setOauthCopyMessage("Code copied to clipboard.");
        }
      } catch {
        setOauthCopyMessage("Code ready to copy.");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCopyDeviceCode = async () => {
    if (!oauthFlow) {
      return;
    }

    if (!navigator.clipboard) {
      setOauthCopyMessage("Copy unavailable. Select the code and copy it manually.");
      return;
    }

    try {
      await navigator.clipboard.writeText(oauthFlow.userCode);
      setOauthCopyMessage("Code copied to clipboard.");
    } catch {
      setOauthCopyMessage("Copy unavailable. Select the code and copy it manually.");
    }
  };

  const handleCancelSignIn = () => {
    setOauthFlow(null);
    setAuthError(null);
    setOauthCopyMessage(null);
  };

  const handleOpenGithub = async () => {
    if (!oauthFlow) {
      return;
    }

    setAuthError(null);
    try {
      await openUrl(oauthVerificationUrl);
      setOauthCopyMessage("GitHub opened in your browser.");
    } catch (error) {
      setOauthCopyMessage("Open github.com/login/device in your browser, then paste the code.");
      setAuthError(error instanceof Error ? `Could not open GitHub: ${error.message}` : "Could not open GitHub from Narview.");
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
        setOauthCopyMessage(null);
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
      setOauthCopyMessage(null);
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
      threadKey: selectedReviewThread?.id ?? "",
      filePath: activeThreadFile,
      nearbyLine: activeThreadLine ?? 1,
      updatedAtEpochMs: Date.now(),
    };
  }

  function applyReviewSession(snapshot: ReviewSessionSnapshot) {
    setIncludeDrafts(snapshot.includeDrafts);
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
      closePullRequestDialog();
    } catch (error) {
      setQuickOpenError(error instanceof Error ? error.message : String(error));
    }
  };

  async function refreshSelectedPullRequestData(pullRequest: PullRequestSummary, successMessage = "Refreshed GitHub Pull Request review data.") {
    const pullRequestKey = getPullRequestKey(pullRequest);
    if (authSession.state !== "signed-in") {
      setPullRequestDataStatus({
        key: pullRequestKey,
        state: "failed",
        message: "Sign in to refresh Pull Request files, checks, and review threads from GitHub.",
      });
      return;
    }

    if (pullRequestDataInFlightKeyRef.current === pullRequestKey) {
      return;
    }

    pullRequestDataInFlightKeyRef.current = pullRequestKey;
    setPullRequestDataStatus({
      key: pullRequestKey,
      state: "loading",
      message: "Refreshing Pull Request review data from GitHub.",
    });

    try {
      const data = await workspaceClient.fetchPullRequestData(pullRequest);
      writeCachedPullRequestData(data);
      syncReviewThreads(currentUserKey, getPullRequestKey(data.pullRequest), data.reviewThreads);
      syncFileChanges(currentUserKey, getPullRequestKey(data.pullRequest), data.fileSummaries);
      setThreadStateOverrides((current) => {
        const next = { ...current };
        for (const thread of data.reviewThreads) {
          delete next[thread.id];
        }
        return next;
      });
      setCacheSummary(cacheStats());
      setCacheMessage(successMessage);
      setPullRequestDataStatus({
        key: pullRequestKey,
        state: "loaded",
        message: `${successMessage} Loaded ${data.fileSummaries.length} file changes and ${data.reviewThreads.length} review threads.`,
      });
      setReviewQueueRevision((current) => current + 1);
      setFileChangeRevision((current) => current + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPullRequestDataStatus({
        key: pullRequestKey,
        state: "failed",
        message,
      });
      setCacheMessage(message);
    } finally {
      if (pullRequestDataInFlightKeyRef.current === pullRequestKey) {
        pullRequestDataInFlightKeyRef.current = null;
      }
    }
  }

  async function refreshSelectedPullRequestChecks(pullRequest: PullRequestSummary, successMessage = "Refreshed GitHub checks.") {
    const pullRequestKey = getPullRequestKey(pullRequest);
    const checksWerePending = activePullRequestKey === pullRequestKey && reviewOverview.checks.pending > 0;
    if (authSession.state !== "signed-in") {
      setCheckRefreshStatus({
        key: pullRequestKey,
        state: "failed",
        message: "Sign in to refresh GitHub checks.",
      });
      return;
    }

    if (checkRefreshInFlightKeyRef.current === pullRequestKey) {
      return;
    }

    checkRefreshInFlightKeyRef.current = pullRequestKey;
    setCheckRefreshStatus({
      key: pullRequestKey,
      state: "loading",
      message: "Refreshing GitHub checks.",
    });

    try {
      const response = await workspaceClient.fetchPullRequestChecks(pullRequest);
      const checksFinished = checksWerePending && response.checks.every((check) => check.status === "completed");
      upsertCachedPullRequest(pullRequest, {
        checks: response.checks,
        rateLimit: response.rateLimit,
        fetchedAtEpochMs: response.fetchedAtEpochMs,
      });
      setCacheSummary(cacheStats());
      setCheckRefreshStatus({
        key: pullRequestKey,
        state: "loaded",
        message: `${successMessage} Loaded ${response.checks.length} check${response.checks.length === 1 ? "" : "s"}.`,
      });

      if (checksFinished) {
        setCheckRefreshStatus({
          key: pullRequestKey,
          state: "loaded",
          message: "Checks finished. Refreshing Pull Request threads and merge state.",
        });
        await refreshSelectedPullRequestData(pullRequest, "Checks completed; refreshed GitHub Pull Request review data.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCheckRefreshStatus({
        key: pullRequestKey,
        state: "failed",
        message,
      });
    } finally {
      if (checkRefreshInFlightKeyRef.current === pullRequestKey) {
        checkRefreshInFlightKeyRef.current = null;
      }
    }
  }

  async function refreshPullRequests(
    nextIncludeDrafts = includeDrafts,
    options: { refreshSelectedPullRequestData?: boolean } = {},
  ) {
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
      const nextSelectedPullRequest =
        (activePullRequestKey
          ? response.pullRequests.find((pullRequest) => getPullRequestKey(pullRequest) === activePullRequestKey)
          : null) ??
        response.pullRequests[0] ??
        null;
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
      if (options.refreshSelectedPullRequestData && response.status.state === "fresh" && nextSelectedPullRequest) {
        await refreshSelectedPullRequestData(nextSelectedPullRequest);
      }
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

  const ensureReviewCloneForRepository = async (repository: string) => {
    const repositoryKey = repository.toLowerCase();
    setReviewCloneBusyKey(repositoryKey);
    setReviewCloneMessage(null);
    try {
      const status = await workspaceClient.ensureReviewClone(repository);
      setReviewCloneStatuses((current) => ({
        ...current,
        [status.repository.slug.toLowerCase()]: status,
      }));
      setReviewCloneMessage(status.message ?? `Review Clone ${getReviewCloneBadge(status.state).label.toLowerCase()}.`);
    } catch (error) {
      setReviewCloneMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewCloneBusyKey((current) => (current === repositoryKey ? null : current));
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
    setCacheMessage("Cleared fetched GitHub cache. Reviewed, Viewed, and Review Session state stayed local.");
    setPrivacyMessage("Fetched GitHub data cleared.");
  };

  const buildCurrentDiagnosticsPreview = () =>
    buildDiagnosticsPreview({
      cache: cacheStats(),
      reviewQueue: summarizeReviewQueueStore(readReviewQueueStore()),
      fileChanges: summarizeFileChangeStore(readFileChangeStore()),
      reviewSessions: summarizeReviewSessionStore(readReviewSessionStore()),
    });

  const handlePreviewDiagnostics = () => {
    const nextPreview = buildCurrentDiagnosticsPreview();
    setDiagnosticsPreview(nextPreview);
    setDiagnosticsCopyMessage(null);
    setPrivacyMessage("Redacted diagnostics preview ready.");
  };

  const handleCopyDiagnostics = async () => {
    const preview = diagnosticsPreview ?? buildCurrentDiagnosticsPreview();
    setDiagnosticsPreview(preview);
    await navigator.clipboard?.writeText(renderDiagnosticsExport(preview));
    setDiagnosticsCopyMessage("Copied redacted diagnostics export.");
  };

  const handleResetLocalReviewHistory = () => {
    clearReviewQueueStore();
    clearFileChangeStore();
    clearReviewSessionStore();
    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
    syncFileChanges(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.fileSummaries);
    setSelectedBulkThreadIds([]);
    setBulkUndo(null);
    setBulkActionResult(null);
    setReviewQueueRevision((current) => current + 1);
    setFileChangeRevision((current) => current + 1);
    setResetHistoryConfirmOpen(false);
    setDiagnosticsPreview(null);
    setDiagnosticsCopyMessage(null);
    setPrivacyMessage("Local review history reset.");
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

  const updateFileChangeFilter = <Key extends keyof FileChangeFilters>(
    key: Key,
    value: FileChangeFilters[Key],
  ) => {
    setFileChangeFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyReviewQueueFilters = (filters: ReviewQueueFilters) => {
    setReviewQueueFilters(filters);
  };

  const selectFilePathInDiff = (path: string) => {
    const fileView = fileChangeViews.find((view) => view.file.path === path);
    if (fileView) {
      setSelectedFileChangeId(fileView.id);
    }
  };

  const openThreadFileInDiff = (threadId: string) => {
    const thread = reviewThreadViews.find((view) => view.id === threadId)?.thread;
    if (thread) {
      selectFilePathInDiff(thread.filePath);
    }
  };

  const selectReviewThread = (threadId: string) => {
    setSelectedReviewThreadId(threadId);
    openThreadFileInDiff(threadId);
  };

  const selectReviewTarget = (targetId: string) => {
    setSelectedReviewTargetId(targetId);
    const target = reviewPathItems.find((item) => item.id === targetId)?.target;
    const firstFilePath = target?.paths[0];
    if (firstFilePath) {
      selectFilePathInDiff(firstFilePath);
    }
  };

  const openReviewTargetDiff = (targetId = selectedReviewTargetId) => {
    if (targetId) {
      selectReviewTarget(targetId);
    }
    setTargetDiffDialogOpen(true);
  };

  const openReviewTargetComment = () => {
    if (!selectedReviewPathItem) {
      return;
    }
    setTargetDiffDialogOpen(false);
    setInlineCommentAnchorId(null);
    setStartReviewThreadDialogOpen(true);
  };

  const openLineCommentComposer = (anchor: ReviewThreadLineAnchor | null = hoveredDiffDialogLineAnchor ?? selectedDiffDialogLineAnchor) => {
    if (!anchor) {
      openReviewTargetComment();
      return;
    }

    setNewThreadMode("line");
    setSelectedNewThreadLineAnchorId(anchor.id);
    setInlineCommentAnchorId(anchor.id);
    setStartReviewThreadDialogOpen(false);
    setNewThreadResult(null);
    window.setTimeout(() => inlineCommentBodyRef.current?.focus(), 0);
  };

  const moveDiffLineAnchor = (direction: 1 | -1) => {
    if (diffDialogLineAnchors.length === 0) {
      return;
    }

    const currentIndex = selectedDiffDialogLineAnchor
      ? diffDialogLineAnchors.findIndex((anchor) => anchor.id === selectedDiffDialogLineAnchor.id)
      : -1;
    const baseIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
    const nextAnchor = diffDialogLineAnchors[(baseIndex + direction + diffDialogLineAnchors.length) % diffDialogLineAnchors.length];
    setNewThreadMode("line");
    setSelectedNewThreadLineAnchorId(nextAnchor.id);
  };

  const toggleSelectedReviewTargetReviewed = (advanceAfterReview = false) => {
    if (!selectedReviewPathItem) {
      return;
    }

    const targetId = selectedReviewPathItem.id;
    const reviewed = reviewedTargetIds.has(targetId);
    setReviewTargetReviewed(targetId, !reviewed);

    if (!reviewed && advanceAfterReview) {
      const nextReviewedTargetIds = new Set(reviewedTargetIds);
      nextReviewedTargetIds.add(targetId);
      const nextTargetId = moveReviewPathSelection(reviewPathItems, nextReviewedTargetIds, targetId, 1);
      if (nextTargetId) {
        selectReviewTarget(nextTargetId);
      }
    }
  };

  const moveReviewTarget = (direction: 1 | -1) => {
    const nextTargetId = moveReviewPathSelection(reviewPathItems, reviewedTargetIds, selectedReviewTargetId, direction);
    if (nextTargetId) {
      selectReviewTarget(nextTargetId);
    }
  };

  const setReviewTargetReviewed = (targetId: string, reviewed: boolean) => {
    syncReviewTargets(currentUserKey, selectedPullRequestReviewKey, reviewTargets);
    setStoredReviewTargetReviewed(currentUserKey, targetId, reviewed);
    setReviewTargetRevision((current) => current + 1);
  };

  const moveReviewThread = (direction: 1 | -1) => {
    if (filteredReviewThreads.length === 0) {
      return;
    }

    const currentIndex = selectedReviewThread ? filteredReviewThreads.findIndex((view) => view.id === selectedReviewThread.id) : -1;
    const baseIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
    const nextIndex = (baseIndex + direction + filteredReviewThreads.length) % filteredReviewThreads.length;
    selectReviewThread(filteredReviewThreads[nextIndex].id);
  };

  const focusReplyField = () => {
    setReviewThreadDialogOpen(true);
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>("[aria-label='Reply body']")?.focus();
    }, 0);
  };

  const handleSetFileChangeViewed = (fileChangeId: string, viewed: boolean) => {
    syncFileChanges(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.fileSummaries);
    setFileChangeViewed(currentUserKey, fileChangeId, viewed);
    setFileChangeRevision((current) => current + 1);
  };

  const loadDiffHunk = (fileChangeId: string, file: CachedFileSummary, hunkId: string) => {
    setLoadedDiffHunks((current) => ({
      ...current,
      [fileChangeId]: Array.from(new Set([...(current[fileChangeId] ?? getDefaultLoadedDiffHunkIds(file)), hunkId])),
    }));
  };

  const expandDiffHunk = (fileChangeId: string, hunkId: string) => {
    setExpandedDiffHunks((current) => ({
      ...current,
      [fileChangeId]: Array.from(new Set([...(current[fileChangeId] ?? []), hunkId])),
    }));
  };

  const fetchWholeFile = (fileChangeId: string) => {
    setFullFileDiffs((current) => ({
      ...current,
      [fileChangeId]: true,
    }));
  };

  const copyHandoffMarkdown = async () => {
    await navigator.clipboard?.writeText(handoffMarkdown);
    setHandoffCopyMessage(`Copied ${handoffPacket.threads.length} thread${handoffPacket.threads.length === 1 ? "" : "s"} to Markdown.`);
  };

  const handleSetReviewThreadReviewed = (threadId: string, reviewed: boolean) => {
    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), effectiveReviewThreads);
    setReviewThreadReviewed(currentUserKey, threadId, reviewed);
    setReviewQueueRevision((current) => current + 1);
  };

  const handleSetSelectedThreadReviewed = (reviewed: boolean) => {
    if (!selectedReviewThread) {
      return;
    }

    handleSetReviewThreadReviewed(selectedReviewThread.id, reviewed);
  };

  const markResolvedThreadsReviewed = (threadIds: string[]) => {
    if (threadIds.length === 0) {
      return;
    }

    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), effectiveReviewThreads);
    for (const threadId of threadIds) {
      setReviewThreadReviewed(currentUserKey, threadId, true);
    }
  };

  const appendReplyToCachedThread = (threadId: string, body: string, replyUrl: string | null) => {
    const updatedAt = new Date().toISOString();
    const optimisticReply: CachedReviewThreadComment = {
      id: replyUrl ?? `${threadId}:reply:${updatedAt}`,
      authorLogin: authSession.accountLogin,
      body,
      updatedAt,
      url: replyUrl,
    };
    const reviewThreads = reviewOverviewCache.reviewThreads.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            comments: [...getThreadComments(thread), optimisticReply],
            updatedAt,
          }
        : thread,
    );

    writeCachedPullRequestData({ ...reviewOverviewCache, pullRequest: selectedPullRequest, reviewThreads });
    setCacheSummary(cacheStats());
    setReviewQueueRevision((current) => current + 1);
  };

  const mergeCreatedThreadIntoCache = (thread: CachedReviewThread) => {
    const reviewThreads = [
      thread,
      ...reviewOverviewCache.reviewThreads.filter((existingThread) => existingThread.id !== thread.id),
    ];

    writeCachedPullRequestData({ ...reviewOverviewCache, pullRequest: selectedPullRequest, reviewThreads });
    syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewThreads);
    setOptimisticCreatedReviewThreads((current) => [thread, ...current.filter((existingThread) => existingThread.id !== thread.id)]);
    setSelectedReviewThreadId(thread.id);
    setCacheSummary(cacheStats());
    setReviewQueueRevision((current) => current + 1);
    setReviewTargetRevision((current) => current + 1);
  };

  const runStartReviewThread = async (mode: "line" | "file") => {
    if (threadActionBusy !== null || !selectedReviewPathItem) {
      return;
    }

    const action: ThreadWriteAction = mode === "line" ? "create-line" : "create-file";
    const disabledReason = mode === "line" ? lineThreadDisabledReason : fileThreadDisabledReason;
    if (disabledReason) {
      setNewThreadResult(
        createThreadActionFailure(
          action,
          selectedReviewPathItem.id,
          disabledReason === reviewThreadWriteDisabledReason ? "github-thread-read-only" : "github-thread-anchor-unavailable",
          disabledReason,
        ),
      );
      return;
    }

    const body = newThreadBody.trim();
    if (!body) {
      setNewThreadResult(
        createThreadActionFailure(action, selectedReviewPathItem.id, "github-thread-validation-error", "Review Thread body is required."),
      );
      return;
    }

    setThreadActionBusy(action);
    setNewThreadResult(null);

    try {
      const result =
        mode === "line"
          ? selectedNewThreadLineAnchor
            ? await threadActionClient.startLineThread({
                repository: selectedPullRequest.repository,
                pullRequestNumber: selectedPullRequest.number,
                path: selectedNewThreadLineAnchor.path,
                line: selectedNewThreadLineAnchor.line,
                side: selectedNewThreadLineAnchor.side,
                body,
              })
            : createThreadActionFailure(
                "create-line",
                selectedReviewPathItem.id,
                "github-thread-anchor-unavailable",
                "Line-level Review Threads need an added or removed changed line inside this Review Target.",
              )
          : fileThreadAnchorState.anchor
            ? await threadActionClient.startFileThread({
                repository: selectedPullRequest.repository,
                pullRequestNumber: selectedPullRequest.number,
                path: fileThreadAnchorState.anchor.path,
                body,
              })
            : createThreadActionFailure(
                "create-file",
                selectedReviewPathItem.id,
                "github-thread-anchor-unavailable",
                "File Review Threads require a single-file Review Target.",
              );

      setNewThreadResult(result);
      if (result.ok && result.createdThread) {
        mergeCreatedThreadIntoCache(result.createdThread);
        setNewThreadBody("");
        setNewThreadOriginTargetId(selectedReviewPathItem.id);
        if (mode === "line") {
          setInlineCommentAnchorId(null);
        }
      }
    } finally {
      setThreadActionBusy(null);
    }
  };

  const runReviewThreadStateAction = async (view: ReviewThreadView, action: "resolve" | "unresolve") => {
    if (threadActionBusy !== null) {
      return;
    }
    if (!canPublishReviewThreads) {
      setThreadActionResult(
        createThreadActionFailure(
          action,
          view.id,
          "github-thread-read-only",
          reviewThreadWriteDisabledReason ?? "GitHub write access is unavailable.",
        ),
      );
      return;
    }

    setThreadActionBusy(action);
    setThreadActionResult(null);

    try {
      const result = action === "resolve" ? await threadActionClient.resolve(view.id) : await threadActionClient.unresolve(view.id);

      setThreadActionResult(result);

      if (result.ok && action === "resolve") {
        markResolvedThreadsReviewed([view.id]);
        setThreadStateOverrides((current) => ({
          ...current,
          [view.id]: "resolved",
        }));
        setReviewQueueRevision((current) => current + 1);
      }
      if (result.ok && action === "unresolve") {
        setThreadStateOverrides((current) => ({
          ...current,
          [view.id]: "unresolved",
        }));
      }
    } finally {
      setThreadActionBusy(null);
    }
  };

  const runThreadAction = async (action: ThreadWriteAction) => {
    if (!selectedReviewThread || threadActionBusy !== null) {
      return;
    }

    if (action === "resolve" || action === "unresolve") {
      await runReviewThreadStateAction(selectedReviewThread, action);
      return;
    }

    if (!canPublishReviewThreads) {
      setThreadActionResult(
        createThreadActionFailure(
          action,
          selectedReviewThread.id,
          "github-thread-read-only",
          reviewThreadWriteDisabledReason ?? "GitHub write access is unavailable.",
        ),
      );
      return;
    }

    const submittedReplyBody = replyDraft.trim();
    setThreadActionBusy(action);
    setThreadActionResult(null);

    try {
      const result = await threadActionClient.reply(selectedReviewThread.id, submittedReplyBody);

      setThreadActionResult(result);

      if (result.ok) {
        appendReplyToCachedThread(selectedReviewThread.id, submittedReplyBody, result.replyUrl);
        setReplyDraft("");
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
        const visible = new Set(renderedReviewThreads.map((view) => view.id));
        return current.filter((id) => !visible.has(id));
      }

      return Array.from(new Set([...current, ...renderedReviewThreads.map((view) => view.id)]));
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
    if (!canPublishReviewThreads) {
      setBulkActionResult({
        action,
        message: reviewThreadWriteDisabledReason ?? "GitHub write access is unavailable.",
        successes: [],
        failures: selectedBulkThreads.map((view) => ({
          id: view.id,
          message: reviewThreadWriteDisabledReason ?? "GitHub write access is unavailable.",
          retryable: false,
        })),
      });
      return;
    }
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
        if (action === "resolve") {
          markResolvedThreadsReviewed(successes);
        } else {
          syncReviewThreads(currentUserKey, getPullRequestKey(selectedPullRequest), reviewOverviewCache.reviewThreads);
        }
      }
      for (const threadId of successes) {
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

  const openCommandPalette = () => {
    setCommandQuery("");
    setCommandOpen(true);
  };

  const closeCommandPalette = () => {
    setCommandOpen(false);
    setCommandQuery("");
  };

  const openPullRequestDialog = () => {
    setPullRequestDialogQuery("");
    setPullRequestDialogOpen(true);
  };

  const closePullRequestDialog = () => {
    setPullRequestDialogOpen(false);
    setPullRequestDialogQuery("");
  };

  const selectPullRequestFromDialog = async (pullRequest: PullRequestSummary) => {
    await handleSelectPullRequest(pullRequest);
    closePullRequestDialog();
  };

  const openThreadDialog = () => {
    setThreadDialogQuery("");
    setThreadDialogOpen(true);
  };

  const closeThreadDialog = () => {
    setThreadDialogOpen(false);
    setThreadDialogQuery("");
  };

  const selectThreadFromDialog = (threadId: string) => {
    selectReviewThread(threadId);
    closeThreadDialog();
  };

  const openHotspotsDialog = () => {
    setHotspotsDialogOpen(true);
  };

  const closeHotspotsDialog = () => {
    setHotspotsDialogOpen(false);
  };

  const selectHotspotFile = (path: string) => {
    const fileView = fileChangeViews.find((view) => view.file.path === path);
    if (fileView) {
      setSelectedFileChangeId(fileView.id);
    }
    closeHotspotsDialog();
  };

  const toggleSelectedFileViewed = () => {
    if (!selectedFileChange) {
      return;
    }
    handleSetFileChangeViewed(selectedFileChange.id, !selectedFileChange.viewed);
  };

  const refreshCurrentPullRequest = () => {
    if (!activePullRequestKey || selectedPullRequestLoadingData) {
      return;
    }

    void refreshSelectedPullRequestData(selectedPullRequest);
  };

  const noActiveThreadReason = "No Review Thread is selected.";
  const noVisibleThreadReason = "No Review Threads match the current filters.";
  const noVisibleTargetReason = "No active Review Targets are available.";
  const noSelectedBulkReason = "Select one or more Review Threads first.";
  const noSelectedFileReason = "No file change is selected.";
  const commandItems: CommandPaletteItem[] = [
    {
      id: "navigation.next-review-target",
      category: "Navigation",
      label: "Next Review Target",
      description: "Move to the next active Review Target in the Review Path.",
      shortcut: "K",
      disabled: activeReviewPathItems.length === 0,
      disabledReason: noVisibleTargetReason,
      keywords: ["review path", "target", "map"],
      run: () => moveReviewTarget(1),
    },
    {
      id: "navigation.previous-review-target",
      category: "Navigation",
      label: "Previous Review Target",
      description: "Move to the previous active Review Target in the Review Path.",
      shortcut: "J",
      disabled: activeReviewPathItems.length === 0,
      disabledReason: noVisibleTargetReason,
      keywords: ["review path", "target", "map"],
      run: () => moveReviewTarget(-1),
    },
    {
      id: "navigation.open-pull-request-dialog",
      category: "Navigation",
      label: "Open Pull Requests",
      description: `Switch between ${routedPullRequests.length} loaded Pull Request${routedPullRequests.length === 1 ? "" : "s"}.`,
      shortcut: "P",
      keywords: ["pull request switcher", "prs", "github"],
      run: openPullRequestDialog,
    },
    {
      id: "navigation.refresh-current-pr",
      category: "Navigation",
      label: "Refresh Current Pull Request",
      description: "Reload files, Review Threads, checks, and merge state for the active Pull Request.",
      shortcut: "⌃R",
      disabled: !activePullRequestKey || selectedPullRequestLoadingData,
      disabledReason: !activePullRequestKey ? "Open a Pull Request first." : "This Pull Request is already refreshing.",
      keywords: ["pull request", "github", "sync"],
      run: refreshCurrentPullRequest,
    },
    {
      id: "navigation.open-settings",
      category: "Navigation",
      label: "Open Settings",
      description: "Manage GitHub session, updates, cache, and local review history.",
      keywords: ["preferences", "account", "cache", "privacy", "updates"],
      run: () => setSettingsDialogOpen(true),
    },
    {
      id: "navigation.open-thread-dialog",
      category: "Navigation",
      label: "Open Review Threads",
      description: `Browse all ${reviewThreadViews.length} Review Thread${reviewThreadViews.length === 1 ? "" : "s"} for the current Pull Request.`,
      shortcut: "T",
      disabled: reviewThreadViews.length === 0,
      disabledReason: "No Review Threads are loaded for this Pull Request.",
      keywords: ["thread switcher", "review queue", "dialog"],
      run: openThreadDialog,
    },
    {
      id: "navigation.open-hotspots-dialog",
      category: "Navigation",
      label: "Open Hotspots",
      description: `Browse ${reviewOverview.hotspots.length} high-signal changed file${reviewOverview.hotspots.length === 1 ? "" : "s"}.`,
      shortcut: "S",
      disabled: reviewOverview.hotspots.length === 0,
      disabledReason: "No hotspots are available for this Pull Request.",
      keywords: ["hotspots", "risk", "files"],
      run: openHotspotsDialog,
    },
    {
      id: "navigation.open-active-file",
      category: "Navigation",
      label: "Open Diff",
      description: selectedFileDiffState ? `Inspect ${selectedFileDiffState.filePath}.` : "Open the selected Review Target diff.",
      shortcut: "D",
      disabled: !selectedReviewPathItem,
      disabledReason: "Select a Review Target with a changed file first.",
      keywords: ["diff", "file"],
      run: () => {
        if (selectedReviewThread) {
          openThreadFileInDiff(selectedReviewThread.id);
        }
        openReviewTargetDiff();
      },
    },
    {
      id: "review.comment-target",
      category: "Review",
      label: "Comment On Review Target",
      description: selectedReviewPathItem
        ? `Start a GitHub Review Thread for ${selectedReviewPathItem.target.title}.`
        : "Start a GitHub Review Thread for the selected Review Target.",
      shortcut: "C",
      disabled: !selectedReviewPathItem,
      disabledReason: "Select a Review Target first.",
      keywords: ["comment", "review target", "github"],
      run: openReviewTargetComment,
    },
    {
      id: "review.toggle-reviewed",
      category: "Review",
      label: selectedReviewPathItem && reviewedTargetIds.has(selectedReviewPathItem.id) ? "Mark Review Target Active" : "Mark Review Target Reviewed",
      description: "Update the local per-user Reviewed checklist state for the selected Review Target.",
      shortcut: "R",
      disabled: !selectedReviewPathItem,
      disabledReason: "Select a Review Target first.",
      keywords: ["checklist", "local", "target"],
      run: () => toggleSelectedReviewTargetReviewed(true),
    },
    {
      id: "review.reply-focus",
      category: "Review",
      label: "Open Reply Composer",
      description: "Move the cursor to the active Review Thread reply field.",
      shortcut: "⇧R",
      disabled: !selectedReviewThread,
      disabledReason: noActiveThreadReason,
      keywords: ["comment", "thread"],
      run: focusReplyField,
    },
    {
      id: "review.resolve-toggle",
      category: "Review",
      label: threadResolveAction === "unresolve" ? "Unresolve Active Review Thread" : "Resolve Active Review Thread",
      description: "Run the same GitHub thread action as the Inspector button.",
      shortcut: "E",
      disabled: !selectedReviewThread || !canPublishReviewThreads || threadActionBusy !== null,
      disabledReason: !selectedReviewThread
        ? noActiveThreadReason
        : !canPublishReviewThreads
          ? (reviewThreadWriteDisabledReason ?? "GitHub write access is unavailable.")
          : "A GitHub Review Thread action is already running.",
      keywords: ["github", "thread"],
      run: () => void runThreadAction(threadResolveAction),
    },
    ...queueButtons.map((queue) => ({
      id: `filters.queue.${queue.id}`,
      category: "Filters" as const,
      label: `Filter Queue: ${queue.label}`,
      description: `Show ${queue.count} Review Thread${queue.count === 1 ? "" : "s"} for ${queue.label}.`,
      keywords: ["review queue", queue.id],
      run: () => applyReviewQueueFilters(queue.filters),
    })),
    {
      id: "filters.queue.all",
      category: "Filters",
      label: "Clear Review Queue Filters",
      description: "Show all Review Threads regardless of source, reviewed state, or GitHub state.",
      disabled: filtersMatch(reviewQueueFilters, defaultReviewQueueFilters),
      disabledReason: "All Review Threads are already visible.",
      keywords: ["reset", "all"],
      run: () => applyReviewQueueFilters(defaultReviewQueueFilters),
    },
    {
      id: "filters.files.unviewed",
      category: "Filters",
      label: "Show Unviewed Files",
      description: "Filter File Changes to files that still need review.",
      keywords: ["file changes", "viewed"],
      run: () => updateFileChangeFilter("viewed", "unviewed"),
    },
    {
      id: "filters.files.text",
      category: "Filters",
      label: "Show Text Files",
      description: "Filter File Changes to text diffs.",
      keywords: ["file changes", "kind"],
      run: () => updateFileChangeFilter("kind", "text"),
    },
    {
      id: "filters.files.all",
      category: "Filters",
      label: "Clear File Filters",
      description: "Show every file change for the active Pull Request.",
      disabled: fileChangeFilters.viewed === "all" && fileChangeFilters.kind === "all",
      disabledReason: "All File Changes are already visible.",
      keywords: ["reset", "files"],
      run: () => setFileChangeFilters(defaultFileChangeFilters),
    },
    {
      id: "files.view-whole",
      category: "Files",
      label: "View Whole Selected File",
      description: selectedFileChange ? `Load all visible context for ${selectedFileChange.file.path}.` : "Load all visible context for the selected file.",
      disabled: !selectedFileChange || Boolean(selectedFileDiffState?.fullFileLines),
      disabledReason: !selectedFileChange ? noSelectedFileReason : "The whole selected file is already visible.",
      keywords: ["diff", "context"],
      run: () => {
        if (selectedFileChange) {
          fetchWholeFile(selectedFileChange.id);
        }
      },
    },
    {
      id: "files.toggle-viewed",
      category: "Files",
      label: selectedFileChange?.viewed ? "Mark Selected File Unviewed" : "Mark Selected File Viewed",
      description: selectedFileChange
        ? `Toggle Viewed state for ${selectedFileChange.file.path}.`
        : "Toggle Viewed state for the selected file.",
      shortcut: "V",
      disabled: !selectedFileChange,
      disabledReason: noSelectedFileReason,
      keywords: ["file changes", "viewed"],
      run: toggleSelectedFileViewed,
    },
    ...fileChangeViews.slice(0, 8).map((view) => ({
      id: `files.jump.${view.id}`,
      category: "Files" as const,
      label: `Jump To File: ${view.file.path}`,
      description: `${getFileStatusLabel(view.file.status)} ${getFileLineLabel(view.file)} lines, ${view.kind} diff.`,
      keywords: ["file changes", view.file.path],
      run: () => setSelectedFileChangeId(view.id),
    })),
    {
      id: "bulk.select-visible",
      category: "Bulk",
      label: allFilteredThreadsSelected ? "Clear Visible Review Thread Selection" : "Select Visible Review Threads",
      description: allFilteredThreadsSelected
        ? "Remove visible Review Threads from the bulk selection."
        : `Select ${renderedReviewThreads.length} visible Review Thread${renderedReviewThreads.length === 1 ? "" : "s"}.`,
      shortcut: "A",
      disabled: renderedReviewThreads.length === 0,
      disabledReason: noVisibleThreadReason,
      keywords: ["bulk actions"],
      run: () => toggleAllFilteredThreadSelection(!allFilteredThreadsSelected),
    },
    {
      id: "bulk.clear-selection",
      category: "Bulk",
      label: "Clear Selected Review Threads",
      description: "Remove every Review Thread from the bulk selection.",
      disabled: selectedBulkThreadIds.length === 0,
      disabledReason: noSelectedBulkReason,
      keywords: ["bulk actions"],
      run: () => setSelectedBulkThreadIds([]),
    },
    {
      id: "bulk.mark-reviewed",
      category: "Bulk",
      label: "Bulk Mark Selected Reviewed",
      description: "Apply the local Reviewed checklist state to selected Review Threads.",
      disabled: selectedBulkThreads.length === 0,
      disabledReason: noSelectedBulkReason,
      keywords: ["bulk actions", "checklist"],
      run: () => applyBulkReviewedState(true),
    },
    {
      id: "bulk.mark-unreviewed",
      category: "Bulk",
      label: "Bulk Mark Selected Unreviewed",
      description: "Undo the local Reviewed checklist state for selected Review Threads.",
      disabled: selectedBulkThreads.length === 0,
      disabledReason: noSelectedBulkReason,
      keywords: ["bulk actions", "checklist"],
      run: () => applyBulkReviewedState(false),
    },
    {
      id: "bulk.resolve",
      category: "Bulk",
      label: "Bulk Resolve Selected On GitHub",
      description: "Open the explicit confirmation dialog before resolving selected Review Threads.",
      disabled: selectedBulkThreads.length === 0 || !canPublishReviewThreads || threadActionBusy !== null,
      disabledReason:
        selectedBulkThreads.length === 0
          ? noSelectedBulkReason
          : !canPublishReviewThreads
            ? (reviewThreadWriteDisabledReason ?? "GitHub write access is unavailable.")
            : "A GitHub Review Thread action is already running.",
      keywords: ["bulk actions", "github"],
      run: () => setBulkConfirmAction("resolve"),
    },
    {
      id: "bulk.unresolve",
      category: "Bulk",
      label: "Bulk Unresolve Selected On GitHub",
      description: "Open the explicit confirmation dialog before unresolving selected Review Threads.",
      disabled: selectedBulkThreads.length === 0 || !canPublishReviewThreads || threadActionBusy !== null,
      disabledReason:
        selectedBulkThreads.length === 0
          ? noSelectedBulkReason
          : !canPublishReviewThreads
            ? (reviewThreadWriteDisabledReason ?? "GitHub write access is unavailable.")
            : "A GitHub Review Thread action is already running.",
      keywords: ["bulk actions", "github"],
      run: () => setBulkConfirmAction("unresolve"),
    },
    {
      id: "handoff.copy",
      category: "Handoff",
      label: "Copy Handoff Packet Markdown",
      description: `Copy ${handoffPacket.threads.length} selected Review Thread${handoffPacket.threads.length === 1 ? "" : "s"} with PR metadata and diff context.`,
      shortcut: "H",
      disabled: handoffPacket.threads.length === 0,
      disabledReason: "Select a Review Thread before creating a Handoff Packet.",
      keywords: ["handoff packet", "markdown"],
      run: () => void copyHandoffMarkdown(),
    },
    ...handoffIntentOptions.map((option) => ({
      id: `handoff.intent.${option.value}`,
      category: "Handoff" as const,
      label: `Use Handoff Intent: ${option.label}`,
      description: "Set the structured Handoff Packet intent without making any LLM calls.",
      keywords: ["handoff packet", "intent"],
      run: () => {
        setHandoffIntentPreset(option.value);
        setHandoffCustomIntent("");
      },
    })),
  ];
  const normalizedCommandQuery = commandQuery.trim();
  const filteredCommandItems = commandItems.filter((command) => commandMatchesQuery(command, normalizedCommandQuery));
  const groupedCommandItems = (["Navigation", "Review", "Filters", "Files", "Bulk", "Handoff"] satisfies CommandPaletteItem["category"][])
    .map((category) => ({
      category,
      commands: filteredCommandItems.filter((command) => command.category === category),
    }))
    .filter((group) => group.commands.length > 0);

  const runPaletteCommand = (command: CommandPaletteItem) => {
    if (command.disabled) {
      return;
    }

    closeCommandPalette();
    void command.run();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const commandPalette = (event.metaKey || event.ctrlKey) && key === "k";
      if (commandPalette) {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && key === "r") {
        event.preventDefault();
        refreshCurrentPullRequest();
        return;
      }

      if (pullRequestDialogOpen && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const shortcutIndex = getNumericShortcutIndex(key);
        const shortcutPullRequest = shortcutIndex !== null ? pullRequestDialogPullRequests[shortcutIndex] : null;
        if (shortcutPullRequest) {
          event.preventDefault();
          void selectPullRequestFromDialog(shortcutPullRequest);
          return;
        }
      }

      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (targetDiffDialogOpen && (key === "arrowdown" || key === "arrowup")) {
        event.preventDefault();
        moveDiffLineAnchor(key === "arrowdown" ? 1 : -1);
        return;
      }

      if (key === "k") {
        event.preventDefault();
        moveReviewTarget(1);
      } else if (key === "j") {
        event.preventDefault();
        moveReviewTarget(-1);
      } else if (key === "t") {
        event.preventDefault();
        openThreadDialog();
      } else if (key === "p") {
        event.preventDefault();
        openPullRequestDialog();
      } else if (key === "s") {
        event.preventDefault();
        openHotspotsDialog();
      } else if (key === "r" && event.shiftKey) {
        event.preventDefault();
        focusReplyField();
      } else if (key === "r") {
        event.preventDefault();
        toggleSelectedReviewTargetReviewed(true);
      } else if (key === "e") {
        event.preventDefault();
        void runThreadAction(threadResolveAction);
      } else if (key === "d" || key === "o") {
        event.preventDefault();
        if (selectedReviewThread) {
          openThreadFileInDiff(selectedReviewThread.id);
        }
        openReviewTargetDiff();
      } else if (key === "c") {
        event.preventDefault();
        if (targetDiffDialogOpen) {
          openLineCommentComposer();
        } else {
          openReviewTargetComment();
        }
      } else if (key === "h") {
        event.preventDefault();
        void copyHandoffMarkdown();
      } else if (key === "a") {
        event.preventDefault();
        toggleAllFilteredThreadSelection(!allFilteredThreadsSelected);
      } else if (key === "v") {
        event.preventDefault();
        toggleSelectedFileViewed();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [allFilteredThreadsSelected, moveDiffLineAnchor, moveReviewTarget, openCommandPalette, openHotspotsDialog, openLineCommentComposer, openPullRequestDialog, openReviewTargetComment, openThreadDialog, openThreadFileInDiff, pullRequestDialogOpen, pullRequestDialogPullRequests, refreshCurrentPullRequest, selectPullRequestFromDialog, selectedReviewThread, targetDiffDialogOpen, threadResolveAction, toggleSelectedFileViewed, toggleSelectedReviewTargetReviewed]);

  const refreshBadge = getRefreshBadge(refreshStatus);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <img
            alt="Narview logo"
            className="h-8 w-8 rounded-md border border-border object-cover shadow-sm"
            src="/app-logo.png"
          />
          <div>
            <h1 className="text-sm font-semibold leading-none">Narview</h1>
            <p className="mt-1 max-w-80 truncate text-xs text-muted-foreground" title={`${selectedPullRequestDisplay} · ${selectedPullRequestTitle}`}>
              {selectedPullRequestDisplay}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openPullRequestDialog}>
            <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
            Pull Requests
            <Kbd>P</Kbd>
          </Button>
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
          <Button variant="outline" size="sm" onClick={openCommandPalette}>
            <Command className="h-3.5 w-3.5" aria-hidden="true" />
            Command
            <Kbd>⌘K</Kbd>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsDialogOpen(true)}>
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Settings
          </Button>
          <Button variant="ghost" size="icon" aria-label={themeLabel} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </header>

      <main className="relative h-[calc(100vh-3rem)] min-h-0 overflow-hidden bg-background">
        <aside aria-label="File explorer" className="pane-scroll-y sr-only">
            <section className="border-b border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Files</h2>
                <Badge variant="info">
                  {fileChangeCounts.viewed}/{fileChangeCounts.total} viewed
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="outline" onClick={openPullRequestDialog}>
                  PRs
                  <Kbd>P</Kbd>
                </Button>
                <Button size="sm" variant="outline" onClick={openThreadDialog} disabled={reviewThreadViews.length === 0}>
                  Threads
                  <Kbd>T</Kbd>
                </Button>
                <Button size="sm" variant="outline" onClick={openHotspotsDialog} disabled={reviewOverview.hotspots.length === 0}>
                  Hotspots
                  <Kbd>S</Kbd>
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">
                  Viewed
                  <select
                    aria-label="File viewed"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                    onChange={(event) => updateFileChangeFilter("viewed", event.target.value as FileChangeFilters["viewed"])}
                    value={fileChangeFilters.viewed}
                  >
                    <option value="all">All</option>
                    <option value="viewed">Viewed</option>
                    <option value="unviewed">Unviewed</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Kind
                  <select
                    aria-label="File kind"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                    onChange={(event) => updateFileChangeFilter("kind", event.target.value as FileChangeFilters["kind"])}
                    value={fileChangeFilters.kind}
                  >
                    <option value="all">All</option>
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="binary">Binary</option>
                    <option value="non-text">Non-text</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="p-2" aria-label="File tree">
              {fileExplorerRows.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">No files match these filters.</p>
              ) : (
                <div className="space-y-0.5">
                  {fileExplorerRows.map((row) =>
                    row.type === "directory" ? (
                      <div
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground"
                        key={row.id}
                        style={{ paddingLeft: `${row.depth * 14 + 8}px` }}
                      >
                        <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        <Folder className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="min-w-0 truncate">{row.name}</span>
                      </div>
                    ) : (
                      <button
                        aria-pressed={selectedFileChange?.id === row.view.id}
                        className={cn(
                          "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                          selectedFileChange?.id === row.view.id && "bg-accent text-accent-foreground",
                        )}
                        key={row.id}
                        onClick={() => setSelectedFileChangeId(row.view.id)}
                        style={{ paddingLeft: `${row.depth * 14 + 8}px` }}
                        type="button"
                      >
                        {row.view.viewed ? (
                          <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                        {row.threadCount > 0 && <Badge variant="info">{row.threadCount}</Badge>}
                        {row.hotspot && row.hotspot.score > 0 && (
                          <Badge variant={row.hotspot.score > 80 ? "danger" : "warning"}>{row.hotspot.score}</Badge>
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
              {fileChangeCounts.nonText > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {fileChangeCounts.nonText} binary or non-text change{fileChangeCounts.nonText === 1 ? "" : "s"} included.
                </p>
              )}
            </section>
        </aside>

        <section aria-label="Review canvas" className="relative h-full min-h-0 min-w-0 overflow-hidden">
          <div className="absolute left-4 right-4 top-4 z-30 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur xl:right-[26rem]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                aria-label="Current Pull Request"
                className="flex min-w-0 w-72 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1"
                role="group"
                title={`${selectedPullRequestDisplay} · ${selectedPullRequestTitle}`}
              >
                <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-semibold leading-none">{selectedPullRequestTitle}</span>
                    <Badge className="shrink-0" variant={selectedPullRequest.isDraft ? "warning" : "info"}>
                      #{selectedPullRequest.number}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-[11px] leading-none text-muted-foreground">{selectedPullRequest.repository}</p>
                </div>
              </div>
              <div className="hidden min-w-0 items-center gap-2 2xl:flex">
                <Badge className="shrink-0 whitespace-nowrap" variant={selectedReviewThread ? "danger" : selectedPullRequestLoadingData ? "info" : "muted"}>
                  {selectedReviewThread ? "Needs attention" : selectedPullRequestLoadingData ? "Loading" : "No thread"}
                </Badge>
                <span className="truncate text-sm font-medium">{activeThreadFile}</span>
                {activeThreadLine !== null && <span className="shrink-0 text-xs text-muted-foreground">line {activeThreadLine}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                aria-label="Open selected Review Thread"
                variant="outline"
                size="sm"
                onClick={() => setReviewThreadDialogOpen(true)}
                disabled={!selectedReviewThread}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Review Thread
              </Button>
              <Button
                aria-label="Refresh current Pull Request"
                variant="outline"
                size="sm"
                onClick={refreshCurrentPullRequest}
                disabled={!activePullRequestKey || selectedPullRequestLoadingData}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", selectedPullRequestLoadingData && "animate-spin")} aria-hidden="true" />
                Refresh PR
                <Kbd>⌃R</Kbd>
              </Button>
              <Button variant="outline" size="sm" onClick={() => openReviewTargetDiff()} disabled={!selectedReviewPathItem}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Diff
                <Kbd>D</Kbd>
              </Button>
            </div>
          </div>

          <div aria-label="Review queue summary" className="sr-only">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Queues</span>
              {queueButtons.map((queue) => (
                <Button
                  aria-pressed={activeQueue.id === queue.id}
                  key={queue.id}
                  onClick={() => applyReviewQueueFilters(queue.filters)}
                  size="sm"
                  variant={activeQueue.id === queue.id ? "secondary" : "ghost"}
                >
                  {queue.label}
                  <Badge variant={queue.tone}>{queue.count}</Badge>
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={openThreadDialog} disabled={reviewThreadViews.length === 0}>
                Browse threads
                <Kbd>T</Kbd>
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredReviewThreads.length} matching filters · {selectedBulkThreadIds.length} selected
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-24 text-xs text-muted-foreground">
                Source
                <select
                  aria-label="Source"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  onChange={(event) => updateReviewQueueFilter("origin", event.target.value as ReviewOriginFilter)}
                  value={reviewQueueFilters.origin}
                >
                  <option value="all">All</option>
                  <option value="coderabbit">CodeRabbit</option>
                  <option value="human">Human</option>
                </select>
              </label>
              <label className="min-w-24 text-xs text-muted-foreground">
                Reviewed
                <select
                  aria-label="Reviewed"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  onChange={(event) => updateReviewQueueFilter("reviewed", event.target.value as ReviewReviewedFilter)}
                  value={reviewQueueFilters.reviewed}
                >
                  <option value="all">All</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="unreviewed">Unreviewed</option>
                </select>
              </label>
              <label className="min-w-24 text-xs text-muted-foreground">
                State
                <select
                  aria-label="State"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  onChange={(event) => updateReviewQueueFilter("state", event.target.value as ReviewStateFilter)}
                  value={reviewQueueFilters.state}
                >
                  <option value="all">All</option>
                  <option value="current">Current</option>
                  <option value="unresolved">Unresolved</option>
                  <option value="resolved">Resolved</option>
                  <option value="outdated">Outdated</option>
                </select>
              </label>
              <div aria-label="Bulk review actions" className="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleAllFilteredThreadSelection(!allFilteredThreadsSelected)} disabled={renderedReviewThreads.length === 0}>
                  {allFilteredThreadsSelected ? "Clear visible" : "Select visible"}
                  <Kbd>A</Kbd>
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyBulkReviewedState(true)} disabled={selectedBulkThreads.length === 0}>
                  Bulk mark reviewed
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyBulkReviewedState(false)} disabled={selectedBulkThreads.length === 0}>
                  Bulk mark unreviewed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkConfirmAction("resolve")}
                  disabled={selectedBulkThreads.length === 0 || !canPublishReviewThreads || threadActionBusy !== null}
                  title={!canPublishReviewThreads ? (reviewThreadWriteDisabledReason ?? undefined) : undefined}
                >
                  Resolve selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkConfirmAction("unresolve")}
                  disabled={selectedBulkThreads.length === 0 || !canPublishReviewThreads || threadActionBusy !== null}
                  title={!canPublishReviewThreads ? (reviewThreadWriteDisabledReason ?? undefined) : undefined}
                >
                  Unresolve selected
                </Button>
                {bulkUndo && (
                  <Button size="sm" variant="ghost" onClick={undoBulkReviewedState}>
                    Undo
                  </Button>
                )}
              </div>
            </div>
            {(bulkUndo || bulkActionResult) && (
              <div className="mt-2 space-y-1 text-xs" role="status">
                {bulkUndo && <p className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{bulkUndo.message}</p>}
                {bulkActionResult && (
                  <div className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                    <p>{bulkActionResult.message}</p>
                    {bulkActionResult.failures.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {bulkActionResult.failures.map((failure) => (
                          <p key={failure.id}>
                            {failure.id}: {failure.message}
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
                  </div>
                )}
              </div>
            )}
          </div>

          <div aria-label="Review canvas scroll area" className="pane-scroll absolute inset-0" ref={reviewCanvasScrollRef}>
            <section className="relative h-full min-h-full overflow-hidden bg-background" aria-label="Review overview">
              <div className="mt-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">
                    {reviewOverview.repository} #{reviewOverviewCache.metadata.number} by {reviewOverview.author}
                  </p>
                  <h2 className="mt-1 truncate text-base font-semibold">{reviewOverview.title}</h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{reviewOverview.branch}</p>
                  {selectedPullRequestLoadingData && (
                    <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">Loading Pull Request files, checks, and review threads from GitHub.</p>
                  )}
                  {pullRequestDataStatus.key === activePullRequestKey && pullRequestDataStatus.state === "loaded" && (
                    <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground" role="status">
                      {pullRequestDataStatus.message}
                    </p>
                  )}
                  {pullRequestDataStatus.key === activePullRequestKey && pullRequestDataStatus.state === "failed" && (
                    <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{pullRequestDataStatus.message}</p>
                  )}
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

              <section className="sr-only" aria-label="Review clone health">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span>Review Clone</span>
                      <Badge variant={reviewCloneBadge.variant}>{reviewCloneBadge.label}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{selectedReviewCloneStatus.storagePath}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void ensureReviewCloneForRepository(selectedPullRequest.repository)}
                    disabled={selectedReviewCloneBusy}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", selectedReviewCloneBusy && "animate-spin")} aria-hidden="true" />
                    {getReviewCloneActionLabel(selectedReviewCloneStatus.state)}
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Storage</p>
                    <p className="mt-1 truncate font-medium">App-managed</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Clone boundary</p>
                    <p className="mt-1 truncate font-medium">{selectedReviewCloneStatus.readOnly ? "Read-only analysis" : "Writable"}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">GitHub writes</p>
                    <Badge variant={reviewCloneWriteBadge.variant}>{reviewCloneWriteBadge.label}</Badge>
                  </div>
                </div>
                {!selectedReviewCloneStatus.writePermission && (
                  <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                    GitHub write access is needed to publish line-level and file-level Review Threads. You can still inspect this Pull Request, navigate the Attention Map, and update local Reviewed state.
                  </p>
                )}
                <div className="mt-2 rounded-md border border-border bg-background/70 p-2 text-xs" aria-label="Pull Request analysis input">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">PR head input</span>
                    <Badge variant={analysisInputBadge.variant}>{analysisInputBadge.label}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                    <p className="truncate">
                      Head {selectedAnalysisInputStatus.headSha ? selectedAnalysisInputStatus.headSha.slice(0, 7) : "pending"}
                    </p>
                    <p className="truncate">
                      Compare{" "}
                      {selectedAnalysisInputStatus.mergeBaseSha
                        ? selectedAnalysisInputStatus.mergeBaseSha.slice(0, 7)
                        : selectedAnalysisInputStatus.comparisonRef ?? "pending"}
                    </p>
                  </div>
                </div>
                {(selectedReviewCloneStatus.message || reviewCloneMessage) && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground" role="status">
                    {reviewCloneMessage ?? selectedReviewCloneStatus.message}
                  </p>
                )}
              </section>

              <section className="order-first absolute inset-0 overflow-hidden bg-background" aria-label="Attention map">
                <div className="pointer-events-none absolute left-4 top-[5rem] z-20 max-w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                        <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span>Attention Map</span>
                        <Badge variant="muted">Index v{analysisIndex.analysisVersion}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Head {analysisIndex.headSha === "head-unavailable" ? "pending" : analysisIndex.headSha.slice(0, 7)} ·{" "}
                        {attentionMapPresentation.summary.files} files · {attentionMapPresentation.summary.relationships} edges
                      </p>
                    </div>
                    <Badge variant={attentionMapPresentation.summary.fallbackNodes > 0 ? "warning" : "success"}>
                      {attentionMapPresentation.nodes.length} nodes · {reviewTargets.length} targets
                    </Badge>
                  </div>
                </div>
                <div className="sr-only">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span>Attention Map</span>
                      <Badge variant="muted">Index v{analysisIndex.analysisVersion}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Head {analysisIndex.headSha === "head-unavailable" ? "pending" : analysisIndex.headSha.slice(0, 7)} ·{" "}
                      {analysisIndex.storageScope === "local-storage-outside-review-clone" ? "Stored outside Review Clone" : "Stored"}
                    </p>
                  </div>
                  <Badge variant={attentionMapPresentation.summary.fallbackNodes > 0 ? "warning" : "success"}>
                    {attentionMapPresentation.nodes.length} nodes · {reviewTargets.length} targets
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs lg:grid-cols-7">
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Files</p>
                    <p className="mt-1 font-semibold">{attentionMapPresentation.summary.files}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Symbols</p>
                    <p className="mt-1 font-semibold">{attentionMapPresentation.summary.symbolNodes}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Context</p>
                    <p className="mt-1 font-semibold">{attentionMapPresentation.summary.contextNodes}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Hunks</p>
                    <p className="mt-1 font-semibold">{attentionMapPresentation.summary.hunkNodes}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Fallbacks</p>
                    <p className="mt-1 font-semibold">{attentionMapPresentation.summary.fallbackNodes}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Clusters</p>
                    <p className="mt-1 font-semibold">{attentionMapPresentation.summary.generatedClusters}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-muted-foreground">Edges</p>
                    <p className="mt-1 font-semibold">{attentionMapPresentation.summary.relationships}</p>
                  </div>
                </div>
                </div>
                <div className="absolute inset-0">
                  <ReviewTargetFlow
                    attentionEdges={attentionMapPresentation.edges}
                    items={reviewPathItems}
                    needsReReviewTargetIds={needsReReviewTargetIds}
                    onOpenTarget={openReviewTargetDiff}
                    onSelectTarget={selectReviewTarget}
                    reviewedTargetIds={reviewedTargetIds}
                    selectedTargetId={selectedReviewTargetId}
                  />
                  <aside aria-label="Review Path" className="absolute bottom-4 right-4 top-[5rem] z-20 flex w-[min(24rem,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/95 p-3 shadow-xl backdrop-blur xl:top-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">Review Path</h3>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {reviewWorkProgress.combinedRemaining} remaining · target order is generated
                        </p>
                      </div>
                      <Badge variant="info">{activeReviewPathItems.length} active</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs" aria-label="Review Work">
                      <div className="rounded-md bg-muted p-2">
                        <p className="text-muted-foreground">Targets</p>
                        <p className="mt-1 font-semibold">
                          {reviewWorkProgress.targets.reviewed}/{reviewWorkProgress.targets.total}
                        </p>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <p className="text-muted-foreground">Threads</p>
                        <p className="mt-1 font-semibold">
                          {reviewWorkProgress.threads.reviewed}/{reviewWorkProgress.threads.total}
                        </p>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <p className="text-muted-foreground">Remaining</p>
                        <p className="mt-1 font-semibold">{reviewWorkProgress.combinedRemaining}</p>
                      </div>
                    </div>
                    {selectedReviewPathItem && (
                      <div className="mt-3 rounded-md border border-border p-2 text-xs" aria-label="Selected Review Target">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-mono font-semibold">{getReviewTargetPrimaryLabel(selectedReviewPathItem.target)}</p>
                            <p className="mt-1 truncate text-muted-foreground">{getReviewTargetScopeLabel(selectedReviewPathItem.target)}</p>
                            <span className="sr-only">{selectedReviewPathItem.target.title}</span>
                          </div>
                          <Badge
                            variant={
                              reviewedTargetIds.has(selectedReviewPathItem.id)
                                ? "success"
                                : needsReReviewTargetIds.has(selectedReviewPathItem.id)
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {needsReReviewTargetIds.has(selectedReviewPathItem.id) ? "Needs re-review" : `#${selectedReviewPathItem.order}`}
                          </Badge>
                        </div>
                        <p className="mt-2 max-h-8 overflow-hidden leading-4 text-muted-foreground">{selectedReviewPathItem.orderingReasons.join(", ")}</p>
                        <Button
                          className="mt-2 w-full"
                          onClick={() => toggleSelectedReviewTargetReviewed()}
                          size="sm"
                          variant="outline"
                        >
                          {reviewedTargetIds.has(selectedReviewPathItem.id) ? "Mark target active" : "Mark target reviewed"}
                          <Kbd>R</Kbd>
                        </Button>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button onClick={() => openReviewTargetDiff(selectedReviewPathItem.id)} size="sm" variant="secondary">
                            Open diff
                            <Kbd>D</Kbd>
                          </Button>
                          <Button onClick={openReviewTargetComment} size="sm" variant="secondary">
                            Comment
                            <Kbd>C</Kbd>
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {activeReviewPathItems.map((item) => (
                        <button
                          aria-pressed={selectedReviewTargetId === item.id}
                          className={cn(
                            "w-full rounded-md border border-border p-2 text-left text-xs hover:bg-accent",
                            selectedReviewTargetId === item.id && "border-primary bg-accent text-accent-foreground",
                          )}
                          key={item.id}
                          onClick={() => selectReviewTarget(item.id)}
                          onDoubleClick={() => openReviewTargetDiff(item.id)}
                          title={item.target.title}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono font-semibold">
                                {item.order}. {getReviewTargetPrimaryLabel(item.target)}
                              </p>
                              <p className="mt-1 truncate text-muted-foreground">{getReviewTargetScopeLabel(item.target)}</p>
                              <span className="sr-only">{item.target.title}</span>
                            </div>
                            <Badge variant={item.hotspotScore > 0 ? "warning" : "muted"}>
                              {item.hotspotScore > 0 ? getReviewTargetScoreLabel(item.hotspotScore) : "No score"}
                            </Badge>
                          </div>
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-0.5">{getReviewTargetKindLabel(item.target)}</span>
                            <span>{item.target.size.changedLines} lines</span>
                            {item.target.size.reviewThreads > 0 && <span>{item.target.size.reviewThreads} thread{item.target.size.reviewThreads === 1 ? "" : "s"}</span>}
                          </div>
                          {needsReReviewTargetIds.has(item.id) && <Badge variant="warning">Needs re-review</Badge>}
                        </button>
                      ))}
                      {activeReviewPathItems.length === 0 && (
                        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">No active Review Targets.</p>
                      )}
                    </div>
                    {reviewedReviewPathItems.length > 0 && (
                      <details className="mt-3 rounded-md border border-border p-2 text-xs" aria-label="Reviewed Review Targets">
                        <summary className="cursor-pointer font-medium text-muted-foreground">
                          Reviewed targets ({reviewedReviewPathItems.length})
                        </summary>
                        <div className="mt-2 space-y-1">
                          {reviewedReviewPathItems.map((item) => (
                            <button
                              className="w-full rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-accent"
                              key={item.id}
                              onClick={() => selectReviewTarget(item.id)}
                              type="button"
                            >
                              {item.order}. {getReviewTargetPrimaryLabel(item.target)}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </aside>
                </div>
              </section>

              <details className="mt-3 rounded-md border border-border bg-card/60" aria-label="Pull Request summary">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">PR Summary</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{getPullRequestSummaryPreview(reviewOverview.description)}</p>
                  </div>
                  <Badge variant="muted">Open</Badge>
                </summary>
                <div className="border-t border-border px-3 py-3">
                  <MarkdownContent
                    value={reviewOverview.description}
                    emptyFallback={<p className="text-sm text-muted-foreground">No description provided.</p>}
                  />
                </div>
              </details>
            </section>

            {!activeThreadAnchoredInDiff && (
              <section className="mt-4 rounded-md border border-border bg-background p-4" aria-label="Active review thread">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Review Thread {selectedReviewThread ? selectedReviewThreadIndex + 1 : 0} of {filteredReviewThreads.length}
                    </p>
                    {activeThreadState === "outdated" && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Older diff context from a previous hunk.</p>
                    )}
                  </div>
                  {selectedReviewThread && (
                    <div className="flex items-center gap-2">
                      <Badge variant={selectedReviewThread.origin === "coderabbit" ? "warning" : "info"}>
                        {selectedReviewThread.origin === "coderabbit" ? "CodeRabbit" : "Human"}
                      </Badge>
                      <Badge variant={activeThreadState === "outdated" ? "warning" : "muted"}>{activeThreadStateLabel}</Badge>
                      {selectedReviewThread.reviewed && <Badge variant="success">Reviewed</Badge>}
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <ReviewThreadConversation thread={activeThread} emptyFallback={activeThreadBody} />
                </div>
              </section>
            )}

            <div className="diff-shell mt-4 rounded-md border border-border" aria-label="Diff viewer">
                <div className="diff-file-header flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedFileDiffState?.filePath ?? activeThreadFile}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedFileDiffState?.language ?? "text"} · {selectedFileDiffState?.kind ?? "text"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {selectedFileChange && (
                      <Badge variant={selectedFileChange.viewed ? "success" : "muted"}>
                        {selectedFileChange.viewed ? "Viewed" : "Unviewed"}
                      </Badge>
                    )}
                    <Button
                      aria-label={
                        selectedFileChange
                          ? `Mark ${selectedFileChange.file.path} ${selectedFileChange.viewed ? "unviewed" : "viewed"}`
                          : "Mark selected file viewed"
                      }
                      onClick={toggleSelectedFileViewed}
                      size="sm"
                      variant="outline"
                      disabled={!selectedFileChange}
                    >
                      {selectedFileChange?.viewed ? "Mark unviewed" : "Mark viewed"}
                      <Kbd>V</Kbd>
                    </Button>
                    <Button
                      aria-pressed={diffMode === "unified"}
                      onClick={() => setDiffMode("unified")}
                      size="sm"
                      variant={diffMode === "unified" ? "secondary" : "outline"}
                    >
                      <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Unified
                    </Button>
                    <Button
                      aria-pressed={diffMode === "side-by-side"}
                      onClick={() => setDiffMode("side-by-side")}
                      size="sm"
                      variant={diffMode === "side-by-side" ? "secondary" : "outline"}
                    >
                      <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Side-by-side
                    </Button>
                  </div>
                </div>

                {!selectedFileChange || !selectedFileDiffState ? (
                  <p className="p-3 text-sm text-muted-foreground">No File Change selected.</p>
                ) : selectedFileDiffState.kind !== "text" ? (
                  <div className="space-y-3 p-4">
                    <Badge variant="warning">{getFileKindLabel(selectedFileDiffState.kind)} fallback</Badge>
                    <p className="text-sm text-muted-foreground">
                      Narview lists this File Change, but rich diff preview is unavailable for this file type.
                    </p>
                    <a
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                      href={selectedFileDiffState.githubUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Open in GitHub
                    </a>
                  </div>
                ) : (
                  <div className="diff-content divide-y divide-border">
                    {selectedFileDiffState.hunks.length === 0 && (
                      <div className="space-y-2 p-4">
                        <p className="text-sm font-medium">No cached text diff for this file.</p>
                        <p className="text-sm text-muted-foreground">
                          GitHub did not return a patch for this file, or Narview skipped it because the patch is too large.
                        </p>
                        <a
                          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                          href={selectedFileDiffState.githubUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Open in GitHub
                        </a>
                      </div>
                    )}
                    {selectedFileDiffState.hunks.map((hunk) => (
                      <div key={hunk.id}>
                        <div className="diff-hunk-header flex items-center justify-between gap-2 px-3 py-2">
                          <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">{hunk.header}</p>
                          {!hunk.loaded ? (
                            <Button size="sm" variant="outline" onClick={() => loadDiffHunk(selectedFileChange.id, selectedFileChange.file, hunk.id)}>
                              Load hunk
                            </Button>
                          ) : hunk.expandable && !hunk.expanded ? (
                            <Button size="sm" variant="outline" onClick={() => expandDiffHunk(selectedFileChange.id, hunk.id)}>
                              Expand context
                            </Button>
                          ) : hunk.expandable ? (
                            <Badge variant="muted">Context expanded</Badge>
                          ) : null}
                        </div>
                        {hunk.loaded ? (
                          diffMode === "unified" ? (
                            <div className="diff-code-grid font-mono text-xs">
                              {hunk.lines.map((line, lineIndex) => {
                                const lineKey = `${hunk.id}:${lineIndex}`;
                                const showInlineThread = selectedReviewThread && activeThreadAnchorKey === lineKey;

                                return (
                                  <div className="contents" key={lineKey}>
                                    <div
                                      className={cn(
                                        "diff-row grid grid-cols-[52px_52px_24px_max-content] border-t first:border-t-0",
                                        getDiffLineClass(line.kind),
                                        showInlineThread && "diff-row-comment-anchor",
                                      )}
                                    >
                                      <div className="diff-gutter px-2 py-1 text-right">{line.oldLine ?? ""}</div>
                                      <div className="diff-gutter px-2 py-1 text-right">{line.newLine ?? ""}</div>
                                      <div className="diff-marker px-1 py-1 text-center">{getDiffPrefix(line.kind)}</div>
                                      <div className="diff-code-cell py-1 pl-2 pr-8">
                                        <DiffCodeLine line={line} />
                                      </div>
                                    </div>
                                    {showInlineThread && (
                                      <InlineReviewThread
                                        anchorRef={activeInlineThreadRef}
                                        canResolve={canPublishReviewThreads}
                                        onResolveState={(view) =>
                                          void runReviewThreadStateAction(view, view.thread.state === "resolved" ? "unresolve" : "resolve")
                                        }
                                        onSelect={(view) => setSelectedReviewThreadId(view.id)}
                                        onToggleReviewed={(view) => handleSetReviewThreadReviewed(view.id, !view.reviewed)}
                                        pathCount={filteredReviewThreads.length}
                                        pathIndex={selectedReviewThreadIndex + 1}
                                        resolveBusy={threadActionBusy === "resolve" || threadActionBusy === "unresolve"}
                                        stateLabel={activeThreadStateLabel}
                                        view={selectedReviewThread}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="diff-code-grid font-mono text-xs">
                              {hunk.lines.map((line, lineIndex) => {
                                const lineKey = `${hunk.id}:${lineIndex}`;
                                const showInlineThread = selectedReviewThread && activeThreadAnchorKey === lineKey;

                                return (
                                  <div className="contents" key={lineKey}>
                                    <div
                                      className={cn(
                                        "diff-side-row grid border-t border-border",
                                        showInlineThread && "diff-row-comment-anchor",
                                      )}
                                    >
                                      <div className={cn("diff-side-cell grid border-r", line.kind === "addition" ? "diff-side-placeholder" : getDiffLineClass(line.kind))}>
                                        <span className="diff-gutter px-2 py-1 text-right">{line.oldLine ?? ""}</span>
                                        <span className="diff-marker px-1 py-1 text-center">{line.kind === "deletion" ? "-" : " "}</span>
                                        <span className="diff-code-cell py-1 pl-2 pr-8">
                                          {line.kind !== "addition" ? <DiffCodeLine line={line} /> : <span className="diff-code-line"> </span>}
                                        </span>
                                      </div>
                                      <div className={cn("diff-side-cell grid", line.kind === "deletion" ? "diff-side-placeholder" : getDiffLineClass(line.kind))}>
                                        <span className="diff-gutter px-2 py-1 text-right">{line.newLine ?? ""}</span>
                                        <span className="diff-marker px-1 py-1 text-center">{line.kind === "addition" ? "+" : " "}</span>
                                        <span className="diff-code-cell py-1 pl-2 pr-8">
                                          {line.kind !== "deletion" ? <DiffCodeLine line={line} /> : <span className="diff-code-line"> </span>}
                                        </span>
                                      </div>
                                    </div>
                                    {showInlineThread && (
                                      <InlineReviewThread
                                        anchorRef={activeInlineThreadRef}
                                        canResolve={canPublishReviewThreads}
                                        onResolveState={(view) =>
                                          void runReviewThreadStateAction(view, view.thread.state === "resolved" ? "unresolve" : "resolve")
                                        }
                                        onSelect={(view) => setSelectedReviewThreadId(view.id)}
                                        onToggleReviewed={(view) => handleSetReviewThreadReviewed(view.id, !view.reviewed)}
                                        pathCount={filteredReviewThreads.length}
                                        pathIndex={selectedReviewThreadIndex + 1}
                                        resolveBusy={threadActionBusy === "resolve" || threadActionBusy === "unresolve"}
                                        stateLabel={activeThreadStateLabel}
                                        view={selectedReviewThread}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )
                        ) : (
                          <p className="p-3 text-sm text-muted-foreground">Hunk not loaded yet.</p>
                        )}
                      </div>
                    ))}

                    <div className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchWholeFile(selectedFileChange.id)}
                        disabled={Boolean(selectedFileDiffState.fullFileLines)}
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        View whole file
                      </Button>
                      {fullFileLineWindow && (
                        <div className="diff-full-file mt-3 rounded-md border border-border" aria-label="Full file view">
                          {fullFileLineWindow.items.map((line, lineIndex) => (
                            <div className={cn("diff-row grid grid-cols-[52px_24px_max-content] border-b last:border-b-0 font-mono text-xs", getDiffLineClass(line.kind))} key={`full-${lineIndex}`}>
                              <div className="diff-gutter px-2 py-1 text-right">{line.newLine ?? line.oldLine ?? ""}</div>
                              <div className="diff-marker px-1 py-1 text-center">{getDiffPrefix(line.kind)}</div>
                              <div className="diff-code-cell py-1 pl-2 pr-8">
                                <DiffCodeLine line={line} />
                              </div>
                            </div>
                          ))}
                          {fullFileLineWindow.omitted > 0 && (
                            <p className="border-t border-border p-2 text-xs text-muted-foreground">
                              Showing {fullFileLineWindow.rendered} of {fullFileLineWindow.total} full-file lines.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Keyboard className="h-3.5 w-3.5" aria-hidden="true" /> Keyboard Flow</span>
                <span>Next target <Kbd>K</Kbd></span>
                <span>Previous target <Kbd>J</Kbd></span>
                <span>Threads <Kbd>T</Kbd></span>
                <span>Refresh PR <Kbd>⌃R</Kbd></span>
                <span>Target reviewed <Kbd>R</Kbd></span>
                <span>Resolve <Kbd>E</Kbd></span>
                <span>Reply <Kbd>⇧R</Kbd></span>
                <span>Diff <Kbd>D</Kbd></span>
                <span>Comment <Kbd>C</Kbd></span>
                <span>File viewed <Kbd>V</Kbd></span>
                <span>Select visible <Kbd>A</Kbd></span>
                <span>Handoff <Kbd>H</Kbd></span>
              </div>
            </div>
        </section>

        {!reviewThreadDialogOpen && !startReviewThreadDialogOpen && (
          <aside aria-label="Inspector" className="pane-scroll-y sr-only">
            <ReviewTargetInspector
              baseComparisonOpen={targetBaseComparisonOpen}
              model={selectedReviewTargetInspector}
              onOpenFile={selectFilePathInDiff}
              onToggleBaseComparison={() => setTargetBaseComparisonOpen((open) => !open)}
              onToggleReviewed={() => {
                if (selectedReviewPathItem) {
                  setReviewTargetReviewed(selectedReviewPathItem.id, !reviewedTargetIds.has(selectedReviewPathItem.id));
                }
              }}
              reviewState={selectedReviewPathItem ? (reviewTargetReviewStates[selectedReviewPathItem.id] ?? "unreviewed") : "unreviewed"}
            />
            <StartReviewThreadPanel
              body={newThreadBody}
              fileAnchor={fileThreadAnchorState.anchor}
              fileDisabledReason={fileThreadDisabledReason}
              lineAnchors={lineThreadAnchorState.anchors}
              lineDisabledReason={lineThreadDisabledReason}
              mode={newThreadMode}
              onBodyChange={setNewThreadBody}
              onMarkOriginReviewed={() => {
                if (newThreadOriginTargetId) {
                  setReviewTargetReviewed(newThreadOriginTargetId, true);
                }
              }}
              onModeChange={setNewThreadMode}
              onSelectLineAnchor={setSelectedNewThreadLineAnchorId}
              onStartFileThread={() => void runStartReviewThread("file")}
              onStartLineThread={() => void runStartReviewThread("line")}
              result={newThreadResult}
              selectedLineAnchorId={selectedNewThreadLineAnchor?.id ?? ""}
              targetTitle={selectedReviewTargetInspector?.target.title ?? null}
              threadActionBusy={threadActionBusy}
              canMarkOriginReviewed={Boolean(
                newThreadOriginTargetId &&
                  newThreadOriginTargetId === selectedReviewPathItem?.id &&
                  !reviewedTargetIds.has(newThreadOriginTargetId),
              )}
            />
            <div className="border-b border-border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span>Review Thread</span>
                </div>
                <Badge variant={selectedReviewThread ? "info" : "muted"}>{selectedReviewThread ? "Selected" : "None"}</Badge>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Author</dt>
                  <dd className="min-w-0 truncate">@{activeThreadAuthor ?? "unknown"}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">File</dt>
                  <dd className="min-w-0 truncate">{activeThreadFile}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Line</dt>
                  <dd>{activeThreadLine ?? "None"}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">State</dt>
                  <dd className="flex items-center gap-1">
                    <Badge variant={activeThreadState === "outdated" ? "warning" : "muted"}>{activeThreadStateLabel}</Badge>
                    {selectedReviewThread?.reviewed && <Badge variant="success">Reviewed</Badge>}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-2 border-b border-border p-3">
              {reviewThreadWriteDisabledReason && (
                <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                  {reviewThreadWriteDisabledReason}
                </p>
              )}
              <textarea
                aria-label="Reply body"
                className="min-h-20 w-full resize-none rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setReplyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void runThreadAction("reply");
                  }
                }}
                placeholder="Reply to this Review Thread"
                value={replyDraft}
                disabled={!canPublishReviewThreads}
              />
              <Button
                className="w-full justify-between"
                variant="default"
                onClick={() => void runThreadAction("reply")}
                disabled={!replyCanSubmit}
              >
                Submit reply
                <Kbd>⌘↵</Kbd>
              </Button>
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
                onClick={() => void runThreadAction(threadResolveAction)}
                disabled={!selectedReviewThread || !canPublishReviewThreads || threadActionBusy !== null}
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

            <div className="space-y-3 border-b border-border p-3" aria-label="Live checks">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <RefreshCw className={cn("h-4 w-4", selectedPullRequestRefreshingChecks && "animate-spin")} aria-hidden="true" />
                  <span>Live Checks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={liveChecksBadge.variant}>{liveChecksBadge.label}</Badge>
                  <Button
                    aria-label="Refresh live checks"
                    title={liveChecksRefreshDisabledReason ?? "Refresh GitHub Actions checks"}
                    size="icon"
                    variant="ghost"
                    onClick={() => void refreshSelectedPullRequestChecks(selectedPullRequest)}
                    disabled={!liveChecksCanRefresh}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", selectedPullRequestRefreshingChecks && "animate-spin")} aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">Passing</p>
                  <p className="mt-1 text-sm font-semibold">{reviewOverview.checks.passing}</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">Running</p>
                  <p className="mt-1 text-sm font-semibold">{reviewOverview.checks.pending}</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">Failing</p>
                  <p className="mt-1 text-sm font-semibold">{reviewOverview.checks.failing}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Last synced {getLastCheckedLabel(reviewOverviewCache.fetchedAtEpochMs)}</span>
                {reviewOverview.checks.pending > 0 && <span>Auto-refreshing</span>}
              </div>

              {checkRefreshStatus.key === activePullRequestKey && checkRefreshStatus.message && (
                <p
                  className={cn(
                    "rounded-md p-2 text-xs",
                    checkRefreshStatus.state === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                  )}
                  role="status"
                >
                  {checkRefreshStatus.message}
                </p>
              )}

              <div className="pane-scroll-y max-h-56 space-y-2 pr-1">
                {reviewOverview.checks.details.length > 0 ? (
                  reviewOverview.checks.details.map((check) => {
                    const checkBadge = getCheckBadge(check.status, check.conclusion);

                    return (
                      <div className="rounded-md border border-border bg-background/70 p-2 text-sm" key={check.name}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium">{check.name}</span>
                          <Badge variant={checkBadge.variant}>{checkBadge.label}</Badge>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{check.timingLabel}</span>
                          {check.url ? (
                            <Button
                              aria-label={`Open ${check.name} check details`}
                              className="h-6 px-1.5"
                              size="sm"
                              variant="ghost"
                              onClick={() => void openUrl(check.url as string)}
                            >
                              Details
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          ) : (
                            <span>No link</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                    No GitHub Actions checks are loaded for this Pull Request.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 border-b border-border p-3" aria-label="Handoff packet">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
                <span>{handoffPacketMode === "human-feedback" ? "Human Feedback Packet" : "Handoff Packet"}</span>
                <Badge variant="info">{handoffPacket.threads.length}</Badge>
              </div>
              <label className="text-xs text-muted-foreground">
                Packet
                <select
                  aria-label="Handoff packet type"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  onChange={(event) => setHandoffPacketMode(event.target.value as HandoffPacketMode)}
                  value={handoffPacketMode}
                >
                  <option value="selected-review-threads">Selected Review Threads</option>
                  <option value="human-feedback">Human Feedback</option>
                </select>
              </label>
              {handoffPacketMode === "human-feedback" && (
                <label className="flex items-center gap-2 rounded-md border border-border p-2 text-xs">
                  <input
                    aria-label="Include CodeRabbit Threads"
                    checked={humanPacketIncludeCodeRabbit}
                    onChange={(event) => setHumanPacketIncludeCodeRabbit(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Include CodeRabbit Threads</span>
                </label>
              )}
              <label className="text-xs text-muted-foreground">
                Intent
                <select
                  aria-label="Handoff intent"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  onChange={(event) => setHandoffIntentPreset(event.target.value)}
                  value={handoffIntentPreset}
                >
                  {handoffIntentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label="Custom handoff intent"
                className="min-h-16 w-full resize-none rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setHandoffCustomIntent(event.target.value)}
                placeholder="Optional custom intent"
                value={handoffCustomIntent}
              />
              <Button
                className="w-full justify-between"
                variant="outline"
                onClick={() => void copyHandoffMarkdown()}
                disabled={handoffPacket.threads.length === 0}
              >
                <span className="inline-flex items-center gap-2">
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy Markdown
                </span>
                <Kbd>H</Kbd>
              </Button>
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                {handoffPacket.threads.length} Review Thread{handoffPacket.threads.length === 1 ? "" : "s"} · no LLM calls · no code changes
              </p>
              {handoffCopyMessage && (
                <p className="rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300" role="status">
                  {handoffCopyMessage}
                </p>
              )}
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

      <Dialog.Root open={pullRequestDialogOpen} onOpenChange={(open) => (open ? setPullRequestDialogOpen(true) : closePullRequestDialog())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-8 z-50 flex max-h-[90vh] w-[min(1040px,calc(100vw-2rem))] -translate-x-1/2 flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">Open Pull Requests</Dialog.Title>
                  <Dialog.Description className="mt-1 truncate text-sm text-muted-foreground">
                    Switch Pull Requests, refresh GitHub data, or manage the saved GitHub repositories Narview watches.
                  </Dialog.Description>
                </div>
                <Kbd>P</Kbd>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-md border border-input bg-background px-3">
                  <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    autoFocus
                    aria-label="Search pull requests"
                    className="h-full flex-1 bg-transparent text-sm outline-none"
                    onChange={(event) => setPullRequestDialogQuery(event.target.value)}
                    placeholder="Search title, repo, number, author, branch"
                    value={pullRequestDialogQuery}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => void refreshPullRequests(includeDrafts, { refreshSelectedPullRequestData: true })}
                  disabled={workspaceBusy}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", workspaceBusy && "animate-spin")} aria-hidden="true" />
                  Refresh
                </Button>
                <Badge variant={refreshBadge.variant}>{refreshBadge.label}</Badge>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] overflow-hidden">
              <div className="pane-scroll-y min-h-0 border-r border-border p-3">
                {pullRequestDialogPullRequests.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground" role="status">
                    No open Pull Requests match this search.
                  </p>
                ) : (
                  <div className="grid min-w-0 gap-2" aria-label="Open Pull Request results">
                    {pullRequestDialogPullRequests.map((pullRequest, index) => {
                      const pullRequestKey = getPullRequestKey(pullRequest);
                      const selected = pullRequestKey === activePullRequestKey;
                      const shortcut = index < 9 ? String(index + 1) : index === 9 ? "0" : null;

                      return (
                        <button
                          aria-pressed={selected}
                          className={cn(
                            "min-w-0 overflow-hidden rounded-md border border-border p-3 text-left hover:bg-accent",
                            selected && "border-primary bg-accent text-accent-foreground",
                          )}
                          key={pullRequestKey}
                          onClick={() => void selectPullRequestFromDialog(pullRequest)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{pullRequest.title}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {pullRequest.repository} #{pullRequest.number}
                                {pullRequest.authorLogin ? ` · @${pullRequest.authorLogin}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {shortcut && <Kbd>{shortcut}</Kbd>}
                              {pullRequest.isDraft && <Badge variant="warning">Draft</Badge>}
                              {selected && <Badge variant="success">Current</Badge>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pane-scroll-y min-h-0 p-3" aria-label="Workspace">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Workspace</h2>
                  <Badge variant={refreshBadge.variant}>{refreshBadge.label}</Badge>
                </div>
                <form className="flex gap-2" onSubmit={handleSaveRepository}>
                  <input
                    aria-label="Repository slug"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setRepositoryInput(event.target.value)}
                    placeholder="owner/repo"
                    value={repositoryInput}
                  />
                  <Button size="sm" type="submit" disabled={workspaceBusy || !repositoryInput.trim()}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Save
                  </Button>
                </form>
                <form className="mt-2 flex gap-2" onSubmit={handleQuickOpenPullRequest}>
                  <input
                    aria-label="Pull Request URL"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setQuickOpenInput(event.target.value)}
                    placeholder="github.com/owner/repo/pull/123"
                    value={quickOpenInput}
                  />
                  <Button size="sm" type="submit" variant="outline" disabled={!quickOpenInput.trim()}>
                    Open
                  </Button>
                </form>
                <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    aria-label="Include draft Pull Requests"
                    checked={includeDrafts}
                    onChange={(event) => void handleDraftFilterChange(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  Include draft Pull Requests
                </label>

                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Saved repositories</p>
                  {repositories.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-2 text-sm text-muted-foreground">No saved repositories.</p>
                  ) : (
                    repositories.map((repository) => {
                      const cloneStatus =
                        reviewCloneStatuses[repository.slug.toLowerCase()] ??
                        createUnavailableReviewCloneStatus(repository.slug, "Review Clone status has not been checked yet.");
                      const cloneBadge = getReviewCloneBadge(cloneStatus.state);
                      const cloneBusy = reviewCloneBusyKey === repository.slug.toLowerCase() || cloneStatus.state === "cloning";

                      return (
                        <div className="rounded-md border border-border p-2 text-sm" key={repository.slug}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate">{repository.slug}</span>
                            <div className="flex shrink-0 items-center gap-1">
                              <Badge variant={cloneBadge.variant}>{cloneBadge.label}</Badge>
                              <Button
                                aria-label={`Initialize Review Clone for ${repository.slug}`}
                                size="icon"
                                variant="ghost"
                                onClick={() => void ensureReviewCloneForRepository(repository.slug)}
                                disabled={cloneBusy}
                              >
                                <RefreshCw className={cn("h-3.5 w-3.5", cloneBusy && "animate-spin")} aria-hidden="true" />
                              </Button>
                              <Button
                                aria-label={`Remove ${repository.slug}`}
                                size="icon"
                                variant="ghost"
                                onClick={() => void handleRemoveRepository(repository)}
                                disabled={workspaceBusy}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{cloneStatus.storagePath}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  {refreshStatus.message && <p className="rounded-md bg-muted p-2 text-muted-foreground">{refreshStatus.message}</p>}
                  {sessionNotice && <p className="rounded-md bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">{sessionNotice}</p>}
                  {workspaceError && <p className="rounded-md bg-destructive/10 p-2 text-destructive" role="status">{workspaceError}</p>}
                  {quickOpenError && <p className="rounded-md bg-destructive/10 p-2 text-destructive" role="status">{quickOpenError}</p>}
                  {pullRequestDataStatus.key === activePullRequestKey && pullRequestDataStatus.message && (
                    <p className="rounded-md bg-muted p-2 text-muted-foreground">{pullRequestDataStatus.message}</p>
                  )}
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={hotspotsDialogOpen} onOpenChange={(open) => (open ? setHotspotsDialogOpen(true) : closeHotspotsDialog())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-12 z-50 flex max-h-[86vh] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">Hotspots</Dialog.Title>
                  <Dialog.Description className="mt-1 truncate text-sm text-muted-foreground">
                    High-signal changed files for {selectedPullRequestDisplay}. Open one to inspect it in the diff viewer.
                  </Dialog.Description>
                </div>
                <Kbd>S</Kbd>
              </div>
            </div>
            <div className="pane-scroll-y min-h-0 p-3">
              {reviewOverview.hotspots.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground" role="status">
                  No hotspots are available for this Pull Request.
                </p>
              ) : (
                <div className="grid gap-2" aria-label="Hotspot results">
                  {reviewOverview.hotspots.map((hotspot) => (
                    <button
                      className="rounded-md border border-border p-3 text-left hover:bg-accent"
                      key={hotspot.path}
                      onClick={() => selectHotspotFile(hotspot.paths?.[0] ?? hotspot.path)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-semibold">
                            {hotspot.kind === "generated-cluster" && hotspot.fileCount
                              ? `${hotspot.path} (${hotspot.fileCount} files)`
                              : hotspot.path}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{hotspot.reasons.join(", ")}</p>
                          {hotspot.kind === "generated-cluster" && hotspot.paths && (
                            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {hotspot.paths.slice(0, 4).join(", ")}
                              {hotspot.paths.length > 4 ? `, +${hotspot.paths.length - 4} more` : ""}
                            </p>
                          )}
                        </div>
                        <Badge variant={hotspot.score > 80 ? "danger" : "warning"}>{getReviewTargetScoreLabel(hotspot.score)}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={startReviewThreadDialogOpen} onOpenChange={setStartReviewThreadDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed right-6 top-10 z-50 flex max-h-[86vh] w-[min(520px,calc(100vw-2rem))] flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">Comment on Review Target</Dialog.Title>
                  <Dialog.Description className="mt-1 truncate text-sm text-muted-foreground">
                    {selectedReviewTargetInspector?.target.title ?? "Select a Review Target from the board first."}
                  </Dialog.Description>
                </div>
                <Kbd>C</Kbd>
              </div>
            </div>
            <div className="pane-scroll-y min-h-0">
              <StartReviewThreadPanel
                body={newThreadBody}
                fileAnchor={fileThreadAnchorState.anchor}
                fileDisabledReason={fileThreadDisabledReason}
                lineAnchors={lineThreadAnchorState.anchors}
                lineDisabledReason={lineThreadDisabledReason}
                mode={newThreadMode}
                onBodyChange={setNewThreadBody}
                onMarkOriginReviewed={() => {
                  if (newThreadOriginTargetId) {
                    setReviewTargetReviewed(newThreadOriginTargetId, true);
                  }
                }}
                onModeChange={setNewThreadMode}
                onSelectLineAnchor={setSelectedNewThreadLineAnchorId}
                onStartFileThread={() => void runStartReviewThread("file")}
                onStartLineThread={() => void runStartReviewThread("line")}
                result={newThreadResult}
                selectedLineAnchorId={selectedNewThreadLineAnchor?.id ?? ""}
                targetTitle={selectedReviewTargetInspector?.target.title ?? null}
                threadActionBusy={threadActionBusy}
                canMarkOriginReviewed={Boolean(
                  newThreadOriginTargetId &&
                    newThreadOriginTargetId === selectedReviewPathItem?.id &&
                    !reviewedTargetIds.has(newThreadOriginTargetId),
                )}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={reviewThreadDialogOpen} onOpenChange={setReviewThreadDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed right-6 top-8 z-50 flex max-h-[90vh] w-[min(760px,calc(100vw-2rem))] flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">Review Thread</Dialog.Title>
                  <Dialog.Description className="mt-1 truncate text-sm text-muted-foreground">
                    {selectedReviewThread
                      ? `${activeThreadFile}${activeThreadLine !== null ? `:${activeThreadLine}` : ""}`
                      : "Select a Review Thread from the board or thread browser."}
                  </Dialog.Description>
                </div>
                <Badge variant={selectedReviewThread ? "info" : "muted"}>{selectedReviewThread ? "Selected" : "None"}</Badge>
              </div>
            </div>
            <div className="pane-scroll-y min-h-0 p-4">
              {!selectedReviewThread ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No Review Thread is selected.
                </p>
              ) : (
                <div className="space-y-4">
                  <section className="rounded-md border border-border bg-background p-3" aria-label="Review Thread details">
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Author</dt>
                        <dd className="mt-1 truncate">@{activeThreadAuthor ?? "unknown"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">State</dt>
                        <dd className="mt-1 flex items-center gap-1">
                          <Badge variant={activeThreadState === "outdated" ? "warning" : "muted"}>{activeThreadStateLabel}</Badge>
                          {selectedReviewThread.reviewed && <Badge variant="success">Reviewed</Badge>}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">File</dt>
                        <dd className="mt-1 truncate font-mono">{activeThreadFile}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Line</dt>
                        <dd className="mt-1">{activeThreadLine ?? "None"}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-md border border-border bg-background p-3" aria-label="Review Thread conversation">
                    <ReviewThreadConversation thread={activeThread} emptyFallback={activeThreadBody} />
                  </section>

                  <section className="space-y-2 rounded-md border border-border bg-background p-3" aria-label="Review Thread actions">
                    {reviewThreadWriteDisabledReason && (
                      <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                        {reviewThreadWriteDisabledReason}
                      </p>
                    )}
                    <textarea
                      aria-label="Reply body"
                      className="min-h-24 w-full resize-none rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) => setReplyDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void runThreadAction("reply");
                        }
                      }}
                      placeholder="Reply to this Review Thread"
                      value={replyDraft}
                      disabled={!canPublishReviewThreads}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        className="justify-between"
                        variant="default"
                        onClick={() => void runThreadAction("reply")}
                        disabled={!replyCanSubmit}
                      >
                        Submit reply
                        <Kbd>⌘↵</Kbd>
                      </Button>
                      <Button
                        className="justify-between"
                        variant="secondary"
                        onClick={() => handleSetSelectedThreadReviewed(!(selectedReviewThread.reviewed ?? false))}
                      >
                        {selectedReviewThread.reviewed ? "Mark unreviewed" : "Mark reviewed"}
                        <Kbd>R</Kbd>
                      </Button>
                      <Button
                        className="justify-between"
                        variant="outline"
                        onClick={() => void runThreadAction(threadResolveAction)}
                        disabled={!canPublishReviewThreads || threadActionBusy !== null}
                      >
                        {threadResolveAction === "unresolve" ? "Unresolve" : "Resolve"}
                        <Kbd>E</Kbd>
                      </Button>
                    </div>
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
                  </section>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={targetDiffDialogOpen} onOpenChange={setTargetDiffDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-8 z-50 flex max-h-[90vh] w-[min(1180px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">Review Target Diff</Dialog.Title>
                  <Dialog.Description className="mt-1 truncate text-sm text-muted-foreground">
                    {selectedReviewPathItem?.target.title ?? selectedFileDiffState?.filePath ?? "Select a Review Target first."}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button aria-label="Close Review Target Diff" size="icon" type="button" variant="ghost">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Dialog.Close>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
              <aside className="pane-scroll-y min-h-0 border-r border-border p-3" aria-label="Diff target context">
                {selectedReviewPathItem ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-border bg-background p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-semibold">{selectedReviewPathItem.target.title}</p>
                        <Badge variant={selectedReviewPathItem.hotspotScore > 0 ? "warning" : "muted"}>
                          {selectedReviewPathItem.hotspotScore > 0 ? getReviewTargetScoreLabel(selectedReviewPathItem.hotspotScore) : "No score"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{selectedReviewPathItem.orderingReasons.join(", ")}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Changed files</p>
                      {selectedReviewPathItem.target.paths.map((path) => (
                        <button
                          className={cn(
                            "w-full rounded-md border border-border p-2 text-left font-mono text-xs hover:bg-accent",
                            selectedFileDiffState?.filePath === path && "border-primary bg-accent text-accent-foreground",
                          )}
                          key={path}
                          onClick={() => selectFilePathInDiff(path)}
                          type="button"
                        >
                          <span className="block truncate">{path}</span>
                        </button>
                      ))}
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => toggleSelectedReviewTargetReviewed()}
                      size="sm"
                      variant="outline"
                    >
                      {reviewedTargetIds.has(selectedReviewPathItem.id) ? "Mark target active" : "Mark target reviewed"}
                      <Kbd>R</Kbd>
                    </Button>
                    <Button className="w-full" onClick={openReviewTargetComment} size="sm" variant="secondary">
                      Comment on target
                      <Kbd>C</Kbd>
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">No Review Target selected.</p>
                )}
              </aside>
              <div className="pane-scroll min-h-0 p-3">
                <section className="diff-shell rounded-md border border-border bg-background" aria-label="Diff dialog viewer">
                  <div className="diff-file-header flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{selectedFileDiffState?.filePath ?? activeThreadFile}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedFileDiffState?.language ?? "text"} · {selectedFileDiffState?.kind ?? "text"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {selectedFileChange && (
                        <Badge variant={selectedFileChange.viewed ? "success" : "muted"}>
                          {selectedFileChange.viewed ? "File viewed" : "File unviewed"}
                        </Badge>
                      )}
                      <Badge variant="muted">Line <Kbd>↑</Kbd><Kbd>↓</Kbd></Badge>
                      <Badge variant="muted">Comment <Kbd>C</Kbd></Badge>
                      <Badge variant="muted">Unified preview</Badge>
                    </div>
                  </div>

                  {!selectedFileChange || !selectedFileDiffState ? (
                    <p className="p-4 text-sm text-muted-foreground">No File Change selected.</p>
                  ) : selectedFileDiffState.kind !== "text" ? (
                    <div className="space-y-3 p-4">
                      <Badge variant="warning">{getFileKindLabel(selectedFileDiffState.kind)} fallback</Badge>
                      <p className="text-sm text-muted-foreground">
                        Narview lists this File Change, but rich diff preview is unavailable for this file type.
                      </p>
                      <a
                        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                        href={selectedFileDiffState.githubUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Open in GitHub
                      </a>
                    </div>
                  ) : (
                    <div className="diff-content divide-y divide-border">
                      {selectedFileDiffState.hunks.length === 0 && (
                        <div className="space-y-2 p-4">
                          <p className="text-sm font-medium">No cached text diff for this file.</p>
                          <p className="text-sm text-muted-foreground">
                            GitHub did not return a patch for this file, or Narview skipped it because the patch is too large.
                          </p>
                        </div>
                      )}
                      {selectedFileDiffState.hunks.map((hunk) => (
                        <div key={hunk.id}>
                          <div className="diff-hunk-header flex items-center justify-between gap-2 px-3 py-2">
                            <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">{hunk.header}</p>
                            {!hunk.loaded ? (
                              <Button size="sm" variant="outline" onClick={() => loadDiffHunk(selectedFileChange.id, selectedFileChange.file, hunk.id)}>
                                Load hunk
                              </Button>
                            ) : hunk.expandable && !hunk.expanded ? (
                              <Button size="sm" variant="outline" onClick={() => expandDiffHunk(selectedFileChange.id, hunk.id)}>
                                Expand context
                              </Button>
                            ) : hunk.expandable ? (
                              <Badge variant="muted">Context expanded</Badge>
                            ) : null}
                          </div>
                          {hunk.loaded ? (
                            <div className="diff-code-grid font-mono text-xs">
                              {hunk.lines.map((line, lineIndex) => {
                                const lineKey = `${hunk.id}:${lineIndex}`;
                                const lineAnchor = getDiffLineReviewAnchor(selectedFileDiffState.filePath, line, lineThreadAnchorState.anchors);
                                const anchoredThreadViews = diffDialogThreadsByLineKey.get(lineKey) ?? [];
                                const lineSelected = Boolean(lineAnchor && selectedDiffDialogLineAnchor?.id === lineAnchor.id);
                                const showComposer = Boolean(lineAnchor && inlineCommentAnchorId === lineAnchor.id);
                                const commentDisabled = !lineAnchor || !canPublishReviewThreads || threadActionBusy !== null;

                                return (
                                  <div className="contents" key={lineKey}>
                                    <div
                                      className={cn(
                                        "diff-row grid grid-cols-[36px_52px_52px_24px_max-content] border-t first:border-t-0",
                                        getDiffLineClass(line.kind),
                                        lineSelected && "diff-row-line-selected",
                                        anchoredThreadViews.length > 0 && "diff-row-comment-anchor",
                                      )}
                                      onClick={() => {
                                        if (lineAnchor) {
                                          setSelectedNewThreadLineAnchorId(lineAnchor.id);
                                        }
                                      }}
                                      onMouseEnter={() => {
                                        if (lineAnchor) {
                                          setHoveredDiffLineAnchorId(lineAnchor.id);
                                          setSelectedNewThreadLineAnchorId(lineAnchor.id);
                                        }
                                      }}
                                    >
                                      <div className="diff-comment-gutter flex items-center justify-center">
                                        {lineAnchor ? (
                                          <button
                                            aria-label={`Comment on ${lineAnchor.label}`}
                                            className="diff-line-comment-button"
                                            disabled={commentDisabled}
                                            onClick={() => openLineCommentComposer(lineAnchor)}
                                            title={reviewThreadWriteDisabledReason ?? `Comment on ${lineAnchor.label}`}
                                            type="button"
                                          >
                                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                          </button>
                                        ) : null}
                                      </div>
                                      <div className="diff-gutter px-2 py-1 text-right">{line.oldLine ?? ""}</div>
                                      <div className="diff-gutter px-2 py-1 text-right">{line.newLine ?? ""}</div>
                                      <div className="diff-marker px-1 py-1 text-center">{getDiffPrefix(line.kind)}</div>
                                      <div className="diff-code-cell py-1 pl-2 pr-8">
                                        <DiffCodeLine line={line} />
                                      </div>
                                    </div>
                                    {anchoredThreadViews.map((view) => {
                                      const filteredIndex = filteredReviewThreads.findIndex((item) => item.id === view.id);
                                      const fallbackIndex = reviewThreadViews.findIndex((item) => item.id === view.id);
                                      const pathIndex = Math.max(filteredIndex, fallbackIndex, 0) + 1;
                                      const pathCount = Math.max(filteredReviewThreads.length, reviewThreadViews.length, 1);

                                      return (
                                        <InlineReviewThread
                                          anchorRef={selectedReviewThread?.id === view.id ? activeInlineThreadRef : undefined}
                                          canResolve={canPublishReviewThreads}
                                          key={view.id}
                                          onResolveState={(threadView) =>
                                            void runReviewThreadStateAction(
                                              threadView,
                                              threadView.thread.state === "resolved" ? "unresolve" : "resolve",
                                            )
                                          }
                                          onSelect={(threadView) => setSelectedReviewThreadId(threadView.id)}
                                          onToggleReviewed={(threadView) => handleSetReviewThreadReviewed(threadView.id, !threadView.reviewed)}
                                          pathCount={pathCount}
                                          pathIndex={pathIndex}
                                          resolveBusy={threadActionBusy === "resolve" || threadActionBusy === "unresolve"}
                                          stateLabel={getThreadStateLabel(view.thread.state)}
                                          view={view}
                                        />
                                      );
                                    })}
                                    {showComposer && (
                                      <div className="diff-inline-thread diff-inline-comment-composer">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                          <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                                            New line comment · {lineAnchor?.path}:{lineAnchor?.line}
                                          </p>
                                          <Badge variant="info">{lineAnchor?.side === "LEFT" ? "Old line" : "New line"}</Badge>
                                        </div>
                                        <textarea
                                          aria-label="Line comment body"
                                          className="min-h-24 w-full resize-none rounded-md border border-input bg-background p-2 font-sans text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          disabled={!canPublishReviewThreads || threadActionBusy !== null}
                                          onChange={(event) => setNewThreadBody(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                              event.preventDefault();
                                              void runStartReviewThread("line");
                                            }
                                          }}
                                          placeholder="Write a GitHub line comment"
                                          ref={inlineCommentBodyRef}
                                          value={newThreadBody}
                                        />
                                        <div className="mt-2 flex items-center gap-2">
                                          <Button
                                            className="justify-between"
                                            disabled={!canPublishReviewThreads || threadActionBusy !== null || newThreadBody.trim().length === 0}
                                            onClick={() => void runStartReviewThread("line")}
                                            size="sm"
                                          >
                                            {threadActionBusy === "create-line" ? "Publishing..." : "Start line thread"}
                                            <Kbd>⌘↵</Kbd>
                                          </Button>
                                          <Button
                                            onClick={() => setInlineCommentAnchorId(null)}
                                            size="sm"
                                            type="button"
                                            variant="ghost"
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                        {newThreadResult && (
                                          <p
                                            className={cn(
                                              "mt-2 rounded-md p-2 font-sans text-xs",
                                              newThreadResult.ok
                                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                : newThreadResult.retryable
                                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                                  : "bg-destructive/10 text-destructive",
                                            )}
                                            role="status"
                                          >
                                            {newThreadResult.message}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="p-3 text-sm text-muted-foreground">Hunk not loaded yet.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={threadDialogOpen} onOpenChange={(open) => (open ? setThreadDialogOpen(true) : closeThreadDialog())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-10 z-50 flex max-h-[86vh] w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">Review Threads</Dialog.Title>
                  <Dialog.Description className="mt-1 truncate text-sm text-muted-foreground">
                    {selectedPullRequestDisplay} · {threadDialogSourceViews.length} matching thread
                    {threadDialogSourceViews.length === 1 ? "" : "s"}
                    {threadDialogSourceViews.length !== reviewThreadViews.length ? ` of ${reviewThreadViews.length}` : ""}
                  </Dialog.Description>
                </div>
                <Kbd>T</Kbd>
              </div>
              <div className="mt-4 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  autoFocus
                  aria-label="Search review threads"
                  className="h-full flex-1 bg-transparent text-sm outline-none"
                  onChange={(event) => setThreadDialogQuery(event.target.value)}
                  placeholder="Search title, body, file, author, state"
                  value={threadDialogQuery}
                />
                <Badge variant="muted">{threadDialogViews.length} shown</Badge>
              </div>
            </div>

            <div className="pane-scroll-y min-h-0 p-3">
              {threadDialogViews.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground" role="status">
                  No Review Threads match this search.
                </p>
              ) : (
                <div className="grid gap-2" aria-label="Review thread search results">
                  {threadDialogViews.map((view) => (
                    <button
                      aria-pressed={selectedReviewThread?.id === view.id}
                      className={cn(
                        "rounded-md border border-border p-3 text-left hover:bg-accent",
                        selectedReviewThread?.id === view.id && "border-primary bg-accent text-accent-foreground",
                        view.outdated && "border-amber-500/50 bg-amber-500/10",
                      )}
                      key={view.id}
                      onClick={() => selectThreadFromDialog(view.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{getThreadTitle(view.thread.body)}</p>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {view.thread.filePath}
                            {view.thread.line !== null ? `:${view.thread.line}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <Badge variant={view.origin === "coderabbit" ? "warning" : "info"}>
                            {view.origin === "coderabbit" ? "CodeRabbit" : "Human"}
                          </Badge>
                          <Badge variant={view.thread.state === "outdated" ? "warning" : "muted"}>
                            {getThreadStateLabel(view.thread.state)}
                          </Badge>
                          {view.reviewed && <Badge variant="success">Reviewed</Badge>}
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {stripMarkdownPreview(view.thread.body, 220)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-10 z-50 flex max-h-[86vh] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">Settings</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                    GitHub account, app updates, cached Pull Request data, and local-only diagnostics.
                  </Dialog.Description>
                </div>
                <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>

            <div className="pane-scroll-y min-h-0 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <section className="rounded-md border border-border bg-background/70 p-3" aria-label="GitHub session details">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
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
                    {authSession.storage.message && (
                      <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{authSession.storage.message}</p>
                    )}
                    {oauthFlow && (
                      <div className="space-y-2 rounded-md border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Device code</span>
                          <Kbd>{oauthFlow.userCode}</Kbd>
                        </div>
                        <a
                          className="block truncate text-xs text-sky-700 underline dark:text-sky-300"
                          href={oauthFlow.verificationUriComplete ?? oauthFlow.verificationUri}
                        >
                          {oauthFlow.verificationUri.replace("https://", "")}
                        </a>
                        <Button className="w-full justify-between" variant="secondary" onClick={handlePollSignIn} disabled={authBusy}>
                          Check sign-in
                          <Kbd>{oauthFlow.intervalSeconds}s</Kbd>
                        </Button>
                      </div>
                    )}
                    {authError && (
                      <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive" role="status">
                        {authError}
                      </p>
                    )}
                  </div>
                </section>

                <section className="rounded-md border border-border bg-background/70 p-3" aria-label="App updates">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <RefreshCw className={cn("h-4 w-4", (updater.isChecking || updater.isUpdating) && "animate-spin")} aria-hidden="true" />
                      Updates
                    </div>
                    <Badge variant={updaterBadge.variant}>{updaterBadge.label}</Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Version</span>
                      <span>v{updater.currentVersion}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Last checked</span>
                      <span>{getLastCheckedLabel(updater.lastCheckedAt)}</span>
                    </div>
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground" role="status">
                      {updater.statusMessage}
                    </p>
                    {updater.progress?.total && (
                      <div>
                        <div className="h-2 overflow-hidden rounded-full border border-border bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{
                              width: `${Math.round((updater.progress.downloaded / updater.progress.total) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {Math.round(updater.progress.downloaded / 1024)} KB / {Math.round(updater.progress.total / 1024)} KB
                        </p>
                      </div>
                    )}
                    {updater.error && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{updater.error}</p>}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => void updater.checkForUpdates()}
                      disabled={updater.isChecking || updater.isUpdating}
                    >
                      {updater.isChecking ? "Checking..." : updater.isUpdating ? "Updating..." : "Check updates"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-between"
                      onClick={() => void openUrl(appReleaseDownloadUrl)}
                    >
                      Open releases
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </section>

                <section className="rounded-md border border-border bg-background/70 p-3" aria-label="Pull Request cache">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      Pull Request Cache
                    </div>
                    <Badge variant={selectedPullRequestPinned ? "success" : "muted"}>{selectedPullRequestPinned ? "Pinned" : "Unpinned"}</Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Cached entries</span>
                      <span>{cacheSummary.entries}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Pinned entries</span>
                      <span>{cacheSummary.pinned}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Next refresh</span>
                      <span className="truncate">{buildIncrementalFetchPlan("manual").join(", ")}</span>
                    </div>
                    {rateLimitMessage && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{rateLimitMessage}</p>}
                    {cacheMessage && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{cacheMessage}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={handleTogglePin} disabled={!activePullRequestKey || !selectedCacheEntry}>
                        {selectedPullRequestPinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleClearCache}>
                        Clear GitHub cache
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="rounded-md border border-border bg-background/70 p-3" aria-label="Privacy and diagnostics">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      Privacy & Diagnostics
                    </div>
                    <Badge variant={telemetryPolicy.enabled ? "warning" : "success"}>
                      {telemetryPolicy.enabled ? "Telemetry on" : "Telemetry off"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-muted p-2">
                      <p className="text-muted-foreground">Reviewed threads</p>
                      <p className="mt-1 text-sm font-semibold">
                        {reviewQueueDiagnostics.reviewed}/{reviewQueueDiagnostics.threads}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <p className="text-muted-foreground">Viewed files</p>
                      <p className="mt-1 text-sm font-semibold">
                        {fileChangeDiagnostics.viewed}/{fileChangeDiagnostics.files}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <p className="text-muted-foreground">Saved sessions</p>
                      <p className="mt-1 text-sm font-semibold">{reviewSessionDiagnostics.sessions}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={handlePreviewDiagnostics}>
                      Preview diagnostics
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleCopyDiagnostics()} disabled={!diagnosticsPreview}>
                      Copy export
                    </Button>
                    <Button className="col-span-2" size="sm" variant="outline" onClick={() => setResetHistoryConfirmOpen(true)}>
                      Reset local review history
                    </Button>
                  </div>
                  {privacyMessage && (
                    <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground" role="status">
                      {privacyMessage}
                    </p>
                  )}
                  {diagnosticsCopyMessage && (
                    <p className="mt-2 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300" role="status">
                      {diagnosticsCopyMessage}
                    </p>
                  )}
                  {diagnosticsPreview && (
                    <pre
                      aria-label="Diagnostics preview"
                      className="pane-scroll mt-2 max-h-44 rounded-md border border-border bg-background p-2 text-xs text-muted-foreground"
                    >
                      {diagnosticsPreviewText}
                    </pre>
                  )}
                </section>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {oauthFlow && (
        <Dialog.Root open>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-16 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-4 shadow-xl">
              <Dialog.Title className="text-base font-semibold">Enter This Code In GitHub</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                Copy this code, open GitHub, and paste it into the device authorization page. Narview will check the sign-in after you finish in the browser.
              </Dialog.Description>

              <div
                aria-label="GitHub device code"
                className="mt-4 rounded-md border border-border bg-background px-4 py-5 text-center font-mono text-4xl font-semibold"
              >
                {oauthFlow.userCode}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void handleCopyDeviceCode()}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy code
                </Button>
                <Button onClick={() => void handleOpenGithub()}>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open GitHub
                </Button>
              </div>

              {oauthCopyMessage && <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">{oauthCopyMessage}</p>}
              {authError && <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive" role="status">{authError}</p>}

              <div className="mt-4 flex justify-between gap-2">
                <Button variant="ghost" onClick={handleCancelSignIn}>
                  Cancel sign-in
                </Button>
                <Button onClick={handlePollSignIn} disabled={authBusy}>
                  {authBusy ? "Checking..." : "I entered it"}
                  <Kbd>{oauthFlow.intervalSeconds}s</Kbd>
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      <Dialog.Root open={bulkConfirmAction !== null} onOpenChange={(open) => !open && setBulkConfirmAction(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-24 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-4 shadow-xl">
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
              <Button onClick={() => void runConfirmedBulkThreadAction()} disabled={!canPublishReviewThreads || threadActionBusy !== null}>
                Confirm
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={resetHistoryConfirmOpen} onOpenChange={setResetHistoryConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-24 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold">Reset local review history</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
              This clears local Reviewed, Viewed, and Review Session memory. Fetched GitHub cache can be cleared separately.
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetHistoryConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleResetLocalReviewHistory}>Reset</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={commandOpen} onOpenChange={(open) => (open ? setCommandOpen(true) : closeCommandPalette())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-20 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-2 shadow-xl">
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <Dialog.Description className="sr-only">
              Search and run Narview review actions from the keyboard.
            </Dialog.Description>
            <div className="flex h-10 items-center gap-2 border-b border-border px-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                className="h-full flex-1 bg-transparent text-sm outline-none"
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Search commands"
                aria-label="Search commands"
                value={commandQuery}
              />
              <Kbd>Esc</Kbd>
            </div>
            <div className="pane-scroll-y max-h-[70vh] py-2">
              {groupedCommandItems.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground" role="status">
                  No commands match.
                </p>
              ) : (
                groupedCommandItems.map((group) => (
                  <div className="py-1" key={group.category} role="group" aria-label={`${group.category} commands`}>
                    <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-normal text-muted-foreground">{group.category}</p>
                    {group.commands.map((command) => (
                      <button
                        aria-disabled={command.disabled ? "true" : "false"}
                        className={cn(
                          "flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                          command.disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
                        )}
                        key={command.id}
                        onClick={() => runPaletteCommand(command)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{command.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {command.disabled && command.disabledReason ? command.disabledReason : command.description}
                          </span>
                        </span>
                        {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
