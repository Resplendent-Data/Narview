import { invoke } from "@tauri-apps/api/core";
import type { CachedReviewThread } from "./pr-cache";
import type { ReviewThreadAnchorSide } from "./review-thread-anchors";
import type { FileViewedState } from "./review-stacks";

export type PullRequestReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
export type PendingReviewSubjectType = "LINE" | "FILE" | "REPLY";

export interface PullRequestIdentity {
  repository: string;
  pullRequestNumber: number;
}

export interface SetFileViewedInput extends PullRequestIdentity {
  path: string;
  viewed: boolean;
}

export interface PendingReview {
  pullRequestId: string;
  pullRequestReviewId: string;
  state: "PENDING";
  message: string;
}

export interface PendingReviewDraft {
  id: string;
  authorLogin: string | null;
  filePath: string | null;
  line: number | null;
  body: string;
  updatedAt: string;
  url: string | null;
}

export interface PendingReviewSnapshot extends PendingReview {
  drafts: PendingReviewDraft[];
}

export interface AddPendingReviewThreadInput extends PullRequestIdentity {
  pullRequestReviewId?: string | null;
  subjectType: PendingReviewSubjectType;
  path?: string | null;
  body: string;
  line?: number | null;
  side?: ReviewThreadAnchorSide | null;
  startLine?: number | null;
  startSide?: ReviewThreadAnchorSide | null;
  replyToThreadId?: string | null;
}

export interface SubmitPendingReviewInput extends PullRequestIdentity {
  pullRequestReviewId: string;
  event: PullRequestReviewEvent;
  body: string;
}

export interface DiscardPendingReviewInput extends PullRequestIdentity {
  pullRequestReviewId: string;
}

export interface FileViewedActionResult {
  ok: boolean;
  path: string;
  viewerViewedState: FileViewedState;
  message: string;
}

export interface PendingReviewThreadResult extends PendingReview {
  thread: CachedReviewThread | null;
}

export interface ReviewSubmitResult {
  ok: boolean;
  pullRequestReviewId: string;
  state: string;
  url: string | null;
  message: string;
}

export interface ReviewActionClient {
  setFileViewed: (input: SetFileViewedInput) => Promise<FileViewedActionResult>;
  findPendingReview: (input: PullRequestIdentity) => Promise<PendingReviewSnapshot | null>;
  ensurePendingReview: (input: PullRequestIdentity) => Promise<PendingReview>;
  addPendingReviewThread: (input: AddPendingReviewThreadInput) => Promise<PendingReviewThreadResult>;
  submitPendingReview: (input: SubmitPendingReviewInput) => Promise<ReviewSubmitResult>;
  discardPendingReview: (input: DiscardPendingReviewInput) => Promise<ReviewSubmitResult>;
}

export function validatePendingReviewThreadInput(input: AddPendingReviewThreadInput): string | null {
  if (input.body.trim().length === 0) {
    return "Draft comment body is required.";
  }

  if (input.subjectType === "REPLY") {
    return input.replyToThreadId ? null : "Choose a review thread to reply to.";
  }

  if (!input.path?.trim()) {
    return "Choose a changed file for this draft comment.";
  }

  if (input.subjectType === "LINE") {
    if (!input.line || input.line < 1) {
      return "Choose a changed line for this draft comment.";
    }
    if (input.side !== "LEFT" && input.side !== "RIGHT") {
      return "Line comments need a LEFT or RIGHT diff side.";
    }
  }

  return null;
}

export function validateSubmitReviewInput(input: SubmitPendingReviewInput): string | null {
  if (!input.pullRequestReviewId) {
    return "No pending review is ready to submit.";
  }
  if ((input.event === "COMMENT" || input.event === "REQUEST_CHANGES") && input.body.trim().length === 0) {
    return "A review summary is required for comments and changes-requested reviews.";
  }
  return null;
}

export const tauriReviewActionClient: ReviewActionClient = {
  async setFileViewed(input) {
    return invoke<FileViewedActionResult>("set_file_viewed", {
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
      path: input.path,
      viewed: input.viewed,
    });
  },

  async ensurePendingReview(input) {
    return invoke<PendingReview>("ensure_pending_review", {
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
    });
  },

  async findPendingReview(input) {
    return invoke<PendingReviewSnapshot | null>("find_pending_review", {
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
    });
  },

  async addPendingReviewThread(input) {
    const validation = validatePendingReviewThreadInput(input);
    if (validation) {
      throw new Error(validation);
    }

    return invoke<PendingReviewThreadResult>("add_pending_review_thread", {
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestReviewId: input.pullRequestReviewId ?? null,
      subjectType: input.subjectType,
      path: input.path ?? null,
      body: input.body,
      line: input.line ?? null,
      side: input.side ?? null,
      startLine: input.startLine ?? null,
      startSide: input.startSide ?? null,
      replyToThreadId: input.replyToThreadId ?? null,
    });
  },

  async submitPendingReview(input) {
    const validation = validateSubmitReviewInput(input);
    if (validation) {
      throw new Error(validation);
    }

    return invoke<ReviewSubmitResult>("submit_pending_review", {
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestReviewId: input.pullRequestReviewId,
      event: input.event,
      body: input.body,
    });
  },

  async discardPendingReview(input) {
    return invoke<ReviewSubmitResult>("discard_pending_review", {
      repository: input.repository,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestReviewId: input.pullRequestReviewId,
    });
  },
};

export const offlineReviewActionClient: ReviewActionClient = {
  async setFileViewed(input) {
    return {
      ok: false,
      path: input.path,
      viewerViewedState: input.viewed ? "UNVIEWED" : "VIEWED",
      message: "A live GitHub connection is required to sync viewed files.",
    };
  },
  async ensurePendingReview() {
    throw new Error("A live GitHub connection is required to create a pending review.");
  },
  async findPendingReview() {
    return null;
  },
  async addPendingReviewThread(input) {
    const validation = validatePendingReviewThreadInput(input);
    throw new Error(validation ?? "A live GitHub connection is required to publish draft review comments.");
  },
  async submitPendingReview(input) {
    const validation = validateSubmitReviewInput(input);
    throw new Error(validation ?? "A live GitHub connection is required to submit a review.");
  },
  async discardPendingReview() {
    throw new Error("A live GitHub connection is required to discard a pending review.");
  },
};
