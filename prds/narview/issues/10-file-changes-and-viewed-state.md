---
title: "File Changes And Viewed State"
type: AFK
status: done
blocked_by: ["05-incremental-github-pr-data-cache.md"]
depends_on_story_ids: [29, 30, 36]
slice_order: 10
---

## What to build

Implement File Change navigation and local per-user Viewed state. File attention must remain separate from Review Thread attention, and binary or non-text files should be visible as changed files without rich preview behavior.

## Acceptance criteria

- [x] The app lists File Changes for a Pull Request with status and basic metadata.
- [x] Users can mark File Changes Viewed and unviewed locally.
- [x] Viewed state persists per current user and File Change identity.
- [x] Marking a File Change Viewed does not mark related Review Threads Reviewed.
- [x] Binary, image, and non-text file changes appear in the file list with appropriate fallback states.
- [x] Tests cover Viewed persistence, Viewed/Reviewed separation, file filtering, and binary/non-text awareness.

## Blocked by

- `05-incremental-github-pr-data-cache.md`
