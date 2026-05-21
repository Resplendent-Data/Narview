---
title: "Review Target Builder And Grouping"
type: AFK
status: done
blocked_by: ["24-structural-hotspots-and-generated-clusters.md"]
depends_on_story_ids: [23, 25, 28, 30, 31, 32]
slice_order: 25
---

## What to build

Create Review Targets from Attention Nodes and Attention Clusters. Each target should represent one coherent logic question, with tightly related nodes grouped together and oversized or unrelated groups split apart.

## Acceptance criteria

- [x] Attention Nodes and Attention Clusters can become Review Targets.
- [x] Same-symbol hunk splits, small caller/callee pairs, nearby test changes, and tight same-module clusters can group into one target.
- [x] Groups split when they answer different logic questions, are too large, or are only weakly related.
- [x] Each Review Target exposes its included nodes, reasoning, size, file/module context, and fallback status.
- [x] Generated Clusters can become low-priority Review Targets when justified by threads or checks.
- [x] The target builder produces stable target identities for downstream review state.
- [x] Tests cover grouping, splitting, target reasons, mixed symbol/hunk targets, and stable identity.

## Blocked by

- `24-structural-hotspots-and-generated-clusters.md`
