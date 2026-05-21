---
title: "Attention Map End-To-End Acceptance Pass"
type: AFK
status: ready
blocked_by: ["29-target-fingerprints-and-needs-re-review.md", "32-start-line-and-file-review-threads.md", "33-human-feedback-packets.md", "34-checks-merge-readiness-and-outdated-context.md", "35-privacy-performance-and-no-llm-hardening.md"]
depends_on_story_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65]
slice_order: 36
---

## What to build

Run the end-to-end acceptance pass for the Attention Map review workflow. Validate the redesigned review journey from opening a Pull Request through clone/index, Attention Map navigation, target review, GitHub feedback, Human Feedback Packets, re-review after updates, and final Review Confidence checks.

## Acceptance criteria

- [ ] A reviewer can open a PR into a usable Attention Map after clone and indexing.
- [ ] The reviewer can understand why top Review Targets are ordered first.
- [ ] J/K moves through the Review Path and focuses the map on selected targets.
- [ ] The reviewer can inspect changed code, head symbol context, base comparison, Context Nodes, tests, and Review Threads from the persistent inspector.
- [ ] The reviewer can mark Review Targets and Review Threads Reviewed and see accurate Review Work progress.
- [ ] The reviewer can start line-level and file-level Review Threads with immediate GitHub sync.
- [ ] The reviewer can copy a Human Feedback Packet for unresolved human feedback.
- [ ] New commits preserve unchanged Reviewed targets and mark changed targets Needs Re-Review.
- [ ] Read-Only Mode, clone-unavailable fallback, Outdated threads, generated clusters, and large PR behavior pass acceptance checks.
- [ ] A scope audit confirms out-of-scope items such as editing, command execution, LLM calls, draft reviews, Pull Request Comments, and merge actions are not accidentally exposed.

## Blocked by

- `29-target-fingerprints-and-needs-re-review.md`
- `32-start-line-and-file-review-threads.md`
- `33-human-feedback-packets.md`
- `34-checks-merge-readiness-and-outdated-context.md`
- `35-privacy-performance-and-no-llm-hardening.md`
