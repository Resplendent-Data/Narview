---
title: "GitHub Thread Replies And Resolve Actions"
type: AFK
status: ready
blocked_by: ["07-review-queue-and-local-reviewed-state.md"]
depends_on_story_ids: [23, 24, 25, 26, 47]
slice_order: 8
---

## What to build

Add GitHub write actions for existing Review Threads: Reply, Resolve, and Unresolve. Resolving from Narview should mark the Review Thread Reviewed locally, while unresolving should not remove Reviewed state. Writes require network access and should fail clearly when unavailable or unauthorized.

## Acceptance criteria

- [ ] Users can add a Reply to an existing Review Thread.
- [ ] Users can Resolve an existing Review Thread.
- [ ] Users can Unresolve an existing Review Thread.
- [ ] Resolving in Narview marks the thread Reviewed locally.
- [ ] Unresolving in Narview preserves existing Reviewed state.
- [ ] Offline, permission, validation, and GitHub API failures produce clear retryable or terminal error states.
- [ ] Tests cover reply, resolve, unresolve, local state side effects, network-required behavior, and failure handling.

## Blocked by

- `07-review-queue-and-local-reviewed-state.md`
