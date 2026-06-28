import type { CachedFileSummary, CachedPullRequestData, CachedReviewThread } from "./pr-cache";
import type { DiffLine } from "./diff-viewer";
import { getReviewThreadOrigin } from "./review-queue";

export type HandoffPacketMode = "selected-review-threads" | "human-feedback";

export interface HandoffPacketPullRequest {
  repository: string;
  number: number;
  title: string;
  url: string;
  authorLogin: string | null;
  baseBranch: string | null;
  headBranch: string | null;
}

export interface HandoffThreadCommentContext {
  id: string;
  authorLogin: string | null;
  body: string;
  updatedAt: string;
  url: string | null;
}

export interface HandoffThreadContext {
  id: string;
  authorLogin: string | null;
  filePath: string;
  line: number | null;
  state: CachedReviewThread["state"];
  url: string | null;
  body: string;
  outdated: boolean;
  resolved: boolean;
  comments: HandoffThreadCommentContext[];
  diffContext: string[];
}

export interface HandoffPacket {
  mode: HandoffPacketMode;
  intent: string;
  pullRequest: HandoffPacketPullRequest;
  threads: HandoffThreadContext[];
  files: Pick<CachedFileSummary, "path" | "additions" | "deletions" | "status">[];
  generatedAt: string;
  githubDataFetchedAtEpochMs: number | null;
  githubDataFreshness: string;
  sourceRevision: string | null;
  usesLlm: false;
  appliesChanges: false;
}

export interface BuildHandoffPacketInput {
  intent: string;
  pullRequest: CachedPullRequestData["metadata"];
  threads: CachedReviewThread[];
  files: CachedFileSummary[];
  diffContextByPath: Record<string, DiffLine[]>;
  contextRadius?: number;
  mode?: HandoffPacketMode;
  generatedAt?: string;
  githubDataFetchedAtEpochMs?: number | null;
  sourceRevision?: string | null;
}

export function buildHandoffPacket(input: BuildHandoffPacketInput): HandoffPacket {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    mode: input.mode ?? "selected-review-threads",
    intent: input.intent.trim() || "Review selected feedback",
    pullRequest: {
      repository: input.pullRequest.repository,
      number: input.pullRequest.number,
      title: input.pullRequest.title,
      url: input.pullRequest.url,
      authorLogin: input.pullRequest.authorLogin,
      baseBranch: input.pullRequest.baseBranch,
      headBranch: input.pullRequest.headBranch,
    },
    threads: input.threads.map((thread) => ({
      id: thread.id,
      authorLogin: thread.authorLogin,
      filePath: thread.filePath,
      line: thread.line,
      state: thread.state,
      url: getThreadUrl(thread),
      body: thread.body,
      outdated: thread.state === "outdated",
      resolved: thread.state === "resolved",
      comments: getThreadConversation(thread),
      diffContext: selectDiffContextLines(input.diffContextByPath[thread.filePath] ?? [], thread.line, input.contextRadius ?? 3),
    })),
    files: input.files.map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      status: file.status,
    })),
    generatedAt,
    githubDataFetchedAtEpochMs: input.githubDataFetchedAtEpochMs ?? null,
    githubDataFreshness: formatFreshness(input.githubDataFetchedAtEpochMs ?? null, generatedAt),
    sourceRevision: input.sourceRevision ?? null,
    usesLlm: false,
    appliesChanges: false,
  };
}

export interface BuildHumanFeedbackPacketInput extends Omit<BuildHandoffPacketInput, "intent" | "threads" | "mode"> {
  threads: CachedReviewThread[];
  includeCodeRabbitThreads?: boolean;
  intent?: string;
}

export function buildHumanFeedbackPacket(input: BuildHumanFeedbackPacketInput): HandoffPacket {
  return buildHandoffPacket({
    ...input,
    mode: "human-feedback",
    intent: input.intent?.trim() || "Verify human PR feedback before implementing changes",
    threads: selectHumanFeedbackThreads(input.threads, input.includeCodeRabbitThreads ?? false),
  });
}

export function selectHumanFeedbackThreads(threads: CachedReviewThread[], includeCodeRabbitThreads = false) {
  return threads.filter((thread) => {
    if (thread.state !== "unresolved") {
      return false;
    }

    const origin = getReviewThreadOrigin(thread);
    return origin === "human" || (includeCodeRabbitThreads && origin === "coderabbit");
  });
}

