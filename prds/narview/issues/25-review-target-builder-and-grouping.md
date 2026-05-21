---
title: "Review Target Builder And Grouping"
type: AFK
status: ready
blocked_by: ["24-structural-hotspots-and-generated-clusters.md"]
depends_on_story_ids: [23, 25, 28, 30, 31, 32]
slice_order: 25
---

## What to build

Create Review Targets from Attention Nodes and Attention Clusters. Each target should represent one coherent logic question, with tightly related nodes grouped together and oversized or unrelated groups split apart.

## Acceptance criteria

- [ ] Attention Nodes and Attention Clusters can become Review Targets.
- [ ] Same-symbol hunk splits, small caller/callee pairs, nearby test changes, and tight same-module clusters can group into one target.
- [ ] Groups split when they answer different logic questions, are too large, or are only weakly related.
- [ ] Each Review Target exposes its included nodes, reasoning, size, file/module context, and fallback status.
- [ ] Generated Clusters can become low-priority Review Targets when justified by threads or checks.
- [ ] The target builder produces stable target identities for downstream review state.
- [ ] Tests cover grouping, splitting, target reasons, mixed symbol/hunk targets, and stable identity.

## Blocked by

- `24-structural-hotspots-and-generated-clusters.md`
