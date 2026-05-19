---
title: "Auto-Update Release Pipeline"
type: HITL
status: ready
blocked_by: ["01-launchable-guided-review-shell.md"]
depends_on_story_ids: [56, 57, 58]
slice_order: 17
---

## What to build

Create the v1 release pipeline with GitHub Actions, SemVer tags, GitHub Releases, Tauri updater artifacts, signed updates, macOS signing/notarization, and Linux AppImage output. Human setup is required for signing credentials, notarization secrets, and release ownership.

## Acceptance criteria

- [ ] GitHub Actions can build release artifacts for macOS and Linux.
- [ ] Release workflow is driven by SemVer tags.
- [ ] GitHub Releases receive installers, updater artifacts, and update metadata.
- [ ] Tauri updater artifacts are signed and verifiable.
- [ ] macOS builds support signing and notarization when required secrets are configured.
- [ ] Linux AppImage is produced for v1 distribution.
- [ ] Tests or dry-run checks validate updater metadata, artifact presence, and signing configuration.

## Blocked by

- `01-launchable-guided-review-shell.md`
