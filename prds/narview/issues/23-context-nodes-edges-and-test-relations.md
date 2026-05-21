---
title: "Context Nodes Edges And Test Relations"
type: AFK
status: ready
blocked_by: ["22-deep-analysis-for-typescript-javascript-and-python.md"]
depends_on_story_ids: [16, 17, 18, 19, 27]
slice_order: 23
---

## What to build

Build the first explainable relationship graph around Attention Nodes. Narview should add capped Context Nodes, Call Edges, Module Edges, Test Edges, Review Edges, and same-file relationships so reviewers can see why changed areas are related without turning the map into a static-analysis dump.

## Acceptance criteria

- [ ] Changed-to-changed relationships can produce Call Edges, Module Edges, Test Edges, Review Edges, and same-file edges.
- [ ] Unchanged related symbols can appear as Context Nodes when they explain impact.
- [ ] Context Nodes are visually and structurally distinct from Attention Nodes and are not Review Targets by default.
- [ ] Context Nodes are capped or collapsed with overflow counts.
- [ ] Test relations are detected through deterministic naming and path conventions.
- [ ] Every edge exposes a plain-language explanation.
- [ ] Tests cover edge creation, Context Node caps, overflow summaries, test relation heuristics, and explainability.

## Blocked by

- `22-deep-analysis-for-typescript-javascript-and-python.md`
