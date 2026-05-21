---
title: "Read-Only Mode And GitHub Write Permissions"
type: AFK
status: done
blocked_by: ["30-review-thread-attachment-and-file-threads.md"]
depends_on_story_ids: [45, 46]
slice_order: 31
---

## What to build

Update GitHub permission handling for the Attention Map workflow. Narview should clearly distinguish inspection from publishing feedback, request only the minimal write permission needed for Review Threads, and degrade into Read-Only Mode when writes are unavailable.

## Acceptance criteria

- [x] Narview detects whether the current GitHub auth can publish Review Threads.
- [x] Read-Only Mode allows PR inspection, Attention Map navigation, and local Reviewed state.
- [x] Start Review Thread actions are disabled with clear explanation in Read-Only Mode.
- [x] Permission messaging explains that write access is needed to publish line-level and file-level Review Threads.
- [x] Network and permission failures produce clear retryable or terminal states.
- [x] Tests cover write-capable auth, read-only auth, missing permission, network failure, disabled actions, and messaging.

## Blocked by

- `30-review-thread-attachment-and-file-threads.md`
