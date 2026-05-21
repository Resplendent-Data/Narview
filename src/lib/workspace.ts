import { invoke } from "@tauri-apps/api/core";
import type { CachedCheckRun, CachedPullRequestData, CachedRateLimit } from "./pr-cache";

export interface WorkspaceRepository {
  owner: string;
  name: string;
  slug: string;
}

export interface PullRequestSummary {
  repository: string;
  number: number;
  title: string;
  authorLogin: string | null;
  isDraft: boolean;
  updatedAt: string;
  url: string;
}

export type RefreshState = "idle" | "loading" | "fresh" | "stale" | "failed" | "rate-limited";
export type ReviewCloneHealthState = "not-cloned" | "cloning" | "ready" | "stale" | "failed" | "unavailable";
export type PullRequestAnalysisInputState = "ready" | "failed" | "unavailable";

export interface RefreshStatus {
  state: RefreshState;
  message: string | null;
  rateLimitResetEpochSeconds: number | null;
  refreshedAtEpochSeconds: number | null;
}

export type BackendRefreshStatus = Omit<RefreshStatus, "state"> & {
  state: "fresh" | "failed" | "rate-limited";
};

export interface WorkspaceRepositoriesResponse {
  repositories: WorkspaceRepository[];
}

export interface PullRequestRefreshResponse {
  repositories: WorkspaceRepository[];
  pullRequests: PullRequestSummary[];
  status: BackendRefreshStatus;
}

export interface PullRequestChecksResponse {
  checks: CachedCheckRun[];
  rateLimit: CachedRateLimit;
  fetchedAtEpochMs: number;
}

export interface ReviewCloneStatus {
  repository: WorkspaceRepository;
  state: ReviewCloneHealthState;
  storagePath: string;
  storageRoot: string;
  remoteUrl: string;
  message: string | null;
  readOnly: boolean;
  writePermission: boolean;
  lastCheckedEpochMs: number;
}

export interface PullRequestAnalysisInput {
  repository: WorkspaceRepository;
  pullRequestNumber: number;
  state: PullRequestAnalysisInputState;
  reviewClone: ReviewCloneStatus;
  baseRef: string | null;
  headRef: string | null;
  baseSha: string | null;
  headSha: string | null;
  mergeBaseSha: string | null;
  comparisonRef: string | null;
  checkoutMode: string | null;
  message: string | null;
}

export type AnalysisFileContentState = "loaded" | "missing" | "unsupported" | "unavailable";

export interface AnalysisFileContent {
  path: string;
  state: AnalysisFileContentState;
  content: string | null;
  message: string | null;
}

export interface PullRequestAnalysisFilesResponse {
  repository: WorkspaceRepository;
  pullRequestNumber: number;
  headSha: string | null;
  files: AnalysisFileContent[];
}

export interface WorkspaceClient {
  listRepositories: () => Promise<WorkspaceRepositoriesResponse>;
  saveRepository: (slug: string) => Promise<WorkspaceRepositoriesResponse>;
  removeRepository: (owner: string, name: string) => Promise<WorkspaceRepositoriesResponse>;
  getReviewCloneStatus: (repository: string) => Promise<ReviewCloneStatus>;
  ensureReviewClone: (repository: string) => Promise<ReviewCloneStatus>;
  preparePullRequestReviewClone: (pullRequest: PullRequestSummary) => Promise<PullRequestAnalysisInput>;
  readPullRequestAnalysisFiles: (pullRequest: PullRequestSummary, paths: string[]) => Promise<PullRequestAnalysisFilesResponse>;
  refreshPullRequests: (includeDrafts: boolean) => Promise<PullRequestRefreshResponse>;
  fetchPullRequestData: (pullRequest: PullRequestSummary) => Promise<CachedPullRequestData>;
  fetchPullRequestChecks: (pullRequest: PullRequestSummary) => Promise<PullRequestChecksResponse>;
}

export const idleRefreshStatus: RefreshStatus = {
  state: "idle",
  message: "Save a repository, then refresh open pull requests.",
  rateLimitResetEpochSeconds: null,
  refreshedAtEpochSeconds: null,
};

