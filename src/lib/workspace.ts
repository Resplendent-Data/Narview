import { invoke } from "@tauri-apps/api/core";

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

export interface WorkspaceClient {
  listRepositories: () => Promise<WorkspaceRepositoriesResponse>;
  saveRepository: (slug: string) => Promise<WorkspaceRepositoriesResponse>;
  removeRepository: (owner: string, name: string) => Promise<WorkspaceRepositoriesResponse>;
  refreshPullRequests: (includeDrafts: boolean) => Promise<PullRequestRefreshResponse>;
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
      if (messageFromError(error).includes("command")) {
        return localWorkspaceClient.saveRepository(slug);
      }
      throw new Error(messageFromError(error));
    }
  },

  async removeRepository(owner, name) {
    try {
      return await invoke<WorkspaceRepositoriesResponse>("remove_workspace_repository", { owner, name });
    } catch (error) {
      if (messageFromError(error).includes("command")) {
        return localWorkspaceClient.removeRepository(owner, name);
      }
      throw new Error(messageFromError(error));
    }
  },

  async refreshPullRequests(includeDrafts) {
    try {
      return await invoke<PullRequestRefreshResponse>("refresh_pull_requests", { includeDrafts });
    } catch (error) {
      if (messageFromError(error).includes("command")) {
        return localWorkspaceClient.refreshPullRequests(includeDrafts);
      }
      throw new Error(messageFromError(error));
    }
  },
};
