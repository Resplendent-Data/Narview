---
title: "Managed Review Clone Setup And Health"
type: AFK
status: done
blocked_by: []
depends_on_story_ids: [2, 3, 8, 45, 46]
slice_order: 19
---

## What to build

Add the managed Review Clone foundation for saved Workspace repositories. Narview should create and reuse a repository-owned Review Clone in app-managed storage, expose clone health to the review workflow, and keep the clone separate from the user's coding checkout.

## Acceptance criteria

- [x] A saved repository can initialize a Narview-owned Review Clone without requiring the user to select their coding checkout.
- [x] A repository reuses its existing Review Clone across app restarts and repeated Pull Request opens.
- [x] Clone health states are visible to the app flow: not cloned, cloning, ready, stale, failed, and unavailable.
- [x] Review Clone storage is app-managed and clearly separate from user source directories.
- [x] Narview does not write project edits, run project commands, or create Analysis Index files inside the Review Clone.
- [x] Read-Only Mode is visible when review inspection is possible but GitHub write permission is not available.
- [x] Tests cover clone creation, reuse, health transitions, storage location, read-only boundaries, and write-permission messaging.

## Blocked by

- `None - can start immediately`
