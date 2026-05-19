---
title: "Workspace Repositories And Active PR List"
type: AFK
status: done
blocked_by: ["02-oauth-sign-in-and-secure-session.md"]
depends_on_story_ids: [3, 5, 6, 7, 52, 53]
slice_order: 3
---

## What to build

Build the Workspace repository list and active Pull Request list for saved github.com repositories. The list should show open non-draft Pull Requests by default, allow drafts through a filter, support fast switching, and surface basic refresh/rate-limit status when GitHub data is delayed.

## Acceptance criteria

- [x] The user can save and remove GitHub repositories in the local Workspace.
- [x] The app lists open non-draft Pull Requests from saved repositories by default.
- [x] The user can include or exclude draft Pull Requests with a filter.
- [x] The user can switch between listed Pull Requests without local clone assumptions.
- [x] GitHub refresh status is visible when data is loading, stale, failed, or rate-limited.
- [x] Tests cover repository persistence, PR filtering, refresh states, and rate-limit display behavior.

## Blocked by

- `02-oauth-sign-in-and-secure-session.md`
