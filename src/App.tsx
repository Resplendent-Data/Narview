import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  ChevronRight,
  Command,
  Eye,
  FileCode2,
  Github,
  GitPullRequest,
  Keyboard,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Kbd } from "./components/ui/kbd";
import { type AuthClient, type AuthSession, type OAuthStartResponse, tauriAuthClient } from "./lib/auth";
import { cn } from "./lib/utils";

type Theme = "light" | "dark";

type AppProps = {
  authClient?: AuthClient;
};

const checkingSession: AuthSession = {
  state: "checking",
  storage: {
    available: true,
    message: null,
  },
  accountLogin: null,
  tokenHint: null,
};

const queues = [
  { id: "needs-attention", label: "Needs attention", count: 14, tone: "danger" as const },
  { id: "coderabbit", label: "CodeRabbit", count: 11, tone: "warning" as const },
  { id: "humans", label: "Human threads", count: 3, tone: "info" as const },
  { id: "resolved-unreviewed", label: "Resolved + unreviewed", count: 6, tone: "muted" as const },
];

const hotspots = [
  { file: "src/auth/session.ts", score: 92, reason: "8 threads, 214 changed lines" },
  { file: "src/review/queue.ts", score: 77, reason: "High thread density" },
  { file: "migrations/20260518_reviews.sql", score: 61, reason: "Schema change" },
];

const files = [
  { path: "src/auth/session.ts", status: "modified", lines: "+128 -86", viewed: false },
  { path: "src/review/queue.ts", status: "modified", lines: "+94 -21", viewed: true },
  { path: "src-tauri/src/github.rs", status: "added", lines: "+188", viewed: false },
  { path: "assets/review-map.png", status: "binary", lines: "binary", viewed: false },
];

const selectedThread = {
  author: "coderabbitai",
  title: "Guard stale session reuse after token rotation",
  file: "src/auth/session.ts",
  line: 142,
  state: "Unresolved",
  reviewed: false,
  outdated: false,
  body:
    "The rotated token path can still reuse the previous session cache entry. Consider invalidating the session record before returning the new credential.",
};

const commands = [
  { label: "Next review thread", shortcut: "J" },
  { label: "Mark thread reviewed", shortcut: "R" },
  { label: "Resolve thread", shortcut: "E" },
  { label: "Toggle focus mode", shortcut: "F" },
  { label: "Copy handoff packet", shortcut: "H" },
];

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getAuthBadge(session: AuthSession) {
  if (session.state === "signed-in") {
    return { label: "Signed in", variant: "success" as const };
  }
  if (session.state === "storage-unavailable") {
    return { label: "Secure storage unavailable", variant: "warning" as const };
  }
  if (session.state === "checking") {
    return { label: "Checking session", variant: "muted" as const };
  }
  return { label: "Signed out", variant: "muted" as const };
}

