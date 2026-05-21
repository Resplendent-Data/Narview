import { isGeneratedOrLowSignalPath } from "./generated-files";
import type { AnalysisIndex } from "./analysis-index";
import type { CachedCheckRun, CachedFileSummary, CachedPullRequestData, CachedReviewThread } from "./pr-cache";

export interface HotspotWeights {
  changedLines: number;
  unresolvedThreads: number;
  fileStatus: number;
  changedSymbols: number;
  edgeDensity: number;
  controlFlow: number;
  testRelations: number;
  failingChecks: number;
  configuredPath: number;
}

export interface RepositoryHotspotOverride {
  weights?: Partial<HotspotWeights>;
  configuredPathPatterns?: string[];
  criticalPathPatterns?: string[];
}

export type HotspotKind = "file" | "generated-cluster";

export interface HotspotScore {
  kind: HotspotKind;
  path: string;
  score: number;
  changedLines: number;
  unresolvedThreads: number;
  reasons: string[];
  collapsed?: boolean;
  fileCount?: number;
  paths?: string[];
}

export interface ChecksSummary {
  total: number;
  passing: number;
  failing: number;
  pending: number;
  failingNames: string[];
  detailUrls: string[];
  details: CheckDetail[];
}

export interface CheckDetail {
  name: string;
  status: CachedCheckRun["status"];
  conclusion: CachedCheckRun["conclusion"];
  url: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  timingLabel: string;
}

export interface MergeReadiness {
  state: "ready" | "attention" | "blocked";
  blockers: string[];
}

export interface ReviewOverview {
  title: string;
  description: string;
  repository: string;
  author: string;
  branch: string;
  counts: {
    changedFiles: number;
    changedLines: number;
    reviewThreads: number;
    checks: number;
  };
  hotspots: HotspotScore[];
  checks: ChecksSummary;
  readiness: MergeReadiness;
  usesLlm: false;
}

const defaultWeights: HotspotWeights = {
  changedLines: 0.22,
  unresolvedThreads: 0.28,
  fileStatus: 0.07,
  changedSymbols: 0.14,
  edgeDensity: 0.12,
  controlFlow: 0.08,
  testRelations: 0.05,
  failingChecks: 0.04,
  configuredPath: 0,
};

export function buildReviewOverview(
  cache: CachedPullRequestData,
  override: RepositoryHotspotOverride = {},
  analysisIndex: AnalysisIndex | null = null,
): ReviewOverview {
  const changedLines = cache.fileSummaries.reduce((total, file) => total + file.additions + file.deletions, 0);

  return {
    title: cache.metadata.title,
    description: cache.metadata.description ?? "No description provided.",
    repository: cache.metadata.repository,
    author: cache.metadata.authorLogin ? `@${cache.metadata.authorLogin}` : "Unknown author",
    branch: `${cache.metadata.headBranch ?? "unknown"} -> ${cache.metadata.baseBranch ?? "unknown"}`,
    counts: {
      changedFiles: cache.fileSummaries.length,
      changedLines,
      reviewThreads: cache.reviewThreads.length,
      checks: cache.checks.length,
    },
    hotspots: scoreHotspots(cache.fileSummaries, cache.reviewThreads, override, analysisIndex, cache.checks),
    checks: summarizeChecks(cache.checks),
    readiness: getMergeReadiness(cache),
    usesLlm: false,
  };
}

export function scoreHotspots(
  files: CachedFileSummary[],
  threads: CachedReviewThread[],
  override: RepositoryHotspotOverride = {},
  analysisIndex: AnalysisIndex | null = null,
  checks: CachedCheckRun[] = [],
): HotspotScore[] {
  const weights = {
    ...defaultWeights,
    ...override.weights,
  };
  const configuredPathPatterns = override.configuredPathPatterns ?? override.criticalPathPatterns ?? [];
  const graphSignals = buildGraphSignals(analysisIndex);
  const failingChecks = checks.filter(isFailingCheck);
  const generatedFiles = files.filter((file) => isGeneratedOrLowSignalPath(file.path));
  const generatedPaths = new Set(generatedFiles.map((file) => file.path));
  const fileHotspots = files
    .filter((file) => !generatedPaths.has(file.path))
    .map((file) => scoreFileHotspot(file, threads, failingChecks, graphSignals.get(file.path), weights, configuredPathPatterns));
  const generatedCluster = scoreGeneratedCluster(generatedFiles, threads, failingChecks, graphSignals, weights);

  return [...fileHotspots, ...(generatedCluster ? [generatedCluster] : [])].sort(
    (left, right) => right.score - left.score || left.path.localeCompare(right.path),
  );
}

