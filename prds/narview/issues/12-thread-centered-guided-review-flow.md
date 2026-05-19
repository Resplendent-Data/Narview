---
title: "Thread-Centered Guided Review Flow"
type: AFK
status: done
blocked_by: ["08-github-thread-replies-and-resolve-actions.md", "11-lazy-diff-viewer-with-context-expansion.md"]
depends_on_story_ids: [13, 14, 15, 21, 22, 23, 24, 25, 26, 39, 40]
slice_order: 12
---

## What to build

Connect Review Queues, diff context, inspector actions, and Keyboard Flow into the real Guided Review Workspace. A reviewer should be able to move from a queue item to its relevant diff context, inspect thread details, reply, resolve, mark Reviewed, move to the next item, and use focus mode without losing state.

## Acceptance criteria

- [x] Selecting a Review Queue item focuses the relevant thread detail and diff context.
- [x] Outdated threads show older-diff context clearly in the flow.
- [x] The inspector exposes mark Reviewed, reply, resolve, and unresolve actions.
- [x] Keyboard actions support next/previous thread, Reviewed toggle, resolve, reply focus, file open, and focus mode.
- [x] Visible shortcut cues match the active keyboard bindings.
- [x] Review Session state updates as the user navigates the flow.
- [x] Tests cover queue-to-diff navigation, inspector actions, keyboard review loop, outdated presentation, focus mode, and session updates.

## Blocked by

- `08-github-thread-replies-and-resolve-actions.md`
- `11-lazy-diff-viewer-with-context-expansion.md`
