# Narview Issues

Dependency-ordered implementation slices for [Narview V1](../2026-05-18-narview-v1.md) and [Attention Map Review Workflow](../2026-05-21-attention-map-review-workflow.md).

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
| 9 | Confirmed Bulk Review Actions | AFK | done | 08-github-thread-replies-and-resolve-actions.md | 27, 28 | [09-confirmed-bulk-review-actions.md](./09-confirmed-bulk-review-actions.md) |
| 10 | File Changes And Viewed State | AFK | done | 05-incremental-github-pr-data-cache.md | 29, 30, 36 | [10-file-changes-and-viewed-state.md](./10-file-changes-and-viewed-state.md) |
| 11 | Lazy Diff Viewer With Context Expansion | AFK | done | 10-file-changes-and-viewed-state.md | 31, 32, 33, 34, 35, 36 | [11-lazy-diff-viewer-with-context-expansion.md](./11-lazy-diff-viewer-with-context-expansion.md) |
| 12 | Thread-Centered Guided Review Flow | AFK | done | 08-github-thread-replies-and-resolve-actions.md, 11-lazy-diff-viewer-with-context-expansion.md | 13, 14, 15, 21, 22, 23, 24, 25, 26, 39, 40 | [12-thread-centered-guided-review-flow.md](./12-thread-centered-guided-review-flow.md) |
| 13 | Handoff Packets | AFK | done | 12-thread-centered-guided-review-flow.md | 42, 43, 44, 45 | [13-handoff-packets.md](./13-handoff-packets.md) |
| 14 | Command Palette And Keyboard Flow Completion | AFK | done | 12-thread-centered-guided-review-flow.md, 13-handoff-packets.md | 39, 40, 41, 42, 43 | [14-command-palette-and-keyboard-flow-completion.md](./14-command-palette-and-keyboard-flow-completion.md) |
| 15 | Privacy, Diagnostics, And Data Controls | AFK | done | 05-incremental-github-pr-data-cache.md | 50, 51, 54, 55 | [15-privacy-diagnostics-and-data-controls.md](./15-privacy-diagnostics-and-data-controls.md) |
| 16 | Large PR Performance Hardening | AFK | done | 06-review-overview-with-hotspots-and-readiness.md, 11-lazy-diff-viewer-with-context-expansion.md, 12-thread-centered-guided-review-flow.md | 7, 10, 11, 33, 35, 46, 48, 52 | [16-large-pr-performance-hardening.md](./16-large-pr-performance-hardening.md) |
| 17 | Auto-Update Release Pipeline | HITL | done | 01-launchable-guided-review-shell.md | 56, 57, 58 | [17-auto-update-release-pipeline.md](./17-auto-update-release-pipeline.md) |
| 18 | V1 End-To-End Acceptance Pass | AFK | done | 09-confirmed-bulk-review-actions.md, 13-handoff-packets.md, 14-command-palette-and-keyboard-flow-completion.md, 15-privacy-diagnostics-and-data-controls.md, 16-large-pr-performance-hardening.md, 17-auto-update-release-pipeline.md | 1-58 | [18-v1-end-to-end-acceptance-pass.md](./18-v1-end-to-end-acceptance-pass.md) |
| 19 | Managed Review Clone Setup And Health | AFK | done | None | 2, 3, 8, 45, 46 | [19-managed-review-clone-setup-and-health.md](./19-managed-review-clone-setup-and-health.md) |
| 20 | PR Head Checkout And Clone Fallbacks | AFK | done | 19-managed-review-clone-setup-and-health.md | 4, 5, 6, 7 | [20-pr-head-checkout-and-clone-fallbacks.md](./20-pr-head-checkout-and-clone-fallbacks.md) |
| 21 | Analysis Index And Hunk Map MVP | AFK | done | 20-pr-head-checkout-and-clone-fallbacks.md | 1, 9, 10, 11, 13, 15 | [21-analysis-index-and-hunk-map-mvp.md](./21-analysis-index-and-hunk-map-mvp.md) |
| 22 | Deep Analysis For TypeScript JavaScript And Python | AFK | done | 21-analysis-index-and-hunk-map-mvp.md | 12, 14, 18 | [22-deep-analysis-for-typescript-javascript-and-python.md](./22-deep-analysis-for-typescript-javascript-and-python.md) |
| 23 | Context Nodes Edges And Test Relations | AFK | done | 22-deep-analysis-for-typescript-javascript-and-python.md | 16, 17, 18, 19, 27 | [23-context-nodes-edges-and-test-relations.md](./23-context-nodes-edges-and-test-relations.md) |
| 24 | Structural Hotspots And Generated Clusters | AFK | done | 23-context-nodes-edges-and-test-relations.md | 20, 21, 22, 26, 64, 65 | [24-structural-hotspots-and-generated-clusters.md](./24-structural-hotspots-and-generated-clusters.md) |
| 25 | Review Target Builder And Grouping | AFK | ready | 24-structural-hotspots-and-generated-clusters.md | 23, 25, 28, 30, 31, 32 | [25-review-target-builder-and-grouping.md](./25-review-target-builder-and-grouping.md) |
| 26 | Review Path Rail Keyboard Focus And Progress | AFK | ready | 25-review-target-builder-and-grouping.md | 23, 24, 25, 26, 28, 29, 55, 56 | [26-review-path-rail-keyboard-focus-and-progress.md](./26-review-path-rail-keyboard-focus-and-progress.md) |
| 27 | Persistent Review Target Inspector | AFK | ready | 26-review-path-rail-keyboard-focus-and-progress.md | 33, 34, 35 | [27-persistent-review-target-inspector.md](./27-persistent-review-target-inspector.md) |
| 28 | Reviewed State For Targets And Threads | AFK | ready | 26-review-path-rail-keyboard-focus-and-progress.md, 27-persistent-review-target-inspector.md | 47, 48, 49, 50, 51, 55, 56 | [28-reviewed-state-for-targets-and-threads.md](./28-reviewed-state-for-targets-and-threads.md) |
| 29 | Target Fingerprints And Needs Re-Review | AFK | ready | 28-reviewed-state-for-targets-and-threads.md | 52, 53, 54 | [29-target-fingerprints-and-needs-re-review.md](./29-target-fingerprints-and-needs-re-review.md) |
| 30 | Review Thread Attachment And File Threads | AFK | ready | 27-persistent-review-target-inspector.md | 36, 37, 38, 39, 40, 62 | [30-review-thread-attachment-and-file-threads.md](./30-review-thread-attachment-and-file-threads.md) |
| 31 | Read-Only Mode And GitHub Write Permissions | AFK | ready | 30-review-thread-attachment-and-file-threads.md | 45, 46 | [31-read-only-mode-and-github-write-permissions.md](./31-read-only-mode-and-github-write-permissions.md) |
| 32 | Start Line And File Review Threads | AFK | ready | 30-review-thread-attachment-and-file-threads.md, 31-read-only-mode-and-github-write-permissions.md | 41, 42, 43, 44, 46 | [32-start-line-and-file-review-threads.md](./32-start-line-and-file-review-threads.md) |
| 33 | Human Feedback Packets | AFK | ready | 30-review-thread-attachment-and-file-threads.md | 57, 58, 59, 60, 61 | [33-human-feedback-packets.md](./33-human-feedback-packets.md) |
| 34 | Checks Merge Readiness And Outdated Context | AFK | ready | 30-review-thread-attachment-and-file-threads.md | 62, 63 | [34-checks-merge-readiness-and-outdated-context.md](./34-checks-merge-readiness-and-outdated-context.md) |
| 35 | Privacy Performance And No-LLM Hardening | AFK | ready | 24-structural-hotspots-and-generated-clusters.md, 33-human-feedback-packets.md | 17, 21, 22, 64 | [35-privacy-performance-and-no-llm-hardening.md](./35-privacy-performance-and-no-llm-hardening.md) |
| 36 | Attention Map End-To-End Acceptance Pass | AFK | ready | 29-target-fingerprints-and-needs-re-review.md, 32-start-line-and-file-review-threads.md, 33-human-feedback-packets.md, 34-checks-merge-readiness-and-outdated-context.md, 35-privacy-performance-and-no-llm-hardening.md | 1-65 | [36-attention-map-end-to-end-acceptance-pass.md](./36-attention-map-end-to-end-acceptance-pass.md) |

