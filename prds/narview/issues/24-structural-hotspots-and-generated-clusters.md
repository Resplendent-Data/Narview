---
title: "Structural Hotspots And Generated Clusters"
type: AFK
status: ready
blocked_by: ["23-context-nodes-edges-and-test-relations.md"]
depends_on_story_ids: [20, 21, 22, 26, 64, 65]
slice_order: 24
---

## What to build

Replace domain-keyword hotspot scoring with structural Hotspots and generated-change clustering. Narview should identify high-attention areas from graph and review signals, keep generated/vendor/build changes visible as collapsed clusters, and avoid using path words like auth or billing as generic risk categories.

## Acceptance criteria

- [ ] Hotspots are ranked from structural signals such as changed symbols, edge density, control-flow shape, Review Threads, Checks, tests, and change size.
- [ ] Domain keyword categories are not used as default hotspot inputs.
- [ ] Generated, vendor, build, and similar low-signal files appear as Generated Clusters by default.
- [ ] Generated Clusters expose changed file and line counts without dominating the Review Path unless threads or failing checks justify it.
- [ ] Attention Map density uses progressive disclosure for clusters and lower-signal nodes.
- [ ] Hotspot reasons are visible and deterministic.
- [ ] Tests cover structural ranking, generated cluster behavior, no domain keyword scoring, cluster expansion, and no-LLM behavior.

## Blocked by

- `23-context-nodes-edges-and-test-relations.md`
