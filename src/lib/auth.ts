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

function messageFromError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export const tauriAuthClient: AuthClient = {
  async getStatus() {
    try {
      return await invoke<AuthSession>("auth_status");
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
