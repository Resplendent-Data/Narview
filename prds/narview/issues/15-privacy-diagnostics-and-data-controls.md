---
title: "Privacy, Diagnostics, And Data Controls"
type: AFK
status: done
blocked_by: ["05-incremental-github-pr-data-cache.md"]
depends_on_story_ids: [50, 51, 54, 55]
slice_order: 15
---

## What to build

Finish privacy and local data controls. Users should be able to clear cached GitHub data without losing local review memory, explicitly reset local review history, inspect/export redacted diagnostics, and trust that Narview has no telemetry paths.

## Acceptance criteria

- [x] Users can clear cached GitHub data without deleting Reviewed, Viewed, or Review Session state.
- [x] Users can explicitly reset local review history after confirmation.
- [x] Local operational logs redact raw code, diff hunks, Review Thread bodies, OAuth tokens, and sensitive request details.
- [x] Diagnostics export is user-initiated and previewable before export.
- [x] The app has no telemetry or analytics emission paths in v1.
- [x] Tests cover cache clearing, review-history reset, log redaction, diagnostics preview/export, and no-telemetry enforcement.

## Blocked by

- `05-incremental-github-pr-data-cache.md`
