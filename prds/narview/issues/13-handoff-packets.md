---
title: "Handoff Packets"
type: AFK
status: ready
blocked_by: ["12-thread-centered-guided-review-flow.md"]
depends_on_story_ids: [42, 43, 44, 45]
slice_order: 13
---

## What to build

Add structured Handoff Packets for selected Review Threads and nearby Pull Request context. Packets should include selected threads, surrounding diff hunks, file paths, Pull Request metadata, and explicit user intent, with Markdown export for external coding agents. Narview itself must not call an LLM.

## Acceptance criteria

- [ ] Users can select Review Threads to include in a Handoff Packet.
- [ ] Users can choose or enter explicit intent for the packet.
- [ ] The structured packet preserves Review Thread IDs, file paths, Pull Request metadata, selected thread text, and nearby diff context.
- [ ] Users can copy a Markdown export generated from the structured packet.
- [ ] The feature performs no LLM calls and does not apply code changes.
- [ ] Tests cover packet structure, Markdown rendering, selected context boundaries, intent capture, and no-LLM behavior.

## Blocked by

- `12-thread-centered-guided-review-flow.md`
