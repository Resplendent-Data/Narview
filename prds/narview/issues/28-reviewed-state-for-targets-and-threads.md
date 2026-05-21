---
title: "Reviewed State For Targets And Threads"
type: AFK
status: done
blocked_by: ["26-review-path-rail-keyboard-focus-and-progress.md", "27-persistent-review-target-inspector.md"]
depends_on_story_ids: [47, 48, 49, 50, 51, 55, 56]
slice_order: 28
---

## What to build

Extend the local Reviewed state model so Review Targets and Review Threads share one primary attention state while keeping GitHub Resolved state separate. Users should explicitly mark Review Targets Reviewed, including no-feedback targets, without thread handling automatically clearing target work.

## Acceptance criteria

- [x] Review Targets can be marked Reviewed and unreviewed locally per current user.
- [x] Review Threads retain local Reviewed state and remain separate from GitHub Resolved state.
- [x] No-feedback targets require explicit Reviewed action.
- [x] Resolving a Review Thread in Narview still marks that Review Thread Reviewed.
- [x] Reviewing all Review Threads inside a Review Target does not automatically mark the target Reviewed.
- [x] Review Work counts update correctly for targets and threads.
- [x] Tests cover per-user target Reviewed state, thread Reviewed state, Resolved separation, no-feedback action, and progress counts.

## Blocked by

- `26-review-path-rail-keyboard-focus-and-progress.md`
- `27-persistent-review-target-inspector.md`
