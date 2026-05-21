import { invoke } from "@tauri-apps/api/core";
import { networkRequiredFailure, type CachedReviewThread } from "./pr-cache";
import type { ReviewThreadAnchorSide } from "./review-thread-anchors";

export type ThreadWriteAction = "reply" | "resolve" | "unresolve" | "create-line" | "create-file";

export interface StartLineReviewThreadInput {
  repository: string;
  pullRequestNumber: number;
  path: string;
  line: number;
  side: ReviewThreadAnchorSide;
  body: string;
}

export interface StartFileReviewThreadInput {
  repository: string;
  pullRequestNumber: number;
  path: string;
  body: string;
}

export interface ThreadActionSuccess {
  ok: true;
  action: ThreadWriteAction;
  threadId: string;
  message: string;
  replyUrl: string | null;
  createdThread?: CachedReviewThread | null;
}

export interface ThreadActionFailure {
  ok: false;
  action: ThreadWriteAction;
  threadId: string;
  code: string;
  message: string;
  retryable: boolean;
}

export type ThreadActionResult = ThreadActionSuccess | ThreadActionFailure;

export interface ThreadActionClient {
  reply: (threadId: string, body: string) => Promise<ThreadActionResult>;
  resolve: (threadId: string) => Promise<ThreadActionResult>;
  unresolve: (threadId: string) => Promise<ThreadActionResult>;
  startLineThread: (input: StartLineReviewThreadInput) => Promise<ThreadActionResult>;
  startFileThread: (input: StartFileReviewThreadInput) => Promise<ThreadActionResult>;
}

interface BackendThreadActionResponse {
  action: ThreadWriteAction;
  threadId: string;
  message: string;
  replyUrl: string | null;
  createdThread?: CachedReviewThread | null;
}

export function validateReplyBody(body: string): string | null {
  return body.trim().length === 0 ? "Reply body is required." : null;
}

export function validateNewThreadBody(body: string): string | null {
  return body.trim().length === 0 ? "Review Thread body is required." : null;
}

export function createThreadActionFailure(
  action: ThreadWriteAction,
  threadId: string,
  code: string,
  message: string,
): ThreadActionFailure {
  return {
    ok: false,
    action,
    threadId,
    code,
    message,
    retryable: isRetryableThreadActionCode(code),
  };
}

export function classifyThreadActionError(
  action: ThreadWriteAction,
  threadId: string,
  error: unknown,
): ThreadActionFailure {
  const payload = error && typeof error === "object" ? (error as { code?: unknown; message?: unknown }) : null;
  const code = typeof payload?.code === "string" ? payload.code : "github-thread-unknown-error";
  const message = typeof payload?.message === "string" ? payload.message : String(error);

  return createThreadActionFailure(action, threadId, code, message);
}

export function networkRequiredThreadActionFailure(action: ThreadWriteAction, threadId: string): ThreadActionFailure {
  const failure = networkRequiredFailure(`${getActionLabel(action)} thread`);

  return createThreadActionFailure(action, threadId, "network-required", failure.message);
}

export const tauriThreadActionClient: ThreadActionClient = {
  async reply(threadId, body) {
    const validationError = validateReplyBody(body);
    if (validationError) {
      return createThreadActionFailure("reply", threadId, "github-thread-validation-error", validationError);
    }

    try {
      return toSuccess(await invoke<BackendThreadActionResponse>("reply_review_thread", { threadId, body }));
    } catch (error) {
      return classifyThreadActionError("reply", threadId, error);
    }
  },

  async resolve(threadId) {
    try {
      return toSuccess(await invoke<BackendThreadActionResponse>("resolve_review_thread", { threadId }));
    } catch (error) {
      return classifyThreadActionError("resolve", threadId, error);
    }
  },

  async unresolve(threadId) {
    try {
      return toSuccess(await invoke<BackendThreadActionResponse>("unresolve_review_thread", { threadId }));
    } catch (error) {
      return classifyThreadActionError("unresolve", threadId, error);
    }
  },

  async startLineThread(input) {
    const validationError = validateNewThreadBody(input.body);
    if (validationError) {
      return createThreadActionFailure("create-line", `${input.path}:${input.line}`, "github-thread-validation-error", validationError);
    }

    try {
      return toSuccess(
        await invoke<BackendThreadActionResponse>("start_review_thread", {
          repository: input.repository,
          pullRequestNumber: input.pullRequestNumber,
          path: input.path,
          body: input.body,
          line: input.line,
          side: input.side,
          subjectType: "LINE",
        }),
      );
    } catch (error) {
      return classifyThreadActionError("create-line", `${input.path}:${input.line}`, error);
    }
  },

  async startFileThread(input) {
    const validationError = validateNewThreadBody(input.body);
    if (validationError) {
      return createThreadActionFailure("create-file", input.path, "github-thread-validation-error", validationError);
    }

    try {
      return toSuccess(
        await invoke<BackendThreadActionResponse>("start_review_thread", {
          repository: input.repository,
          pullRequestNumber: input.pullRequestNumber,
          path: input.path,
          body: input.body,
          line: null,
          side: null,
          subjectType: "FILE",
        }),
      );
    } catch (error) {
      return classifyThreadActionError("create-file", input.path, error);
    }
  },
};

export const offlineThreadActionClient: ThreadActionClient = {
  async reply(threadId, body) {
    const validationError = validateReplyBody(body);
    if (validationError) {
      return createThreadActionFailure("reply", threadId, "github-thread-validation-error", validationError);
    }
    return networkRequiredThreadActionFailure("reply", threadId);
  },
  async resolve(threadId) {
    return networkRequiredThreadActionFailure("resolve", threadId);
  },
  async unresolve(threadId) {
    return networkRequiredThreadActionFailure("unresolve", threadId);
  },
  async startLineThread(input) {
    const validationError = validateNewThreadBody(input.body);
    if (validationError) {
      return createThreadActionFailure("create-line", `${input.path}:${input.line}`, "github-thread-validation-error", validationError);
    }
    return networkRequiredThreadActionFailure("create-line", `${input.path}:${input.line}`);
  },
  async startFileThread(input) {
    const validationError = validateNewThreadBody(input.body);
    if (validationError) {
      return createThreadActionFailure("create-file", input.path, "github-thread-validation-error", validationError);
    }
    return networkRequiredThreadActionFailure("create-file", input.path);
  },
};

function toSuccess(response: BackendThreadActionResponse): ThreadActionSuccess {
  return {
    ok: true,
    action: response.action,
    threadId: response.threadId,
    message: response.message,
    replyUrl: response.replyUrl,
    createdThread: response.createdThread ?? null,
  };
}

function isRetryableThreadActionCode(code: string) {
  return code.includes("network") || code.includes("rate-limit") || code.includes("server") || code === "network-required";
}

function getActionLabel(action: ThreadWriteAction) {
  if (action === "reply") {
    return "Reply";
  }
  if (action === "resolve") {
    return "Resolve";
  }
  if (action === "create-line") {
    return "Start line-level";
  }
  if (action === "create-file") {
    return "Start file-level";
  }
  return "Unresolve";
}
