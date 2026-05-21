---
title: "Start Line And File Review Threads"
type: AFK
status: ready
blocked_by: ["30-review-thread-attachment-and-file-threads.md", "31-read-only-mode-and-github-write-permissions.md"]
depends_on_story_ids: [41, 42, 43, 44, 46]
slice_order: 32
---

## What to build

Allow reviewers to Start Review Thread from Narview with immediate GitHub publishing. Line-level Review Threads require valid changed-line anchors, File Review Threads support whole-file feedback, and Pull Request Comments or draft review submission remain out of scope.

## Acceptance criteria

- [ ] Users can start a line-level Review Thread from a valid changed-line anchor inside a Review Target.
- [ ] Users can start a File Review Thread from a file-level Review Target.
- [ ] Start Review Thread publishes immediately to GitHub and syncs the resulting thread back into Narview.
- [ ] Invalid or unavailable line anchors disable line-level publishing with clear explanation.
- [ ] Pull Request Comment creation is not exposed.
- [ ] Draft review submission, approve, and request-changes flows are not exposed.
- [ ] After starting a thread, Narview may offer to mark the originating Review Target Reviewed.
- [ ] Tests cover line-level create, file-level create, invalid anchor handling, read-only disabled states, post-write sync, and out-of-scope controls.

## Blocked by

- `30-review-thread-attachment-and-file-threads.md`
- `31-read-only-mode-and-github-write-permissions.md`
