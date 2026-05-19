import type { CachedCheckRun, CachedFileSummary, CachedPullRequestData, CachedReviewThread } from "./pr-cache";

export interface HotspotWeights {
  changedLines: number;
  unresolvedThreads: number;
  fileStatus: number;
  criticalPath: number;
}

export interface RepositoryHotspotOverride {
  weights?: Partial<HotspotWeights>;
  criticalPathPatterns?: string[];
}

export interface HotspotScore {
  path: string;
  score: number;
  changedLines: number;
  unresolvedThreads: number;
  reasons: string[];
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
  changedLines: 0.35,
  unresolvedThreads: 0.35,
  fileStatus: 0.15,
  criticalPath: 0.15,
};

const defaultCriticalPathPatterns = ["auth", "security", "migration", "schema", "payment", "billing"];

export function buildReviewOverview(
  cache: CachedPullRequestData,
  override: RepositoryHotspotOverride = {},
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
    hotspots: scoreHotspots(cache.fileSummaries, cache.reviewThreads, override),
    checks: summarizeChecks(cache.checks),
    readiness: getMergeReadiness(cache),
    usesLlm: false,
  };
}

export function scoreHotspots(
  files: CachedFileSummary[],
  threads: CachedReviewThread[],
  override: RepositoryHotspotOverride = {},
): HotspotScore[] {
  const weights = {
    ...defaultWeights,
    ...override.weights,
  };
  const criticalPathPatterns = override.criticalPathPatterns ?? defaultCriticalPathPatterns;

  return files
    .map((file) => {
      const changedLines = file.additions + file.deletions;
      const unresolvedThreads = threads.filter((thread) => thread.filePath === file.path && thread.state === "unresolved").length;
      const statusRisk = getStatusRisk(file.status);
      const criticalPathRisk = criticalPathPatterns.some((pattern) => file.path.toLowerCase().includes(pattern.toLowerCase())) ? 100 : 0;
      const score = Math.round(
        Math.min(changedLines, 400) * 0.25 * weights.changedLines +
          Math.min(unresolvedThreads * 24, 100) * weights.unresolvedThreads +
          statusRisk * weights.fileStatus +
          criticalPathRisk * weights.criticalPath,
      );
      const reasons = explainHotspot(file, unresolvedThreads, criticalPathRisk > 0);

      return {
        path: file.path,
        score,
        changedLines,
        unresolvedThreads,
        reasons,
      };
    })
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}

export function summarizeChecks(checks: CachedCheckRun[]): ChecksSummary {
  const failing = checks.filter((check) => check.status === "completed" && check.conclusion && check.conclusion !== "success");
  const pending = checks.filter((check) => check.status !== "completed");

  return {
    total: checks.length,
    passing: checks.filter((check) => check.status === "completed" && check.conclusion === "success").length,
    failing: failing.length,
    pending: pending.length,
    failingNames: failing.map((check) => check.name),
    detailUrls: checks.map((check) => check.url).filter((url): url is string => Boolean(url)),
    details: checks.map((check) => {
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

function explainHotspot(file: CachedFileSummary, unresolvedThreads: number, criticalPath: boolean) {
  const changedLines = file.additions + file.deletions;
  const reasons = [`${changedLines} changed lines`];

  if (unresolvedThreads > 0) {
    reasons.push(`${unresolvedThreads} unresolved thread${unresolvedThreads === 1 ? "" : "s"}`);
  }
  if (file.status !== "modified") {
    reasons.push(`${file.status} file`);
  }
  if (criticalPath) {
    reasons.push("critical path");
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
