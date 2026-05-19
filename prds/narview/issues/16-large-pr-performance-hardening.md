---
title: "Large PR Performance Hardening"
type: AFK
status: ready
blocked_by: ["06-review-overview-with-hotspots-and-readiness.md", "11-lazy-diff-viewer-with-context-expansion.md", "12-thread-centered-guided-review-flow.md"]
depends_on_story_ids: [7, 10, 11, 33, 35, 46, 48, 52]
slice_order: 16
---

## What to build

Harden Narview against large Pull Requests using synthetic fixtures and performance tests. The app should become useful before all diff content is loaded, keep queues and file lists virtualized, keep visible diff rendering responsive, and behave clearly under GitHub rate limits.

## Acceptance criteria

- [ ] Synthetic large Pull Request fixtures cover many files, many Review Threads, huge generated files, and large diff totals.
- [ ] Review Overview and Review Queues become usable before full diff content is fetched.
- [ ] Review Queues, File Changes, and diff views use virtualization or equivalent bounded rendering.
- [ ] Lazy syntax highlighting remains limited to visible or near-visible content under stress.
- [ ] Rate-limit and partial-data states remain visible and understandable.
- [ ] Performance tests assert usable-load and interaction thresholds for large fixtures.

## Blocked by

- `06-review-overview-with-hotspots-and-readiness.md`
- `11-lazy-diff-viewer-with-context-expansion.md`
- `12-thread-centered-guided-review-flow.md`
