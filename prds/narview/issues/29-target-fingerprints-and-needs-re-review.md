---
title: "Target Fingerprints And Needs Re-Review"
type: AFK
status: done
blocked_by: ["28-reviewed-state-for-targets-and-threads.md"]
depends_on_story_ids: [52, 53, 54]
slice_order: 29
---

## What to build

Add Target Fingerprints and Needs Re-Review behavior. Previously Reviewed targets should stay Reviewed when their reviewable content is unchanged, and become Needs Re-Review when new commits change the target's own content.

## Acceptance criteria

- [x] Each Review Target receives a Target Fingerprint based on structural identity and reviewable content.
- [x] Unchanged target fingerprints preserve Reviewed state across new commits.
- [x] Changed target fingerprints become Needs Re-Review and count as remaining Review Work.
- [x] Needs Re-Review is visually distinct from never-reviewed and Reviewed states.
- [x] Context Node changes do not invalidate a different target's fingerprint.
- [x] Review Thread Reviewed state continues to follow GitHub thread identity.
- [x] Tests cover unchanged carry-forward, changed re-review, context-only changes, display state, and progress counts.

## Blocked by

- `28-reviewed-state-for-targets-and-threads.md`
