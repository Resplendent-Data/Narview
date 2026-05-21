---
title: "PR Head Checkout And Clone Fallbacks"
type: AFK
status: ready
blocked_by: ["19-managed-review-clone-setup-and-health.md"]
depends_on_story_ids: [4, 5, 6, 7]
slice_order: 20
---

## What to build

Fetch and prepare Pull Request code inside the Review Clone. Narview should analyze the PR head as the primary code state, use the base branch or merge base for comparison, support same-repository PRs first, and degrade clearly when fork heads cannot be fetched.

## Acceptance criteria

- [ ] Opening a Pull Request fetches the base and head refs needed for review analysis.
- [ ] The Review Clone checks out or otherwise prepares the PR head as the primary code state.
- [ ] Diff comparison is based on the base branch or merge base rather than a synthetic merge commit.
- [ ] Same-repository PRs produce a ready analysis input state.
- [ ] Fetchable fork PRs produce a ready analysis input state.
- [ ] Unfetchable fork PRs show clone-unavailable fallback without blocking GitHub-provided review data.
- [ ] Tests cover same-repo checkout, fork checkout, fetch failure, deleted or inaccessible refs, and no synthetic merge default.

## Blocked by

- `19-managed-review-clone-setup-and-health.md`
