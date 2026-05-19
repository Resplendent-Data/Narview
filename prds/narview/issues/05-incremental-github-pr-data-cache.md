---
title: "Incremental GitHub PR Data Cache"
type: AFK
status: ready
blocked_by: ["03-workspace-repositories-and-active-pr-list.md", "04-quick-open-pr-and-review-session-resume.md"]
depends_on_story_ids: [46, 47, 48, 49, 50, 51, 52, 53]
slice_order: 5
---

## What to build

Implement the local cache and incremental GitHub data fetch model for Pull Requests. Narview should fetch metadata, Review Threads, file summaries, Checks, and rate-limit information before expensive diff content, preserve offline-readable data, bound cache growth, support pinning, and keep local review state separate from cached GitHub data.

## Acceptance criteria

- [ ] Pull Request metadata, Review Threads, file summaries, and Checks can be cached locally.
- [ ] Cached data is readable when the network is unavailable.
- [ ] GitHub writes are not queued while offline and show clear network-required failures.
- [ ] Cache eviction is bounded by size and recency.
- [ ] Pinned Pull Requests are protected from normal eviction.
- [ ] Cache clearing removes fetched GitHub data without deleting Reviewed, Viewed, or Review Session state.
- [ ] Refresh behavior supports open, focus, manual refresh, and restrained active Pull Request background refresh.
- [ ] Tests cover incremental fetch ordering, offline reads, eviction, pinning, cache clearing, and rate-limit-aware refresh.

## Blocked by

- `03-workspace-repositories-and-active-pr-list.md`
- `04-quick-open-pr-and-review-session-resume.md`