const storageKey = "narview.workspace.repositories";

function messageFromError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function isDesktopRuntimeUnavailable(message: string) {
  return message.includes("command") || message.includes("invoke") || message.includes("__TAURI__");
}

function readLocalRepositories(): WorkspaceRepository[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as WorkspaceRepository[];
  } catch {
    return [];
  }
}

function writeLocalRepositories(repositories: WorkspaceRepository[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, JSON.stringify(repositories));
  }
}

function parseSlug(value: string): WorkspaceRepository {
  const normalized = value
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const [owner, name] = normalized.split("/").filter(Boolean);

  if (!owner || !name) {
    throw new Error("Enter a GitHub repository as owner/name.");
  }

  return {
    owner,
    name,
    slug: `${owner}/${name}`,
  };
}

export function createUnavailableReviewCloneStatus(repositorySlug: string, message: string): ReviewCloneStatus {
  const repository = parseSlug(repositorySlug);
  const normalizedPath = `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}`;

  return {
    repository,
    state: "unavailable",
    storagePath: `Narview app data/review-clones/repositories/${normalizedPath}`,
    storageRoot: "Narview app data/review-clones",
    remoteUrl: `https://github.com/${repository.owner}/${repository.name}.git`,
    message,
    readOnly: true,
    writePermission: false,
    lastCheckedEpochMs: Date.now(),
  };
}

export function createUnavailablePullRequestAnalysisInput(
  pullRequest: PullRequestSummary,
  message: string,
): PullRequestAnalysisInput {
  return {
    repository: parseSlug(pullRequest.repository),
    pullRequestNumber: pullRequest.number,
    state: "unavailable",
    reviewClone: createUnavailableReviewCloneStatus(pullRequest.repository, message),
    baseRef: null,
    headRef: null,
    baseSha: null,
    headSha: null,
    mergeBaseSha: null,
    comparisonRef: null,
    checkoutMode: null,
    message,
  };
}

const localWorkspaceClient: WorkspaceClient = {
  async listRepositories() {
    return { repositories: readLocalRepositories() };
  },

  async saveRepository(slug) {
    const repository = parseSlug(slug);
    const repositories = readLocalRepositories().filter(
      (existing) => existing.slug.toLowerCase() !== repository.slug.toLowerCase(),
    );
    repositories.push(repository);
    repositories.sort((left, right) => left.slug.localeCompare(right.slug));
    writeLocalRepositories(repositories);

    return { repositories };
  },

  async removeRepository(owner, name) {
    const key = `${owner}/${name}`.toLowerCase();
    const repositories = readLocalRepositories().filter((repository) => repository.slug.toLowerCase() !== key);
    writeLocalRepositories(repositories);

    return { repositories };
  },

  async getReviewCloneStatus(repository) {
    return createUnavailableReviewCloneStatus(repository, "Desktop runtime unavailable for managed Review Clones.");
  },

  async ensureReviewClone(repository) {
    return createUnavailableReviewCloneStatus(repository, "Desktop runtime required to initialize a managed Review Clone.");
  },

  async preparePullRequestReviewClone(pullRequest) {
    return createUnavailablePullRequestAnalysisInput(
      pullRequest,
      "Desktop runtime required to prepare a Pull Request Review Clone.",
    );
  },

  async readPullRequestAnalysisFiles(pullRequest, paths) {
    return {
      repository: parseSlug(pullRequest.repository),
      pullRequestNumber: pullRequest.number,
      headSha: null,
      files: paths.map((path) => ({
        path,
        state: "unavailable",
        content: null,
        message: "Desktop runtime required to read Pull Request analysis files.",
      })),
    };
  },

  async refreshPullRequests() {
    return {
      repositories: readLocalRepositories(),
      pullRequests: [],
      status: {
        state: "failed",
        message: "Desktop runtime unavailable for GitHub refresh.",
        rateLimitResetEpochSeconds: null,
        refreshedAtEpochSeconds: null,
      },
    };
  },

  async fetchPullRequestData() {
    throw new Error("Desktop runtime unavailable for Pull Request review data.");
  },

  async fetchPullRequestChecks() {
    throw new Error("Desktop runtime unavailable for GitHub checks.");
  },
};