interface StructuralSignals {
  changedSymbolNodes: number;
  graphEdges: number;
  testRelations: number;
}

interface HotspotSignals extends StructuralSignals {
  changedLines: number;
  unresolvedThreads: number;
  statusRisk: number;
  controlFlowChanges: number;
  failingChecks: number;
  configuredPath: boolean;
}

function scoreFileHotspot(
  file: CachedFileSummary,
  threads: CachedReviewThread[],
  failingChecks: CachedCheckRun[],
  graphSignal: StructuralSignals | undefined,
  weights: HotspotWeights,
  configuredPathPatterns: string[],
): HotspotScore {
  const changedLines = file.additions + file.deletions;
  const unresolvedThreads = threads.filter((thread) => thread.filePath === file.path && thread.state === "unresolved").length;
  const signals: HotspotSignals = {
    changedLines,
    unresolvedThreads,
    statusRisk: getStatusRisk(file.status),
    changedSymbolNodes: graphSignal?.changedSymbolNodes ?? 0,
    graphEdges: graphSignal?.graphEdges ?? 0,
    controlFlowChanges: countControlFlowChanges(file),
    testRelations: graphSignal?.testRelations ?? 0,
    failingChecks: failingChecks.filter((check) => checkMatchesFile(check, file.path)).length,
    configuredPath: matchesConfiguredPath(file.path, configuredPathPatterns),
  };
  const score = Math.round(
    getChangedLineSignal(changedLines) * weights.changedLines +
      Math.min(unresolvedThreads * 45, 100) * weights.unresolvedThreads +
      signals.statusRisk * weights.fileStatus +
      Math.min(signals.changedSymbolNodes * 28, 100) * weights.changedSymbols +
      Math.min(signals.graphEdges * 18, 100) * weights.edgeDensity +
      Math.min(signals.controlFlowChanges * 25, 100) * weights.controlFlow +
      Math.min(signals.testRelations * 35, 100) * weights.testRelations +
      Math.min(signals.failingChecks * 50, 100) * weights.failingChecks +
      (signals.configuredPath ? 100 : 0) * weights.configuredPath,
  );

  return {
    kind: "file",
    path: file.path,
    score,
    changedLines,
    unresolvedThreads,
    reasons: explainHotspot(file, signals),
  };
}

function scoreGeneratedCluster(
  files: CachedFileSummary[],
  threads: CachedReviewThread[],
  failingChecks: CachedCheckRun[],
  graphSignals: Map<string, StructuralSignals>,
  weights: HotspotWeights,
): HotspotScore | null {
  if (files.length === 0) {
    return null;
  }

  const paths = files.map((file) => file.path).sort((left, right) => left.localeCompare(right));
  const changedLines = files.reduce((total, file) => total + file.additions + file.deletions, 0);
  const unresolvedThreads = threads.filter((thread) => paths.includes(thread.filePath) && thread.state === "unresolved").length;
  const failingCheckCount = failingChecks.filter((check) => paths.some((path) => checkMatchesFile(check, path))).length;
  const testRelationCount = paths.reduce((total, path) => total + (graphSignals.get(path)?.testRelations ?? 0), 0);
  const score = Math.round(
    Math.min(changedLines / 20, 40) * weights.changedLines +
      Math.min(unresolvedThreads * 45, 100) * weights.unresolvedThreads +
      Math.min(failingCheckCount * 50, 100) * weights.failingChecks +
      Math.min(testRelationCount * 20, 100) * weights.testRelations,
  );
  const reasons = [
    `${files.length} generated/vendor/build file${files.length === 1 ? "" : "s"}`,
    `${changedLines} changed lines collapsed`,
  ];

  if (unresolvedThreads > 0) {
    reasons.push(`${unresolvedThreads} unresolved thread${unresolvedThreads === 1 ? "" : "s"}`);
  }
  if (failingCheckCount > 0) {
    reasons.push(`${failingCheckCount} failing check${failingCheckCount === 1 ? "" : "s"}`);
  }
  if (testRelationCount > 0) {
    reasons.push(`${testRelationCount} related test change${testRelationCount === 1 ? "" : "s"}`);
  }

  return {
    kind: "generated-cluster",
    path: "Generated Cluster",
    score,
    changedLines,
    unresolvedThreads,
    reasons,
    collapsed: true,
    fileCount: files.length,
    paths,
  };
}

