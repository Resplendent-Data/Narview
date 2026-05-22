---
title: "Human Feedback Packets"
type: AFK
status: done
blocked_by: ["30-review-thread-attachment-and-file-threads.md"]
depends_on_story_ids: [57, 58, 59, 60, 61]
slice_order: 33
---

## What to build

Add Human Feedback Packets as a focused Handoff Packet mode for unresolved human-authored Review Threads. Packets should preserve raw review conversation text, include enough PR and nearby code context for verification, disclose freshness, and optionally include CodeRabbit Threads when selected.

## Acceptance criteria

- [x] Users can copy a Human Feedback Packet from the current filtered Narview view.
- [x] The default packet includes unresolved Human Review Threads.
- [x] Users can optionally include CodeRabbit Threads.
- [x] Packet output preserves raw Review Thread conversation text instead of rewriting feedback into tasks.
- [x] Packet output includes PR metadata, thread IDs, URLs, author, file path, line or file anchor, state, outdated/resolved flags, and nearby context.
- [x] Packet output includes generation time, GitHub data freshness, and source PR revision.
- [x] Packet output instructs external coding agents to verify feedback before implementing changes.
- [x] Tests cover default filtering, optional bot inclusion, raw text preservation, metadata, context, freshness, and clipboard/export behavior.

## Blocked by

- `30-review-thread-attachment-and-file-threads.md`
