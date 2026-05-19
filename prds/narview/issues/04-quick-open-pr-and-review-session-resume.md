---
title: "Quick-Open PR And Review Session Resume"
type: AFK
status: ready
blocked_by: ["02-oauth-sign-in-and-secure-session.md"]
depends_on_story_ids: [4, 8, 12]
slice_order: 4
---

## What to build

Add Pull Request URL quick-open and local Review Session persistence. Narview should focus one Pull Request at a time and restore the user's last active queue, filter, thread, file, mode, and nearby position after switching Pull Requests or restarting the app.

## Acceptance criteria

- [ ] The user can paste or enter a GitHub Pull Request URL and open it without saving the repository first.
- [ ] Invalid, unsupported, and inaccessible URLs produce clear user-facing errors.
- [ ] The app stores Review Session state per Pull Request and current user.
- [ ] The app restores the last active context after app restart or Pull Request switch.
- [ ] Restored Review Session state does not imply Reviewed or Viewed progress.
- [ ] Tests cover URL parsing, error states, one-PR-at-a-time routing, and session restoration.

## Blocked by

- `02-oauth-sign-in-and-secure-session.md`
