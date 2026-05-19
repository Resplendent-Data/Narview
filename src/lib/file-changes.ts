import type { CachedFileSummary } from "./pr-cache";

export type FileViewedFilter = "all" | "viewed" | "unviewed";
export type FileKind = "text" | "image" | "binary" | "non-text";
export type FileKindFilter = "all" | FileKind;

export interface FileChangeFilters {
  viewed: FileViewedFilter;
  kind: FileKindFilter;
}

export interface FileChangeRecoveryContext {
  pullRequestKey: string;
  path: string;
  status: CachedFileSummary["status"];
  additions: number;
  deletions: number;
  kind: FileKind;
}

export interface StoredFileChangeState {
  id: string;
  viewed: boolean;
  viewedAtEpochMs: number | null;
  recoveryContext: FileChangeRecoveryContext;
}

export interface FileChangeStore {
  version: 1;
  users: Record<string, Record<string, StoredFileChangeState>>;
}

export interface FileChangeView {
  id: string;
  file: CachedFileSummary;
  viewed: boolean;
  changedLines: number;
  kind: FileKind;
  fallbackLabel: string | null;
  recoveryContext: FileChangeRecoveryContext;
}

export interface FileChangeCounts {
  total: number;
  viewed: number;
  unviewed: number;
  nonText: number;
}

export const fileChangeStorageKey = "narview.fileChangeState.v1";

export const defaultFileChangeFilters: FileChangeFilters = {
  viewed: "all",
  kind: "all",
};

const imageExtensions = new Set([".avif", ".gif", ".heic", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const nonTextExtensions = new Set([".docx", ".ipynb", ".key", ".numbers", ".pages", ".pdf", ".pptx", ".sqlite", ".xlsx"]);

export function readFileChangeStore(): FileChangeStore {
  if (typeof window === "undefined") {
    return { version: 1, users: {} };
  }

  const raw = window.localStorage.getItem(fileChangeStorageKey);
  if (!raw) {
    return { version: 1, users: {} };
  }

  try {
    return JSON.parse(raw) as FileChangeStore;
  } catch {
    return { version: 1, users: {} };
  }
}

export function writeFileChangeStore(store: FileChangeStore) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(fileChangeStorageKey, JSON.stringify(store));
  }
}

export function syncFileChanges(
  userKey: string,
  pullRequestKey: string,
  files: CachedFileSummary[],
  store = readFileChangeStore(),
) {
  const next: FileChangeStore = {
    version: 1,
    users: {
      ...store.users,
      [userKey]: {
        ...(store.users[userKey] ?? {}),
      },
    },
  };
  const userFiles = next.users[userKey];

  for (const file of files) {
    const id = getFileChangeId(pullRequestKey, file);
    const existing = userFiles[id];
    userFiles[id] = {
      id,
      viewed: existing?.viewed ?? false,
      viewedAtEpochMs: existing?.viewedAtEpochMs ?? null,
      recoveryContext: buildFileChangeRecoveryContext(pullRequestKey, file),
    };
  }

  writeFileChangeStore(next);
  return next;
}

export function setFileChangeViewed(
  userKey: string,
  fileChangeId: string,
  viewed: boolean,
  nowEpochMs = Date.now(),
  store = readFileChangeStore(),
) {
  const existing = store.users[userKey]?.[fileChangeId];
  if (!existing) {
    return store;
  }

  const next: FileChangeStore = {
    version: 1,
    users: {
      ...store.users,
      [userKey]: {
        ...store.users[userKey],
        [fileChangeId]: {
          ...existing,
          viewed,
          viewedAtEpochMs: viewed ? nowEpochMs : null,
        },
      },
    },
  };

  writeFileChangeStore(next);
  return next;
}

export function buildFileChangeViews(
  userKey: string,
  pullRequestKey: string,
  files: CachedFileSummary[],
  store = readFileChangeStore(),
): FileChangeView[] {
  const userFiles = store.users[userKey] ?? {};

  return files.map((file) => {
    const id = getFileChangeId(pullRequestKey, file);
    const stored = userFiles[id];
    const recoveryContext = stored?.recoveryContext ?? buildFileChangeRecoveryContext(pullRequestKey, file);
    const changedLines = file.additions + file.deletions;

    return {
      id,
      file,
      viewed: stored?.viewed ?? false,
      changedLines,
      kind: recoveryContext.kind,
      fallbackLabel: getFallbackLabel(recoveryContext.kind),
      recoveryContext,
    };
  });
}

export function filterFileChanges(files: FileChangeView[], filters: FileChangeFilters) {
  return files.filter((view) => {
    if (filters.viewed === "viewed" && !view.viewed) {
      return false;
    }
    if (filters.viewed === "unviewed" && view.viewed) {
      return false;
    }
    if (filters.kind !== "all" && view.kind !== filters.kind) {
      return false;
    }

    return true;
  });
}

export function buildFileChangeCounts(files: FileChangeView[]): FileChangeCounts {
  return {
    total: files.length,
    viewed: files.filter((view) => view.viewed).length,
    unviewed: files.filter((view) => !view.viewed).length,
    nonText: files.filter((view) => view.kind !== "text").length,
  };
}

export function getFileChangeId(pullRequestKey: string, file: CachedFileSummary) {
  return `${pullRequestKey}:${file.path}`;
}

export function buildFileChangeRecoveryContext(
  pullRequestKey: string,
  file: CachedFileSummary,
): FileChangeRecoveryContext {
  return {
    pullRequestKey,
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    kind: getFileKind(file),
  };
}

export function getFileKind(file: CachedFileSummary): FileKind {
  const lowerPath = file.path.toLowerCase();
  const extension = getExtension(lowerPath);

  if (imageExtensions.has(extension)) {
    return "image";
  }
  if (file.status === "binary") {
    return "binary";
  }
  if (nonTextExtensions.has(extension)) {
    return "non-text";
  }
  return "text";
}

function getExtension(path: string) {
  const lastSlash = path.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot) : "";
}

function getFallbackLabel(kind: FileKind) {
  if (kind === "image") {
    return "Image fallback";
  }
  if (kind === "binary") {
    return "Binary fallback";
  }
  if (kind === "non-text") {
    return "Non-text fallback";
  }
  return null;
}
