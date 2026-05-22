import type { PullRequestSummary } from "./workspace";

export interface ReviewSessionSnapshot {
  activeQueueId: string;
  includeDrafts: boolean;
  threadKey: string;
  filePath: string;
  nearbyLine: number;
  updatedAtEpochMs: number;
}

export interface RestoredReviewSession {
  pullRequest: PullRequestSummary;
  snapshot: ReviewSessionSnapshot;
}

export interface ReviewSessionClient {
  saveSession: (userKey: string, pullRequest: PullRequestSummary, snapshot: ReviewSessionSnapshot) => Promise<void>;
  loadSession: (userKey: string, pullRequestKey: string) => Promise<RestoredReviewSession | null>;
  loadLastSession: (userKey: string) => Promise<RestoredReviewSession | null>;
}

export interface SessionStore {
  sessions: Record<string, RestoredReviewSession>;
  lastByUser: Record<string, string>;
}

export const reviewSessionStorageKey = "narview.reviewSessions.v1";

export function getPullRequestKey(pullRequest: Pick<PullRequestSummary, "repository" | "number">) {
  return `${pullRequest.repository}#${pullRequest.number}`;
}

export function parsePullRequestUrl(value: string): PullRequestSummary {
  const input = value.trim();
  const withProtocol = input.startsWith("github.com/") ? `https://${input}` : input;
  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid GitHub Pull Request URL.");
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("Narview v1 supports github.com Pull Request URLs.");
  }

  const [owner, repositoryName, resource, number] = url.pathname.split("/").filter(Boolean);
  const pullRequestNumber = Number(number);

  if (!owner || !repositoryName || resource !== "pull" || !Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new Error("Enter a GitHub Pull Request URL like https://github.com/owner/repo/pull/123.");
  }

  return {
    repository: `${owner}/${repositoryName}`,
    number: pullRequestNumber,
    title: `${repositoryName} #${pullRequestNumber}`,
    authorLogin: null,
    isDraft: false,
    updatedAt: new Date().toISOString(),
    url: `https://github.com/${owner}/${repositoryName}/pull/${pullRequestNumber}`,
  };
}

export function readReviewSessionStore(): SessionStore {
  if (typeof window === "undefined") {
    return { sessions: {}, lastByUser: {} };
  }

  const raw = window.localStorage.getItem(reviewSessionStorageKey);
  if (!raw) {
    return { sessions: {}, lastByUser: {} };
  }

  try {
    return JSON.parse(raw) as SessionStore;
  } catch {
    return { sessions: {}, lastByUser: {} };
  }
}

export function writeReviewSessionStore(store: SessionStore) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(reviewSessionStorageKey, JSON.stringify(store));
  }
}

function sessionKey(userKey: string, pullRequestKey: string) {
  return `${userKey}:${pullRequestKey}`;
}

export function clearReviewSessionStore() {
  writeReviewSessionStore({ sessions: {}, lastByUser: {} });
}

export function reviewSessionStats(store = readReviewSessionStore()) {
  return {
    sessions: Object.keys(store.sessions).length,
    users: Object.keys(store.lastByUser).length,
  };
}

export const localReviewSessionClient: ReviewSessionClient = {
  async saveSession(userKey, pullRequest, snapshot) {
    const store = readReviewSessionStore();
    const pullRequestKey = getPullRequestKey(pullRequest);
    const key = sessionKey(userKey, pullRequestKey);

    store.sessions[key] = {
      pullRequest,
      snapshot,
    };
    store.lastByUser[userKey] = key;
    writeReviewSessionStore(store);
  },

  async loadSession(userKey, pullRequestKey) {
    const store = readReviewSessionStore();

    return store.sessions[sessionKey(userKey, pullRequestKey)] ?? null;
  },

  async loadLastSession(userKey) {
    const store = readReviewSessionStore();
    const key = store.lastByUser[userKey];

    return key ? store.sessions[key] ?? null : null;
  },
};