export const tauriWorkspaceClient: WorkspaceClient = {
  async listRepositories() {
    try {
      return await invoke<WorkspaceRepositoriesResponse>("list_workspace_repositories");
    } catch {
      return localWorkspaceClient.listRepositories();
    }
  },

  async saveRepository(slug) {
    try {
      return await invoke<WorkspaceRepositoriesResponse>("save_workspace_repository", { slug });
    } catch (error) {
      if (isDesktopRuntimeUnavailable(messageFromError(error))) {
        return localWorkspaceClient.saveRepository(slug);
      }
      throw new Error(messageFromError(error));
    }
  },

  async removeRepository(owner, name) {
    try {
      return await invoke<WorkspaceRepositoriesResponse>("remove_workspace_repository", { owner, name });
    } catch (error) {
      if (isDesktopRuntimeUnavailable(messageFromError(error))) {
        return localWorkspaceClient.removeRepository(owner, name);
      }
      throw new Error(messageFromError(error));
    }
  },

  async getReviewCloneStatus(repository) {
    try {
      return await invoke<ReviewCloneStatus>("get_review_clone_status", { repository });
    } catch (error) {
      if (isDesktopRuntimeUnavailable(messageFromError(error))) {
        return localWorkspaceClient.getReviewCloneStatus(repository);
      }
      throw new Error(messageFromError(error));
    }
  },

  async ensureReviewClone(repository) {
    try {
      return await invoke<ReviewCloneStatus>("ensure_review_clone", { repository });
    } catch (error) {
      if (isDesktopRuntimeUnavailable(messageFromError(error))) {
        return localWorkspaceClient.ensureReviewClone(repository);
      }
      throw new Error(messageFromError(error));
    }
  },

  async preparePullRequestReviewClone(pullRequest) {
    try {
      return await invoke<PullRequestAnalysisInput>("prepare_pull_request_review_clone", {
        repository: pullRequest.repository,
        number: pullRequest.number,
      });
    } catch (error) {
      if (isDesktopRuntimeUnavailable(messageFromError(error))) {
        return localWorkspaceClient.preparePullRequestReviewClone(pullRequest);
      }
      throw new Error(messageFromError(error));
    }
  },

  async readPullRequestAnalysisFiles(pullRequest, paths) {
    try {
      return await invoke<PullRequestAnalysisFilesResponse>("read_pull_request_analysis_files", {
        repository: pullRequest.repository,
        number: pullRequest.number,
        paths,
      });
    } catch (error) {
      if (isDesktopRuntimeUnavailable(messageFromError(error))) {
        return localWorkspaceClient.readPullRequestAnalysisFiles(pullRequest, paths);
      }
      throw new Error(messageFromError(error));
    }
  },

  async refreshPullRequests(includeDrafts) {
    try {
      return await invoke<PullRequestRefreshResponse>("refresh_pull_requests", { includeDrafts });
    } catch (error) {
      if (isDesktopRuntimeUnavailable(messageFromError(error))) {
        return localWorkspaceClient.refreshPullRequests(includeDrafts);
      }
      throw new Error(messageFromError(error));
    }
  },

  async fetchPullRequestData(pullRequest) {
    try {
      return await invoke<CachedPullRequestData>("fetch_pull_request_data", {
        repository: pullRequest.repository,
        number: pullRequest.number,
      });
    } catch (error) {
      throw new Error(messageFromError(error));
    }
  },

  async fetchPullRequestChecks(pullRequest) {
    try {
      return await invoke<PullRequestChecksResponse>("fetch_pull_request_checks", {
        repository: pullRequest.repository,
        number: pullRequest.number,
      });
    } catch (error) {
      throw new Error(messageFromError(error));
    }
  },
};