## Ready

- [Review Target Builder And Grouping](./25-review-target-builder-and-grouping.md)
- [Review Path Rail Keyboard Focus And Progress](./26-review-path-rail-keyboard-focus-and-progress.md)
- [Persistent Review Target Inspector](./27-persistent-review-target-inspector.md)
- [Reviewed State For Targets And Threads](./28-reviewed-state-for-targets-and-threads.md)
- [Target Fingerprints And Needs Re-Review](./29-target-fingerprints-and-needs-re-review.md)
- [Review Thread Attachment And File Threads](./30-review-thread-attachment-and-file-threads.md)
- [Read-Only Mode And GitHub Write Permissions](./31-read-only-mode-and-github-write-permissions.md)
- [Start Line And File Review Threads](./32-start-line-and-file-review-threads.md)
- [Human Feedback Packets](./33-human-feedback-packets.md)
- [Checks Merge Readiness And Outdated Context](./34-checks-merge-readiness-and-outdated-context.md)
- [Privacy Performance And No-LLM Hardening](./35-privacy-performance-and-no-llm-hardening.md)
- [Attention Map End-To-End Acceptance Pass](./36-attention-map-end-to-end-acceptance-pass.md)

## In Progress

No issues in progress.

## Done

- [Launchable Guided Review Shell](./01-launchable-guided-review-shell.md)
- [OAuth Sign-In And Secure Session](./02-oauth-sign-in-and-secure-session.md)
- [Workspace Repositories And Active PR List](./03-workspace-repositories-and-active-pr-list.md)
- [Quick-Open PR And Review Session Resume](./04-quick-open-pr-and-review-session-resume.md)
- [Incremental GitHub PR Data Cache](./05-incremental-github-pr-data-cache.md)
- [Review Overview With Hotspots And Readiness](./06-review-overview-with-hotspots-and-readiness.md)
- [Review Queue And Local Reviewed State](./07-review-queue-and-local-reviewed-state.md)
- [GitHub Thread Replies And Resolve Actions](./08-github-thread-replies-and-resolve-actions.md)
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
- [Managed Review Clone Setup And Health](./19-managed-review-clone-setup-and-health.md)
- [PR Head Checkout And Clone Fallbacks](./20-pr-head-checkout-and-clone-fallbacks.md)
- [Analysis Index And Hunk Map MVP](./21-analysis-index-and-hunk-map-mvp.md)
- [Deep Analysis For TypeScript JavaScript And Python](./22-deep-analysis-for-typescript-javascript-and-python.md)
- [Context Nodes Edges And Test Relations](./23-context-nodes-edges-and-test-relations.md)
- [Structural Hotspots And Generated Clusters](./24-structural-hotspots-and-generated-clusters.md)
