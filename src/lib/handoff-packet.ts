import type { CachedFileSummary, CachedPullRequestData, CachedReviewThread } from "./pr-cache";
import type { DiffLine } from "./diff-viewer";

export interface HandoffPacketPullRequest {
  repository: string;
  number: number;
  title: string;
  url: string;
  authorLogin: string | null;
  baseBranch: string | null;
  headBranch: string | null;
}

export interface HandoffThreadContext {
  id: string;
  authorLogin: string | null;
  filePath: string;
  line: number | null;
  state: CachedReviewThread["state"];
  body: string;
  diffContext: string[];
}

export interface HandoffPacket {
  intent: string;
  pullRequest: HandoffPacketPullRequest;
  threads: HandoffThreadContext[];
  files: Pick<CachedFileSummary, "path" | "additions" | "deletions" | "status">[];
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
}

export function buildHandoffPacket(input: BuildHandoffPacketInput): HandoffPacket {
  return {
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
      body: thread.body,
      diffContext: selectDiffContextLines(input.diffContextByPath[thread.filePath] ?? [], thread.line, input.contextRadius ?? 3),
    })),
    files: input.files.map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      status: file.status,
    })),
    usesLlm: false,
    appliesChanges: false,
  };
}

export function renderHandoffMarkdown(packet: HandoffPacket) {
  const lines = [
    `# Handoff Packet: ${packet.pullRequest.repository} #${packet.pullRequest.number}`,
    "",
    `Intent: ${packet.intent}`,
    `Pull Request: ${packet.pullRequest.title}`,
    `URL: ${packet.pullRequest.url}`,
    `Author: ${packet.pullRequest.authorLogin ? `@${packet.pullRequest.authorLogin}` : "unknown"}`,
    `Branch: ${packet.pullRequest.headBranch ?? "unknown"} -> ${packet.pullRequest.baseBranch ?? "unknown"}`,
    `LLM used: ${packet.usesLlm}`,
    `Applies code changes: ${packet.appliesChanges}`,
    "",
    "## Selected Review Threads",
    "",
  ];

  for (const thread of packet.threads) {
    lines.push(`### ${thread.id}`);
    lines.push(`File: ${thread.filePath}${thread.line ? `:${thread.line}` : ""}`);
    lines.push(`Author: ${thread.authorLogin ? `@${thread.authorLogin}` : "unknown"}`);
    lines.push(`State: ${thread.state}`);
    lines.push("");
    lines.push(thread.body);
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
