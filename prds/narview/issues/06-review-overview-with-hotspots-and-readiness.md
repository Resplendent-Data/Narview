---
title: "Review Overview With Hotspots And Readiness"
type: AFK
status: ready
blocked_by: ["05-incremental-github-pr-data-cache.md"]
depends_on_story_ids: [9, 10, 11, 37, 38, 45]
slice_order: 6
---

## What to build

Build the Review Overview for a Pull Request using GitHub-provided metadata and deterministic analysis. The overview should show explainable Hotspots, Checks summary, and Merge Readiness context without LLM calls.

## Acceptance criteria

- [ ] The Review Overview shows Pull Request title, description, repository, author, branch, and high-level counts.
- [ ] Hotspots are ranked from deterministic signals and expose why each item is ranked.
- [ ] Hotspot scoring uses global defaults and local per-repository overrides where available.
- [ ] Checks are summarized with status, names, timing, and links to details where available.
- [ ] Merge Readiness context shows visible blockers such as failing checks, conflicts, unresolved threads, or blocking review state when GitHub exposes them.
- [ ] The implementation performs no LLM calls.
- [ ] Tests cover hotspot scoring, explainability, repository overrides, checks summary, readiness states, and no-LLM behavior.

## Blocked by

- `05-incremental-github-pr-data-cache.md`
