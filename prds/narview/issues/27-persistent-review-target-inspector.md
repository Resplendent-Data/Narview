---
title: "Persistent Review Target Inspector"
type: AFK
status: done
blocked_by: ["26-review-path-rail-keyboard-focus-and-progress.md"]
depends_on_story_ids: [33, 34, 35]
slice_order: 27
---

## What to build

Replace modal-style target review with a persistent inspector in the Guided Review Workspace. Selecting a Review Target should keep the Attention Map and Review Path visible while showing changed context, the head version of the enclosing symbol, base comparison on demand, and related context.

## Acceptance criteria

- [x] Selecting a Review Target opens or updates a persistent inspector rather than a modal.
- [x] The inspector leads with changed context and the current head version of the enclosing symbol or fallback hunk.
- [x] Base version comparison is available on demand.
- [x] Related Context Nodes, edges, tests, and target reasons are visible from the inspector.
- [x] The Attention Map and Review Path remain usable while the inspector is active on desktop layouts.
- [x] Constrained layouts adapt without forcing repetitive modal open/close review.
- [x] Tests cover selection, content rendering, base-on-demand behavior, related context, layout persistence, and fallback targets.

## Blocked by

- `26-review-path-rail-keyboard-focus-and-progress.md`
