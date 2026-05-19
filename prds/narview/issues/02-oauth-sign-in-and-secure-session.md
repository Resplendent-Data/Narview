---
title: "OAuth Sign-In And Secure Session"
type: HITL
status: ready
blocked_by: ["01-launchable-guided-review-shell.md"]
depends_on_story_ids: [1, 2, 54, 55]
slice_order: 2
---

## What to build

Add OAuth-only GitHub sign-in for v1, backed by OS secure token storage and a clear signed-in/signed-out session state. Establish the privacy baseline: no telemetry, no token leakage into cache/logs, and redacted local diagnostics foundations.

## Acceptance criteria

- [ ] The app can start a GitHub OAuth browser sign-in flow using configured app credentials.
- [ ] The app stores OAuth tokens only through the OS secure storage abstraction.
- [ ] The app can restore a signed-in session without exposing the token to the frontend.
- [ ] The app supports sign-out and clears the secure token.
- [ ] Secure-storage unavailable states fail clearly and do not write tokens to plain files.
- [ ] Logs and diagnostics do not include OAuth tokens.
- [ ] Tests cover session restore, sign-out, secure-storage failure, and no-token-in-cache/log behavior.

## Blocked by

- `01-launchable-guided-review-shell.md`
