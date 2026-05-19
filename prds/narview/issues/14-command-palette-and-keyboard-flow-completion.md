---
title: "Command Palette And Keyboard Flow Completion"
type: AFK
status: ready
blocked_by: ["12-thread-centered-guided-review-flow.md", "13-handoff-packets.md"]
depends_on_story_ids: [39, 40, 41, 42, 43]
slice_order: 14
---

## What to build

Complete the command palette and Keyboard Flow across the main review experience. The palette should expose navigation, queue filters, file jumps, focus mode, review actions, Bulk Actions, Handoff Packet creation, and shortcut discovery.

## Acceptance criteria

- [ ] The command palette can be opened from keyboard and UI affordances.
- [ ] The palette lists contextual review, navigation, filter, focus, bulk, and handoff commands.
- [ ] Commands execute the same behavior as their visible UI controls.
- [ ] Keyboard shortcuts are discoverable from the palette and visible action surfaces.
- [ ] Disabled or unavailable commands explain why they cannot run.
- [ ] Tests cover command search, contextual availability, command execution, shortcut display, and parity with UI controls.

## Blocked by

- `12-thread-centered-guided-review-flow.md`
- `13-handoff-packets.md`
