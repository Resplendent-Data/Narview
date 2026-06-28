# Narview V1 Acceptance

Status: Pass for V1 implementation readiness. Public distribution can ship ad-hoc signed macOS installers for now, and auto-installing updates require signed Tauri updater metadata because Tauri does not allow unsigned update installation.

## Evidence

| Area | Result | Evidence |
|---|---|---|
| Reviewer workspace and review flow | Pass | Smoke tests cover deterministic Review Stacks, Review Layers, active diff rendering, Pull Request switching, GitHub navigation, and external opener wiring. |
| Viewed state and local review continuity | Pass | Smoke tests cover GitHub Viewed sync, background stack sync, partial failure rollback, header and keyboard Viewed actions, and viewed-file collapse behavior. |
| File review and diff depth | Pass | Smoke tests cover active diff rendering, freshly fetched patches, Review Clone patch recovery, focus mode, All Files filtering, and symbol reference navigation. |
| Pending Review workflow | Pass | Smoke tests cover adding a line comment to the Pending Review, submitting review comments, approval submission without draft comments, reconnecting to existing pending drafts, and inline GitHub write errors. |
| Keyboard, updates, and diagnostics | Pass | Smoke tests cover keyboard movement between Review Layers, Pull Request picker shortcut behavior, update checks, diagnostics, redaction, and no telemetry sinks. |
| Large Pull Request usability | Pass | Synthetic large Pull Request tests cover generated/vendor handling, bounded render windows, lazy diff usability, and performance thresholds before full diff content loads. |
| Release pipeline readiness | Pass | `test:release-config` validates SemVer tag flow, runtime updater config, Apple Silicon macOS and Linux installer jobs, Linux AppImage output, and signed updater metadata publishing. |
| Scope audit | Pass | The implemented app remains inside V1 boundaries and avoids unsupported product surfaces listed below. |

## Validation Run

- `npm run test:v1-acceptance`
- `npm run test:release-config`
- `npm run test:smoke`
- `npm run build`
- `npm run tauri -- build --debug`
- `npm run mobile:analyze`
- `npm run mobile:test`
- Computer Use packaged-app check on macOS: launched `Narview.app`, opened the command palette, dismissed it with `Esc`, and marked the active Review Thread reviewed with `R`.

## Platform Readiness

- macOS local package: `Narview.app` and `Narview_0.1.0_aarch64.dmg` build successfully in debug packaging.
- macOS public release: GitHub Actions builds Apple Silicon installers. Apple signing and notarization are deferred.
- Linux public release: GitHub Actions builds on `ubuntu-22.04`, installs WebKitGTK 4.1 dependencies, and keeps AppImage enabled as the V1 Linux format.
- Auto-update runtime path: the desktop app registers Tauri's updater plugin, checks the Narview GitHub Releases `latest.json` endpoint, downloads available updates, verifies signed updater metadata, installs them, and relaunches.

## Scope Audit

- Mobile Client: Present in monorepo but outside desktop V1 release gate.
- Browser-hosted app: Not present.
- Windows support: Not present for V1 release workflow or product scope.
- GitHub Enterprise Server: Not present; V1 targets github.com.
- Multiple GitHub accounts: Not present.
- User-managed local checkout mutation: Not present; Review Clones are Narview-managed read-only analysis inputs.
- Merging Pull Requests: Not present.
- LLM-generated summaries or analysis: Not present.
- Direct AI code changes: Not present.
- Offline GitHub writes: Not present.
- Rich binary, image, notebook, or non-text previews: Not present beyond safe fallback cards.
- Symbol navigation or definition lookup: Not present.
- Telemetry or analytics: Not present.
- Multi-window support: Not present.
- Team-synced Reviewed or Viewed state: Not present.

## Release Gate

Before publishing a public tag, confirm the installer jobs pass, updater signing secrets are configured, and the tag matches project versions such as `v0.1.0`. Keep the updater signing key stable across releases.