export function summarizeChecks(checks: CachedCheckRun[]): ChecksSummary {
  // Deduplicate checks by name, keeping only the latest run based on startedAt timestamp
  const uniqueChecksMap = new Map<string, CachedCheckRun>();
  for (const check of checks) {
    const existing = uniqueChecksMap.get(check.name);
    if (!existing) {
      uniqueChecksMap.set(check.name, check);
      continue;
    }

    const existingTime = existing.startedAt ? Date.parse(existing.startedAt) : 0;
    const checkTime = check.startedAt ? Date.parse(check.startedAt) : 0;
    if (checkTime > existingTime) {
      uniqueChecksMap.set(check.name, check);
    }
  }
  const deduplicatedChecks = Array.from(uniqueChecksMap.values());

  const failing = deduplicatedChecks.filter(
    (check) =>
      check.status === "completed" &&
      check.conclusion &&
      check.conclusion !== "success" &&
      check.conclusion !== "skipped",
  );
  const pending = deduplicatedChecks.filter((check) => check.status !== "completed");

  return {
    total: deduplicatedChecks.length,
    passing: deduplicatedChecks.filter((check) => check.status === "completed" && check.conclusion === "success").length,
    failing: failing.length,
    pending: pending.length,
    failingNames: failing.map((check) => check.name),
    detailUrls: deduplicatedChecks.map((check) => check.url).filter((url): url is string => Boolean(url)),
    details: deduplicatedChecks.map((check) => {
      const durationSeconds = getDurationSeconds(check.startedAt, check.completedAt);

      return {
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        url: check.url,
        startedAt: check.startedAt ?? null,
        completedAt: check.completedAt ?? null,
        durationSeconds,
        timingLabel: getCheckTimingLabel(check, durationSeconds),
      };
    }),
  };
}

export function getMergeReadiness(cache: CachedPullRequestData): MergeReadiness {
  const checks = summarizeChecks(cache.checks);
  const unresolvedThreads = cache.reviewThreads.filter((thread) => thread.state === "unresolved");
  const blockers = [];
  const mergeable = cache.metadata.mergeable;
  const mergeStateStatus = cache.metadata.mergeStateStatus;
  const reviewDecision = cache.metadata.reviewDecision;

  if (cache.metadata.isDraft) {
    blockers.push("Pull Request is draft.");
  }
  if (mergeable === "CONFLICTING" || mergeStateStatus === "DIRTY") {
    blockers.push("Pull Request has merge conflicts.");
  }
  if (mergeStateStatus === "BLOCKED") {
    blockers.push("GitHub reports merge is blocked.");
  }
  if (reviewDecision === "CHANGES_REQUESTED") {
    blockers.push("Changes requested by reviewers.");
  }
  if (checks.failing > 0) {
    blockers.push(`${checks.failing} failing check${checks.failing === 1 ? "" : "s"}.`);
  }
  if (checks.pending > 0) {
    blockers.push(`${checks.pending} check${checks.pending === 1 ? "" : "s"} still running.`);
  }
  if (unresolvedThreads.length > 0) {
    blockers.push(`${unresolvedThreads.length} unresolved review thread${unresolvedThreads.length === 1 ? "" : "s"}.`);
  }
  if (reviewDecision === "REVIEW_REQUIRED") {
    blockers.push("Review required before merge.");
  }

  if (
    blockers.some(
      (blocker) =>
        blocker.includes("failing") ||
        blocker.includes("draft") ||
        blocker.includes("conflicts") ||
        blocker.includes("blocked") ||
        blocker.includes("Changes requested"),
    )
  ) {
    return { state: "blocked", blockers };
  }
  if (blockers.length > 0) {
    return { state: "attention", blockers };
  }
  return { state: "ready", blockers: ["No visible blockers from cached GitHub data."] };
}

function getStatusRisk(status: CachedFileSummary["status"]) {
  if (status === "removed" || status === "renamed") {
    return 70;
  }
  if (status === "added") {
    return 45;
  }
  if (status === "binary") {
    return 35;
  }
  return 20;
}

function buildGraphSignals(analysisIndex: AnalysisIndex | null) {
  const signals = new Map<string, StructuralSignals>();
  if (!analysisIndex) {
    return signals;
  }

  for (const node of analysisIndex.nodes) {
    const current = getOrCreateStructuralSignals(signals, node.filePath);
    if (node.reviewTarget && node.kind === "symbol") {
      current.changedSymbolNodes += 1;
    }
  }

  for (const relationship of analysisIndex.relationships) {
    addRelationshipSignal(signals, relationship.filePath, relationship.kind === "test-file");
    if (relationship.targetFilePath && relationship.targetFilePath !== relationship.filePath) {
      addRelationshipSignal(signals, relationship.targetFilePath, relationship.kind === "test-file");
    }
  }

  return signals;
}

