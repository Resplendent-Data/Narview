---
title: "Analysis Index And Hunk Map MVP"
type: AFK
status: ready
blocked_by: ["20-pr-head-checkout-and-clone-fallbacks.md"]
depends_on_story_ids: [1, 9, 10, 11, 13, 15]
slice_order: 21
---

## What to build

Create the first Analysis Index and hunk-based Attention Map fallback. This slice should make every changed file reviewable even before deep symbol analysis exists, persist derived index data outside the Review Clone, and rebuild map presentation from current index and GitHub data.

## Acceptance criteria

- [ ] Narview creates an Analysis Index outside the Review Clone for the active repository, PR head commit, and analysis version.
- [ ] Changed files and diff hunks become fallback Attention Nodes when no symbol analysis is available.
- [ ] Unsupported, parser-failed, binary, and non-text changes are represented without disappearing from the map inputs.
- [ ] The rendered Attention Map presentation can be rebuilt from the Analysis Index and current Pull Request data.
- [ ] Reopening the same Pull Request can reuse valid indexed hunk data across app restarts.
- [ ] Changing commit SHA or analysis version invalidates stale index data.
- [ ] Tests cover index persistence, invalidation, hunk node creation, fallback coverage, and rebuildability.

## Blocked by

- `20-pr-head-checkout-and-clone-fallbacks.md`
