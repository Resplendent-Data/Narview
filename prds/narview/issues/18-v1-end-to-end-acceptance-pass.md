---
title: "V1 End-To-End Acceptance Pass"
type: AFK
status: done
blocked_by: ["09-confirmed-bulk-review-actions.md", "13-handoff-packets.md", "14-command-palette-and-keyboard-flow-completion.md", "15-privacy-diagnostics-and-data-controls.md", "16-large-pr-performance-hardening.md", "17-auto-update-release-pipeline.md"]
depends_on_story_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58]
slice_order: 18
---

## What to build

Run the v1 acceptance pass across the whole Narview workflow. Validate the approved scope end to end, close gaps against the PRD, verify macOS/Linux readiness where available, and produce a release-readiness checklist.

## Acceptance criteria

- [x] A reviewer can sign in, configure a Workspace, open a Pull Request, inspect the Review Overview, and enter a Review Queue.
- [x] A reviewer can mark threads Reviewed, reply, resolve, unresolve, use Bulk Actions, and see correct local/GitHub state separation.
- [x] A reviewer can inspect file changes, toggle Viewed, use unified/side-by-side diffs, expand context, and fetch full files.
- [x] A reviewer can resume Review Session state after switching Pull Requests or restarting.
- [x] Handoff Packets, command palette, Keyboard Flow, privacy controls, diagnostics, and no-telemetry behavior pass acceptance checks.
- [x] Large Pull Request fixture performance meets the v1 usability threshold.
- [x] Release pipeline dry-run or real release checks pass for configured platforms.
- [x] A scope audit confirms out-of-scope items have not been accidentally implemented as unsupported partial features.

## Blocked by

- `09-confirmed-bulk-review-actions.md`
- `13-handoff-packets.md`
- `14-command-palette-and-keyboard-flow-completion.md`
- `15-privacy-diagnostics-and-data-controls.md`
- `16-large-pr-performance-hardening.md`
- `17-auto-update-release-pipeline.md`
