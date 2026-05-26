import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { setLocalStorageItem } from "./local-storage";

export type AppUpdateClient = {
  isDesktopRuntime: () => boolean;
  getCurrentVersion: () => Promise<string>;
  checkForUpdate: () => Promise<Update | null>;
  relaunch: () => Promise<void>;
};

export type AppUpdateInfo = {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
};

export type AppUpdateProgress = {
  downloaded: number;
  total: number | null;
};

export type AppUpdaterState = {
  isChecking: boolean;
  isUpdating: boolean;
  updateInfo: AppUpdateInfo | null;
  progress: AppUpdateProgress | null;
  error: string | null;
  currentVersion: string;
  lastCheckedAt: number | null;
  statusMessage: string;
  checkForUpdates: () => Promise<void>;
};

export const lastUpdateCheckStorageKey = "narview:last-update-check-at";
export const appReleaseDownloadUrl = "https://github.com/Resplendent-Data/Narview/releases";

const autoUpdateCooldownMs = 24 * 60 * 60 * 1000;
const fallbackVersion = "0.1.0";
const manualInstallMessage =
  "Signed updater metadata is not available for this build. Install the latest Narview release manually, then in-app updates can resume from signed builds.";
const signatureFailureMessage =
  "This Narview build cannot verify the published update signature. Install the latest signed release manually to rejoin automatic updates.";

function isTauriRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  const tauriWindow = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

function readLastUpdateCheckAt() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(lastUpdateCheckStorageKey);
  const parsed = rawValue ? Number(rawValue) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function writeLastUpdateCheckAt(timestamp: number) {
  if (typeof window === "undefined") {
    return;
  }

  setLocalStorageItem(lastUpdateCheckStorageKey, String(timestamp));
}

function getUpdateErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/valid release json|not found|404/i.test(message)) {
    return { status: "Signed update metadata unavailable", error: manualInstallMessage };
  }

  if (/signature|\\.sig|minisign|verify/i.test(message)) {
    return { status: "Update signature could not be verified", error: signatureFailureMessage };
  }

  return { status: "Update check failed", error: message };
}

export const tauriAppUpdaterClient: AppUpdateClient = {
  isDesktopRuntime: isTauriRuntime,
  async getCurrentVersion() {
    if (!isTauriRuntime()) {
      return fallbackVersion;
    }

    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  },
  async checkForUpdate() {
    const { check } = await import("@tauri-apps/plugin-updater");
    return check();
  },
  async relaunch() {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
};

type UseAppUpdaterOptions = {
  client?: AppUpdateClient;
  eagerCheck?: boolean;
  now?: () => number;
};

export function useAppUpdater({
  client = tauriAppUpdaterClient,
  eagerCheck = true,
  now = Date.now,
}: UseAppUpdaterOptions = {}): AppUpdaterState {
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(fallbackVersion);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() => readLastUpdateCheckAt());
  const [statusMessage, setStatusMessage] = useState("Updates ready");

  const isCheckingRef = useRef(false);
  const isUpdatingRef = useRef(false);
  const lastAutoCheckAttemptRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    client
      .getCurrentVersion()
      .then((version) => {
        if (!cancelled) {
          setCurrentVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentVersion(fallbackVersion);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const installUpdate = useCallback(
    async (update: Update) => {
      if (isUpdatingRef.current) {
        return;
      }

      isUpdatingRef.current = true;
      setIsUpdating(true);
      setError(null);

      try {
        let downloaded = 0;

        setStatusMessage(`Downloading v${update.version}...`);

        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            setProgress({ downloaded: 0, total: event.data.contentLength ?? null });
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            setProgress((previous) => ({ downloaded, total: previous?.total ?? null }));
          } else if (event.event === "Finished") {
            setProgress(null);
          }
        });

        setStatusMessage("Update installed, restarting...");
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        await client.relaunch();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        setStatusMessage("Update failed");
        setIsUpdating(false);
        isUpdatingRef.current = false;
      }
    },
    [client],
  );

  const runCheck = useCallback(
    async (manual: boolean) => {
      if (isCheckingRef.current || isUpdatingRef.current) {
        return;
      }

      if (!client.isDesktopRuntime()) {
        if (manual) {
          setStatusMessage("Updates run in the desktop app.");
        }
        return;
      }

      isCheckingRef.current = true;
      setIsChecking(manual);
      setError(null);

      const checkedAt = now();
      setLastCheckedAt(checkedAt);
      writeLastUpdateCheckAt(checkedAt);
      lastAutoCheckAttemptRef.current = checkedAt;

      if (manual) {
        setStatusMessage("Checking for updates...");
      }

      try {
        const update = await client.checkForUpdate();

        if (!update) {
          setUpdateInfo(null);
          setStatusMessage("You're up to date");
          return;
        }

        setUpdateInfo({
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body ?? undefined,
          date: update.date ?? undefined,
        });
        setStatusMessage(`Update available: v${update.version}`);
        await installUpdate(update);
      } catch (caughtError) {
        const friendlyError = getUpdateErrorMessage(caughtError);
        setError(friendlyError.error);
        setStatusMessage(friendlyError.status);
      } finally {
        setIsChecking(false);
        isCheckingRef.current = false;
      }
    },
    [client, installUpdate, now],
  );

  const checkForUpdates = useCallback(() => runCheck(true), [runCheck]);

  useEffect(() => {
    if (!eagerCheck || !client.isDesktopRuntime()) {
      return;
    }

    const timestamp = now();
    const lastKnownCheck = lastCheckedAt ?? lastAutoCheckAttemptRef.current ?? 0;
    if (lastKnownCheck > 0 && timestamp - lastKnownCheck < autoUpdateCooldownMs) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void runCheck(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [client, eagerCheck, lastCheckedAt, now, runCheck]);

  return {
    isChecking,
    isUpdating,
    updateInfo,
    progress,
    error,
    currentVersion,
    lastCheckedAt,
    statusMessage,
    checkForUpdates,
  };
}
