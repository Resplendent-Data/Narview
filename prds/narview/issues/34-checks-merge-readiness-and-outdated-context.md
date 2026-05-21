---
title: "Checks Merge Readiness And Outdated Context"
type: AFK
status: ready
blocked_by: ["30-review-thread-attachment-and-file-threads.md"]
depends_on_story_ids: [62, 63]
slice_order: 34
---

## What to build

Carry Checks, Merge Readiness, and Outdated Review Thread context into the Attention Map workflow. These signals should inform Review Targets and selected target context without turning Narview into a CI log viewer or merge client.

## Acceptance criteria

- [ ] Checks and Merge Readiness remain visible in the Attention Map workflow.
- [ ] Failing Checks can contribute context to relevant Review Targets when file or path association is available.
- [ ] Detailed check views link out rather than becoming a full CI log viewer.
- [ ] Outdated Review Threads remain visible, clearly marked, and associated with their best available target or fallback context.
- [ ] Merge Readiness is review context only and does not expose merge actions.
- [ ] Tests cover check summaries, failing check context, link-outs, Outdated thread display, and no merge controls.

## Blocked by

- `30-review-thread-attachment-and-file-threads.md`
