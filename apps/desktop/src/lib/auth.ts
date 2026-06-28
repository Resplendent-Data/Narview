import { invoke } from "@tauri-apps/api/core";

export type AuthSessionState = "checking" | "signed-in" | "signed-out" | "storage-unavailable";

export interface AuthSession {
  state: AuthSessionState;
  storage: {
    available: boolean;
    message: string | null;
  };
  accountLogin: string | null;
  tokenHint: string | null;
}

export interface OAuthStartResponse {
  flowId: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresAtEpochSeconds: number;
  intervalSeconds: number;
  openedBrowser: boolean;
}

export interface OAuthPollResponse {
  state: "pending" | "slow-down" | "authorized" | "denied" | "expired";
  intervalSeconds: number;
  message: string | null;
  session: AuthSession | null;
}

export interface AuthClient {
  getStatus: () => Promise<AuthSession>;
  startSignIn: () => Promise<OAuthStartResponse>;
  pollSignIn: (flowId: string) => Promise<OAuthPollResponse>;
  signOut: () => Promise<AuthSession>;
}

const desktopUnavailableSession: AuthSession = {
  state: "storage-unavailable",
  storage: {
    available: false,
    message: "Desktop runtime unavailable.",
  },
  accountLogin: null,
  tokenHint: null,
};

const sessionRestoreTimedOutSession: AuthSession = {
  state: "signed-out",
  storage: {
    available: true,
    message: "OS secure storage did not respond while restoring your previous GitHub session. Sign in again to continue.",
  },
  accountLogin: null,
  tokenHint: null,
};

const authStatusTimeoutMs = 3_500;

function messageFromError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutValue: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(timeoutValue), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export const tauriAuthClient: AuthClient = {
  async getStatus() {
    const statusRequest = invoke<AuthSession>("auth_status");
    statusRequest.catch(() => undefined);

    try {
      return await withTimeout(statusRequest, authStatusTimeoutMs, sessionRestoreTimedOutSession);
    } catch {
      return desktopUnavailableSession;
    }
  },

  async startSignIn() {
    try {
      return await invoke<OAuthStartResponse>("start_github_oauth");
    } catch (error) {
      throw new Error(messageFromError(error));
    }
  },

  async pollSignIn(flowId: string) {
    try {
      return await invoke<OAuthPollResponse>("poll_github_oauth", { flowId });
    } catch (error) {
      throw new Error(messageFromError(error));
    }
  },

  async signOut() {
    try {
      return await invoke<AuthSession>("sign_out");
    } catch (error) {
      throw new Error(messageFromError(error));
    }
  },
};
