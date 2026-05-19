# Narview V1 Issues

Dependency-ordered implementation slices for [Narview V1](../2026-05-18-narview-v1.md).

| Order | Title | Type | Status | Blocked by | Stories | File |
|---:|---|---|---|---|---|---|
| 1 | Launchable Guided Review Shell | AFK | done | None | 12, 13, 14, 31, 39, 40, 41 | [01-launchable-guided-review-shell.md](./01-launchable-guided-review-shell.md) |
| 2 | OAuth Sign-In And Secure Session | HITL | done | 01-launchable-guided-review-shell.md | 1, 2, 54, 55 | [02-oauth-sign-in-and-secure-session.md](./02-oauth-sign-in-and-secure-session.md) |
| 3 | Workspace Repositories And Active PR List | AFK | done | 02-oauth-sign-in-and-secure-session.md | 3, 5, 6, 7, 52, 53 | [03-workspace-repositories-and-active-pr-list.md](./03-workspace-repositories-and-active-pr-list.md) |
| 4 | Quick-Open PR And Review Session Resume | AFK | done | 02-oauth-sign-in-and-secure-session.md | 4, 8, 12 | [04-quick-open-pr-and-review-session-resume.md](./04-quick-open-pr-and-review-session-resume.md) |
| 5 | Incremental GitHub PR Data Cache | AFK | done | 03-workspace-repositories-and-active-pr-list.md, 04-quick-open-pr-and-review-session-resume.md | 46, 47, 48, 49, 50, 51, 52, 53 | [05-incremental-github-pr-data-cache.md](./05-incremental-github-pr-data-cache.md) |
| 6 | Review Overview With Hotspots And Readiness | AFK | done | 05-incremental-github-pr-data-cache.md | 9, 10, 11, 37, 38, 45 | [06-review-overview-with-hotspots-and-readiness.md](./06-review-overview-with-hotspots-and-readiness.md) |
| 7 | Review Queue And Local Reviewed State | AFK | done | 05-incremental-github-pr-data-cache.md | 15, 16, 17, 18, 19, 20, 21, 22 | [07-review-queue-and-local-reviewed-state.md](./07-review-queue-and-local-reviewed-state.md) |
| 8 | GitHub Thread Replies And Resolve Actions | AFK | done | 07-review-queue-and-local-reviewed-state.md | 23, 24, 25, 26, 47 | [08-github-thread-replies-and-resolve-actions.md](./08-github-thread-replies-and-resolve-actions.md) |
| 9 | Confirmed Bulk Review Actions | AFK | ready | 08-github-thread-replies-and-resolve-actions.md | 27, 28 | [09-confirmed-bulk-review-actions.md](./09-confirmed-bulk-review-actions.md) |
| 10 | File Changes And Viewed State | AFK | ready | 05-incremental-github-pr-data-cache.md | 29, 30, 36 | [10-file-changes-and-viewed-state.md](./10-file-changes-and-viewed-state.md) |
| 11 | Lazy Diff Viewer With Context Expansion | AFK | ready | 10-file-changes-and-viewed-state.md | 31, 32, 33, 34, 35, 36 | [11-lazy-diff-viewer-with-context-expansion.md](./11-lazy-diff-viewer-with-context-expansion.md) |
| 12 | Thread-Centered Guided Review Flow | AFK | ready | 08-github-thread-replies-and-resolve-actions.md, 11-lazy-diff-viewer-with-context-expansion.md | 13, 14, 15, 21, 22, 23, 24, 25, 26, 39, 40 | [12-thread-centered-guided-review-flow.md](./12-thread-centered-guided-review-flow.md) |
| 13 | Handoff Packets | AFK | ready | 12-thread-centered-guided-review-flow.md | 42, 43, 44, 45 | [13-handoff-packets.md](./13-handoff-packets.md) |
| 14 | Command Palette And Keyboard Flow Completion | AFK | ready | 12-thread-centered-guided-review-flow.md, 13-handoff-packets.md | 39, 40, 41, 42, 43 | [14-command-palette-and-keyboard-flow-completion.md](./14-command-palette-and-keyboard-flow-completion.md) |
| 15 | Privacy, Diagnostics, And Data Controls | AFK | ready | 05-incremental-github-pr-data-cache.md | 50, 51, 54, 55 | [15-privacy-diagnostics-and-data-controls.md](./15-privacy-diagnostics-and-data-controls.md) |
| 16 | Large PR Performance Hardening | AFK | ready | 06-review-overview-with-hotspots-and-readiness.md, 11-lazy-diff-viewer-with-context-expansion.md, 12-thread-centered-guided-review-flow.md | 7, 10, 11, 33, 35, 46, 48, 52 | [16-large-pr-performance-hardening.md](./16-large-pr-performance-hardening.md) |
| 17 | Auto-Update Release Pipeline | HITL | ready | 01-launchable-guided-review-shell.md | 56, 57, 58 | [17-auto-update-release-pipeline.md](./17-auto-update-release-pipeline.md) |
| 18 | V1 End-To-End Acceptance Pass | AFK | ready | 09-confirmed-bulk-review-actions.md, 13-handoff-packets.md, 14-command-palette-and-keyboard-flow-completion.md, 15-privacy-diagnostics-and-data-controls.md, 16-large-pr-performance-hardening.md, 17-auto-update-release-pipeline.md | 1-58 | [18-v1-end-to-end-acceptance-pass.md](./18-v1-end-to-end-acceptance-pass.md) |

## Ready

- [Confirmed Bulk Review Actions](./09-confirmed-bulk-review-actions.md)
- [File Changes And Viewed State](./10-file-changes-and-viewed-state.md)
- [Lazy Diff Viewer With Context Expansion](./11-lazy-diff-viewer-with-context-expansion.md)
- [Thread-Centered Guided Review Flow](./12-thread-centered-guided-review-flow.md)
- [Handoff Packets](./13-handoff-packets.md)
- [Command Palette And Keyboard Flow Completion](./14-command-palette-and-keyboard-flow-completion.md)
- [Privacy, Diagnostics, And Data Controls](./15-privacy-diagnostics-and-data-controls.md)
- [Large PR Performance Hardening](./16-large-pr-performance-hardening.md)
- [Auto-Update Release Pipeline](./17-auto-update-release-pipeline.md)
- [V1 End-To-End Acceptance Pass](./18-v1-end-to-end-acceptance-pass.md)

## In Progress

None

## Done

- [Launchable Guided Review Shell](./01-launchable-guided-review-shell.md)
- [OAuth Sign-In And Secure Session](./02-oauth-sign-in-and-secure-session.md)
- [Workspace Repositories And Active PR List](./03-workspace-repositories-and-active-pr-list.md)
- [Quick-Open PR And Review Session Resume](./04-quick-open-pr-and-review-session-resume.md)
- [Incremental GitHub PR Data Cache](./05-incremental-github-pr-data-cache.md)
- [Review Overview With Hotspots And Readiness](./06-review-overview-with-hotspots-and-readiness.md)
- [Review Queue And Local Reviewed State](./07-review-queue-and-local-reviewed-state.md)
- [GitHub Thread Replies And Resolve Actions](./08-github-thread-replies-and-resolve-actions.md)
