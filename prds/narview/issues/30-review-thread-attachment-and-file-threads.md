---
title: "Review Thread Attachment And File Threads"
type: AFK
status: done
blocked_by: ["27-persistent-review-target-inspector.md"]
depends_on_story_ids: [36, 37, 38, 39, 40, 62]
slice_order: 30
---

## What to build

Integrate existing GitHub Review Threads into the Attention Map workflow. Threads should attach to relevant Attention Nodes or file-level Review Targets, File Review Threads should be synced and represented, and unmapped or Outdated threads should remain visible without reviving a separate thread-only workflow.

## Acceptance criteria

- [x] Line-level Review Threads attach to the nearest relevant Attention Node when possible.
- [x] File Review Threads with no line anchor attach to file-level Review Targets.
- [x] Human Review Threads and CodeRabbit Threads are visible in selected target context.
- [x] CodeRabbit Threads act as context by default rather than one path item per bot thread.
- [x] Unmapped Review Threads remain visible as their own target or through thread filters.
- [x] Outdated Review Threads remain visible and clearly marked.
- [x] Tests cover line-level attachment, file-level attachment, CodeRabbit context behavior, human thread display, unmapped threads, and Outdated thread states.

## Blocked by

- `27-persistent-review-target-inspector.md`