export function renderHandoffMarkdown(packet: HandoffPacket) {
  const lines = [
    `# ${packet.mode === "human-feedback" ? "Human Feedback Packet" : "Handoff Packet"}: ${packet.pullRequest.repository} #${packet.pullRequest.number}`,
    "",
    `Intent: ${packet.intent}`,
    `Pull Request: ${packet.pullRequest.title}`,
    `URL: ${packet.pullRequest.url}`,
    `Author: ${packet.pullRequest.authorLogin ? `@${packet.pullRequest.authorLogin}` : "unknown"}`,
    `Branch: ${packet.pullRequest.headBranch ?? "unknown"} -> ${packet.pullRequest.baseBranch ?? "unknown"}`,
    `Generated at: ${packet.generatedAt}`,
    `GitHub data freshness: ${packet.githubDataFreshness}`,
    `Source PR revision: ${packet.sourceRevision ?? "unknown"}`,
    `LLM used: ${packet.usesLlm}`,
    `Applies code changes: ${packet.appliesChanges}`,
    "",
    "Before implementing changes, verify each review comment against the Pull Request diff, nearby code context, and current repository state.",
    "",
    "## Selected Review Threads",
    "",
  ];

  for (const thread of packet.threads) {
    lines.push(`### ${thread.id}`);
    lines.push(`URL: ${thread.url ?? "unknown"}`);
    lines.push(`File: ${thread.filePath}${thread.line ? `:${thread.line}` : " (file)"}`);
    lines.push(`Author: ${thread.authorLogin ? `@${thread.authorLogin}` : "unknown"}`);
    lines.push(`State: ${thread.state}`);
    lines.push(`Resolved: ${thread.resolved}`);
    lines.push(`Outdated: ${thread.outdated}`);
    lines.push("");
    lines.push("Raw conversation:");
    lines.push("");
    for (const comment of thread.comments) {
      lines.push(`Comment ${comment.id} by ${comment.authorLogin ? `@${comment.authorLogin}` : "unknown"}${comment.url ? ` (${comment.url})` : ""}`);
      lines.push("");
      lines.push(comment.body);
      lines.push("");
    }
    lines.push("");
    lines.push("```diff");
    lines.push(...(thread.diffContext.length > 0 ? thread.diffContext : ["# No nearby diff context loaded."]));
    lines.push("```");
    lines.push("");
  }

  lines.push("## Changed Files");
  lines.push("");
  for (const file of packet.files) {
    lines.push(`- ${file.path} (${file.status}, +${file.additions} -${file.deletions})`);
  }

  return lines.join("\n");
}

export function selectDiffContextLines(lines: DiffLine[], line: number | null, radius: number) {
  if (lines.length === 0) {
    return [];
  }

  const formatted = lines.map(formatDiffLine);
  if (!line) {
    return formatted.slice(0, radius * 2 + 1);
  }

  const matchIndex = lines.findIndex((diffLine) => diffLine.oldLine === line || diffLine.newLine === line);
  if (matchIndex < 0) {
    return formatted.slice(0, radius * 2 + 1);
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(lines.length, matchIndex + radius + 1);
  return formatted.slice(start, end);
}

function formatDiffLine(line: DiffLine) {
  const prefix = line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " ";
  const number = line.newLine ?? line.oldLine ?? "";
  return `${prefix}${String(number).padStart(4, " ")} ${line.content}`;
}

function getThreadConversation(thread: CachedReviewThread): HandoffThreadCommentContext[] {
  if (thread.comments && thread.comments.length > 0) {
    return thread.comments.map((comment) => ({
      id: comment.id,
      authorLogin: comment.authorLogin,
      body: comment.body,
      updatedAt: comment.updatedAt,
      url: comment.url,
    }));
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

function getThreadUrl(thread: CachedReviewThread) {
  return getThreadConversation(thread).find((comment) => comment.url)?.url ?? null;
}

function formatFreshness(fetchedAtEpochMs: number | null, generatedAt: string) {
  if (!fetchedAtEpochMs) {
    return "unknown";
  }

  const generatedEpochMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedEpochMs)) {
    return `fetched at ${new Date(fetchedAtEpochMs).toISOString()}`;
  }

  const ageMinutes = Math.max(0, Math.round((generatedEpochMs - fetchedAtEpochMs) / 60_000));
  return `fetched ${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} before generation`;
}
