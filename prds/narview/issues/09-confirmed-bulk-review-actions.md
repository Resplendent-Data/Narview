---
title: "Confirmed Bulk Review Actions"
type: AFK
status: done
blocked_by: ["08-github-thread-replies-and-resolve-actions.md"]
depends_on_story_ids: [27, 28]
slice_order: 9
---

## What to build

Implement Bulk Actions for selected Review Threads and File Changes. Local-state bulk actions can execute directly with undoable feedback, while GitHub-changing bulk resolve and unresolve actions require explicit confirmation and clear partial-failure handling.

## Acceptance criteria

- [x] Users can select multiple Review Threads from a Review Queue.
- [x] Users can bulk mark selected Review Threads Reviewed or unreviewed.
- [x] Users can bulk resolve and unresolve selected Review Threads after explicit confirmation.
- [x] Bulk resolve marks affected threads Reviewed locally when the GitHub write succeeds.
- [x] Partial failures report which items succeeded, failed, and can be retried.
- [x] Tests cover local bulk actions, confirmed GitHub bulk actions, cancellation, partial failures, and local side effects.

## Blocked by

- `08-github-thread-replies-and-resolve-actions.md`
