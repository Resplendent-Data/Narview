import type { FileChangeStore } from "./file-changes";
import type { CacheStats } from "./pr-cache";
import type { ReviewQueueStore } from "./review-queue";
import type { SessionStore } from "./review-session";

export interface DiagnosticsPreview {
  version: 1;
  generatedAt: string;
  telemetry: TelemetryPolicy;
  localData: {
    githubCache: CacheStats;
    reviewQueue: ReviewQueueDiagnostics;
    fileChanges: FileChangeDiagnostics;
    reviewSessions: ReviewSessionDiagnostics;
  };
  redaction: {
    analysisIndex: "redacted";
    rawCode: "redacted";
    diffHunks: "redacted";
    reviewThreadBodies: "redacted";
    oauthTokens: "redacted";
    requestDetails: "redacted";
  };
}

export interface FileChangeDiagnostics {
  users: number;
  files: number;
  viewed: number;
}

export interface ReviewQueueDiagnostics {
  users: number;
  threads: number;
  reviewed: number;
  storedBodyExcerpts: number;
}

export interface ReviewSessionDiagnostics {
  users: number;
  sessions: number;
}

export interface TelemetryPolicy {
  enabled: false;
  analyticsSinks: [];
  crashReportSinks: [];
  remoteLogSinks: [];
}

export const telemetryPolicy: TelemetryPolicy = {
  enabled: false,
  analyticsSinks: [],
  crashReportSinks: [],
  remoteLogSinks: [],
};

const sensitiveKeyPattern =
  /(analysisIndex|attentionMap|authorization|body|code|cookie|credential|diff|fileContents|header|hunk|patch|request|response|reviewTarget|secret|sourceSignature|thread|token)/i;
const secretLikePattern = /(bearer\s+[a-z0-9._-]+|gh[opsru]_[a-z0-9_]+|github_pat_[a-z0-9_]+|-----BEGIN [^-]+-----)/i;
const codeLikePattern = /(^|\n)\s*(diff --git|@@|[-+]\s*(const|let|var|function|class|import|export)\b)/;

export function summarizeReviewQueueStore(store: ReviewQueueStore): ReviewQueueDiagnostics {
  const userEntries = Object.values(store.users);
  const states = userEntries.flatMap((threads) => Object.values(threads));

  return {
    users: userEntries.length,
    threads: states.length,
    reviewed: states.filter((state) => state.reviewed).length,
    storedBodyExcerpts: states.filter((state) => state.recoveryContext.bodyExcerpt.length > 0).length,
  };
}

export function summarizeFileChangeStore(store: FileChangeStore): FileChangeDiagnostics {
  const userEntries = Object.values(store.users);
  const states = userEntries.flatMap((files) => Object.values(files));

  return {
    users: userEntries.length,
    files: states.length,
    viewed: states.filter((state) => state.viewed).length,
  };
}

export function summarizeReviewSessionStore(store: SessionStore): ReviewSessionDiagnostics {
  return {
    users: Object.keys(store.lastByUser).length,
    sessions: Object.keys(store.sessions).length,
  };
}

export function buildDiagnosticsPreview(input: {
  cache: CacheStats;
  reviewQueue: ReviewQueueDiagnostics;
  fileChanges: FileChangeDiagnostics;
  reviewSessions: ReviewSessionDiagnostics;
  generatedAt?: string;
}): DiagnosticsPreview {
  return {
    version: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    telemetry: telemetryPolicy,
    localData: {
      githubCache: input.cache,
      reviewQueue: input.reviewQueue,
      fileChanges: input.fileChanges,
      reviewSessions: input.reviewSessions,
    },
    redaction: {
      analysisIndex: "redacted",
      rawCode: "redacted",
      diffHunks: "redacted",
      reviewThreadBodies: "redacted",
      oauthTokens: "redacted",
      requestDetails: "redacted",
    },
  };
}

export function renderDiagnosticsExport(preview: DiagnosticsPreview) {
  return JSON.stringify(preview, null, 2);
}

export function hasTelemetryEmissionPaths(policy: TelemetryPolicy = telemetryPolicy) {
  return policy.enabled || policy.analyticsSinks.length > 0 || policy.crashReportSinks.length > 0 || policy.remoteLogSinks.length > 0;
}

export function redactOperationalLog<T>(value: T): T {
  return redactValue("", value) as T;
}

function redactValue(key: string, value: unknown): unknown {
  if (key && sensitiveKeyPattern.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    if (secretLikePattern.test(value) || codeLikePattern.test(value)) {
      return "[redacted]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactValue(entryKey, entryValue)]));
  }

  return value;
}
