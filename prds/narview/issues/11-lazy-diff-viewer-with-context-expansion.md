---
title: "Lazy Diff Viewer With Context Expansion"
type: AFK
status: done
blocked_by: ["10-file-changes-and-viewed-state.md"]
depends_on_story_ids: [31, 32, 33, 34, 35, 36]
slice_order: 11
---

## What to build

Build the lazy diff viewer for File Changes and Review Thread context. It should support unified and side-by-side modes, broad multi-language syntax highlighting for visible content, paged hunk loading, surrounding context expansion, full-file fetch, and non-text fallback states.

## Acceptance criteria

- [x] Users can toggle unified and side-by-side diff modes, and the preference is remembered locally.
- [x] Diff hunks load on demand rather than requiring full Pull Request diff download.
- [x] Syntax highlighting supports many languages and runs only for visible or near-visible content.
- [x] Users can expand surrounding context around a hunk.
- [x] Users can fetch and view the whole file on demand.
- [x] Non-text files show a clear fallback with an option to open in GitHub.
- [x] Tests cover diff modes, lazy hunk loading, highlighting boundaries, context expansion, full-file fetch, and non-text fallback.

## Blocked by

- `10-file-changes-and-viewed-state.md`