export function App({ authClient = tauriAuthClient }: AppProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [focusMode, setFocusMode] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession>(checkingSession);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [oauthFlow, setOauthFlow] = useState<OAuthStartResponse | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    let active = true;

    authClient
      .getStatus()
      .then((session) => {
        if (active) {
          setAuthSession(session);
        }
      })
      .catch((error) => {
        if (active) {
          setAuthError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, [authClient]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCommandPalette) {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "f") {
        setFocusMode((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const activeQueue = useMemo(() => queues[0], []);
  const authBadge = getAuthBadge(authSession);
  const signInDisabled = authBusy || authSession.state === "storage-unavailable";

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const flow = await authClient.startSignIn();
      setOauthFlow(flow);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePollSignIn = async () => {
    if (!oauthFlow) {
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = await authClient.pollSignIn(oauthFlow.flowId);
      if (response.session) {
        setAuthSession(response.session);
      }
      if (response.state === "authorized") {
        setOauthFlow(null);
      } else if (response.message) {
        setAuthError(response.message);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      setAuthSession(await authClient.signOut());
      setOauthFlow(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GitPullRequest className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">Narview</h1>
            <p className="mt-1 text-xs text-muted-foreground">acme/payments-web #482</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden min-w-0 items-center gap-2 sm:flex" aria-label="GitHub session">
            {authSession.state === "signed-in" ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
            )}
            <Badge variant={authBadge.variant}>{authBadge.label}</Badge>
            {authSession.accountLogin && <span className="max-w-28 truncate text-xs text-muted-foreground">@{authSession.accountLogin}</span>}
          </div>
          {authSession.state === "signed-in" ? (
            <Button variant="outline" size="sm" onClick={handleSignOut} disabled={authBusy}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleSignIn} disabled={signInDisabled}>
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Sign in
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}>
            <Command className="h-3.5 w-3.5" aria-hidden="true" />
            Command
            <Kbd>⌘K</Kbd>
          </Button>
          <Button variant="ghost" size="icon" aria-label={themeLabel} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </header>

      <main
        className={cn(
          "grid h-[calc(100vh-3rem)] min-h-[680px]",
          focusMode ? "grid-cols-[1fr]" : "grid-cols-[280px_minmax(520px,1fr)_340px]",
        )}
      >
        {!focusMode && (
          <aside aria-label="Review map" className="border-r border-border bg-card/40">
            <section className="border-b border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Review queues</h2>
                <Badge variant="danger">{activeQueue.count}</Badge>
              </div>
              <div className="space-y-1">
                {queues.map((queue) => (
                  <button
                    className={cn(
                      "flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent",
                      queue.id === activeQueue.id && "bg-accent text-accent-foreground",
                    )}
                    key={queue.id}
                    type="button"
                  >
                    <span>{queue.label}</span>
                    <Badge variant={queue.tone}>{queue.count}</Badge>
                  </button>
                ))}
              </div>
            </section>

            <section className="border-b border-border p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Hotspots</h2>
              <div className="space-y-2">
                {hotspots.map((hotspot) => (
                  <button className="w-full rounded-md border border-border p-2 text-left hover:bg-accent" key={hotspot.file} type="button">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{hotspot.file}</span>
                      <Badge variant={hotspot.score > 80 ? "danger" : "warning"}>{hotspot.score}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{hotspot.reason}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">File changes</h2>
              <div className="space-y-1">
                {files.map((file) => (
                  <button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent" key={file.path} type="button">
                    {file.viewed ? <Eye className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> : <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    <span className="text-xs text-muted-foreground">{file.lines}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        )}

        <section aria-label="Review canvas" className="flex min-w-0 flex-col">
          <div className="flex h-11 items-center justify-between border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="danger">Needs attention</Badge>
              <span className="truncate text-sm font-medium">{selectedThread.file}</span>
              <span className="text-xs text-muted-foreground">line {selectedThread.line}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setFocusMode((current) => !current)}>
              {focusMode ? <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />}
              {focusMode ? "Exit focus" : "Focus"}
              <Kbd>F</Kbd>
            </Button>
          </div>

          <div className="grid flex-1 grid-rows-[auto_1fr] overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Review Path 1 of 14</p>
                  <h2 className="mt-1 text-base font-semibold">{selectedThread.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">CodeRabbit</Badge>
                  <Badge variant="muted">{selectedThread.state}</Badge>
                </div>
              </div>
            </div>

            <div className="overflow-auto p-4">
              <div className="overflow-hidden rounded-md border border-border font-mono text-xs">
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-muted text-muted-foreground">
                  <div className="border-r border-border px-2 py-1 text-right">138</div>
                  <div className="px-3 py-1">export async function rotateSessionToken(userId: string) {"{"}</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-rose-500/10">
                  <div className="border-r border-border px-2 py-1 text-right text-muted-foreground">139</div>
                  <div className="px-3 py-1 text-rose-700 dark:text-rose-300">- const cached = sessionCache.get(userId);</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-emerald-500/10">
                  <div className="border-r border-border px-2 py-1 text-right text-muted-foreground">140</div>
                  <div className="px-3 py-1 text-emerald-700 dark:text-emerald-300">+ sessionCache.delete(userId);</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] border-b border-border bg-emerald-500/10">
                  <div className="border-r border-border px-2 py-1 text-right text-muted-foreground">141</div>
                  <div className="px-3 py-1 text-emerald-700 dark:text-emerald-300">+ const cached = await sessionStore.read(userId);</div>
                </div>
                <div className="grid grid-cols-[56px_1fr] bg-muted text-muted-foreground">
                  <div className="border-r border-border px-2 py-1 text-right">142</div>
                  <div className="px-3 py-1">return issueRotatedToken(cached, userId);</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Keyboard className="h-3.5 w-3.5" aria-hidden="true" /> Keyboard Flow</span>
                <span>Next <Kbd>J</Kbd></span>
                <span>Reviewed <Kbd>R</Kbd></span>
                <span>Resolve <Kbd>E</Kbd></span>
                <span>Reply <Kbd>⇧R</Kbd></span>
              </div>
            </div>
          </div>
        </section>

        {!focusMode && (
          <aside aria-label="Inspector" className="border-l border-border bg-card/40">
            <div className="border-b border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Review Thread
              </div>
              <p className="text-xs text-muted-foreground">@{selectedThread.author}</p>
              <p className="mt-3 text-sm leading-6">{selectedThread.body}</p>
            </div>

            <div className="space-y-2 border-b border-border p-3">
              <Button className="w-full justify-between" variant="secondary">
                Mark reviewed
                <Kbd>R</Kbd>
              </Button>
              <Button className="w-full justify-between" variant="outline">
                Reply
                <Kbd>⇧R</Kbd>
              </Button>
              <Button className="w-full justify-between" variant="outline">
                Resolve
                <Kbd>E</Kbd>
              </Button>
            </div>

            <div className="border-b border-border p-3" aria-label="GitHub session details">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Github className="h-4 w-4" aria-hidden="true" />
                GitHub Session
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={authBadge.variant}>{authBadge.label}</Badge>
                </div>
                {authSession.accountLogin && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Account</span>
                    <span className="min-w-0 truncate">@{authSession.accountLogin}</span>
                  </div>
                )}
                {authSession.tokenHint && (
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    OS secure storage
                  </div>
                )}
                {authSession.storage.message && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">{authSession.storage.message}</p>}
                {oauthFlow && (
                  <div className="space-y-2 rounded-md border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Device code</span>
                      <Kbd>{oauthFlow.userCode}</Kbd>
                    </div>
                    <a className="block truncate text-xs text-sky-700 underline dark:text-sky-300" href={oauthFlow.verificationUriComplete ?? oauthFlow.verificationUri}>
                      {oauthFlow.verificationUri.replace("https://", "")}
                    </a>
                    <Button className="w-full justify-between" variant="secondary" onClick={handlePollSignIn} disabled={authBusy}>
                      Check sign-in
                      <Kbd>{oauthFlow.intervalSeconds}s</Kbd>
                    </Button>
                  </div>
                )}
                {authError && <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive" role="status">{authError}</p>}
              </div>
            </div>

            <div className="p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">Merge readiness</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" aria-hidden="true" /> 7 checks passing</div>
                <div className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-amber-500" aria-hidden="true" /> 14 threads need attention</div>
              </div>
            </div>
          </aside>
        )}
      </main>

      <Dialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-background/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-20 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-2 shadow-xl">
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <Dialog.Description className="sr-only">
              Search and run Narview review actions from the keyboard.
            </Dialog.Description>
            <div className="flex h-10 items-center gap-2 border-b border-border px-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input className="h-full flex-1 bg-transparent text-sm outline-none" placeholder="Search commands" aria-label="Search commands" />
              <Kbd>Esc</Kbd>
            </div>
            <div className="py-2">
              {commands.map((command) => (
                <button className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-accent" key={command.label} type="button">
                  <span>{command.label}</span>
                  <Kbd>{command.shortcut}</Kbd>
                </button>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
