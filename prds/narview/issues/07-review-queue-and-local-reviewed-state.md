---
title: "Review Queue And Local Reviewed State"
type: AFK
status: ready
blocked_by: ["05-incremental-github-pr-data-cache.md"]
depends_on_story_ids: [15, 16, 17, 18, 19, 20, 21, 22]
slice_order: 7
---

## What to build

Implement Review Queues for CodeRabbit and human Review Threads with local per-user Reviewed state. Review Thread identity should be keyed by GitHub review thread ID with recovery context, and queues should support filters for CodeRabbit, human, Reviewed, unreviewed, Resolved, unresolved, and Outdated threads.

## Acceptance criteria

- [ ] The app ingests all available CodeRabbit and human Review Threads, including resolved and outdated threads.
- [ ] The app stores Reviewed state per current user and GitHub review thread ID.
- [ ] Recovery context is stored for each tracked Review Thread.
- [ ] Users can mark Review Threads Reviewed and unreviewed locally.
- [ ] Review Queues filter by CodeRabbit/human, Reviewed/unreviewed, Resolved/unresolved, and Outdated/current states.
- [ ] Outdated threads are visibly distinguished from current threads.
- [ ] Tests cover thread identity, recovery context, state persistence, filter combinations, and outdated visibility.

## Blocked by

- `05-incremental-github-pr-data-cache.md`