function getOrCreateStructuralSignals(signals: Map<string, StructuralSignals>, path: string) {
  const existing = signals.get(path);
  if (existing) {
    return existing;
  }

  const next: StructuralSignals = {
    changedSymbolNodes: 0,
    graphEdges: 0,
    testRelations: 0,
  };
  signals.set(path, next);
  return next;
}

function addRelationshipSignal(signals: Map<string, StructuralSignals>, path: string, isTestRelation: boolean) {
  const current = getOrCreateStructuralSignals(signals, path);
  current.graphEdges += 1;
  if (isTestRelation) {
    current.testRelations += 1;
  }
}

function getChangedLineSignal(changedLines: number) {
  return Math.min(changedLines / 4, 100);
}

function matchesConfiguredPath(path: string, patterns: string[]) {
  const lowerPath = path.toLowerCase();
  return patterns.some((pattern) => pattern.trim().length > 0 && lowerPath.includes(pattern.toLowerCase()));
}

function isFailingCheck(check: CachedCheckRun) {
  return (
    check.status === "completed" &&
    check.conclusion !== null &&
    check.conclusion !== "success" &&
    check.conclusion !== "skipped"
  );
}

function checkMatchesFile(check: CachedCheckRun, path: string) {
  const lowerPath = path.toLowerCase();
  const fileName = lowerPath.split("/").at(-1) ?? lowerPath;
  const stem = fileName.replace(/\.(tsx|ts|jsx|js|py|rs|go|java|rb|php|css|scss|md|json|ya?ml)$/i, "");
  const haystack = `${check.name} ${check.url ?? ""}`.toLowerCase();

  return haystack.includes(lowerPath) || haystack.includes(fileName) || (stem.length >= 4 && haystack.includes(stem));
}

function countControlFlowChanges(file: CachedFileSummary) {
  if (!file.patch) {
    return 0;
  }

  return file.patch
    .split("\n")
    .filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---"))
    .map((line) => line.slice(1).trim())
    .filter((line) =>
      /\b(if|else|elif|for|while|switch|case|catch|try|except|finally|return|throw|raise|await|yield)\b|&&|\|\||\?/.test(line),
    ).length;
}

function explainHotspot(file: CachedFileSummary, signals: HotspotSignals) {
  const reasons = [`${signals.changedLines} changed lines`];

  if (signals.unresolvedThreads > 0) {
    reasons.push(`${signals.unresolvedThreads} unresolved thread${signals.unresolvedThreads === 1 ? "" : "s"}`);
  }
  if (signals.changedSymbolNodes > 0) {
    reasons.push(`${signals.changedSymbolNodes} changed symbol node${signals.changedSymbolNodes === 1 ? "" : "s"}`);
  }
  if (signals.graphEdges > 0) {
    reasons.push(`${signals.graphEdges} graph edge${signals.graphEdges === 1 ? "" : "s"}`);
  }
  if (signals.controlFlowChanges > 0) {
    reasons.push(`${signals.controlFlowChanges} control-flow change${signals.controlFlowChanges === 1 ? "" : "s"}`);
  }
  if (signals.testRelations > 0) {
    reasons.push(`${signals.testRelations} related test change${signals.testRelations === 1 ? "" : "s"}`);
  }
  if (signals.failingChecks > 0) {
    reasons.push(`${signals.failingChecks} failing check${signals.failingChecks === 1 ? "" : "s"}`);
  }
  if (file.status !== "modified") {
    reasons.push(`${file.status} file`);
  }
  if (signals.configuredPath) {
    reasons.push("configured path pattern");
  }

  return reasons;
}

function getDurationSeconds(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);

  if (Number.isNaN(started) || Number.isNaN(completed) || completed < started) {
    return null;
  }

  return Math.round((completed - started) / 1000);
}

function getCheckTimingLabel(check: CachedCheckRun, durationSeconds: number | null) {
  if (durationSeconds !== null) {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  if (check.status === "queued") {
    return "Queued";
  }
  if (check.status === "in-progress") {
    return check.startedAt ? "Running" : "Waiting for timing";
  }
  return "Timing unavailable";
}
