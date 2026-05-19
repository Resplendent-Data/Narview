import { invoke } from "@tauri-apps/api/core";
import { networkRequiredFailure } from "./pr-cache";

export type ThreadWriteAction = "reply" | "resolve" | "unresolve";

export interface ThreadActionSuccess {
  ok: true;
  action: ThreadWriteAction;
  threadId: string;
  message: string;
  replyUrl: string | null;
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
}

interface BackendThreadActionResponse {
  action: ThreadWriteAction;
  threadId: string;
  message: string;
  replyUrl: string | null;
}

export function validateReplyBody(body: string): string | null {
  return body.trim().length === 0 ? "Reply body is required." : null;
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
};

function toSuccess(response: BackendThreadActionResponse): ThreadActionSuccess {
  return {
    ok: true,
    action: response.action,
    threadId: response.threadId,
    message: response.message,
    replyUrl: response.replyUrl,
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
  return "Unresolve";
}
