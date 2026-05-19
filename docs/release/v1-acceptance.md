# Narview V1 Acceptance

Status: Pass for V1 implementation readiness. Public distribution still requires release owner setup of updater signing secrets and optional macOS signing/notarization secrets before pushing the first release tag.

## Evidence

| Area | Result | Evidence |
|---|---|---|
| Reviewer workspace and sign-in | Pass | Smoke tests cover GitHub OAuth start, restored signed-in state, sign-out, Workspace repository save/remove, Pull Request refresh, Quick Open, Review Overview, and Review Queue entry. |
| Thread actions and local state separation | Pass | Smoke tests cover local Reviewed state, replies, resolve/unresolve, retryable and terminal GitHub write failures, confirmed Bulk Actions, partial failures, and preservation of local Reviewed state. |
| File review and diff depth | Pass | Smoke tests cover Viewed state, unified and side-by-side diff preference, lazy hunk loading, context expansion, whole-file loading, non-text fallback, and outdated thread context. |
| Session continuity | Pass | Smoke tests cover restoring the last active Pull Request after app restart and updating Review Session state while navigating threads. |
| Handoff, keyboard, privacy, and diagnostics | Pass | Smoke tests cover Handoff Packets, command palette, visible Keyboard Flow cues, theme switching, diagnostics export, redaction, no telemetry sinks, and local review history reset confirmation. |
| Large Pull Request usability | Pass | Synthetic large Pull Request tests cover generated/vendor suppression, bounded render windows, lazy diff usability, and performance thresholds before full diff content loads. |
| Release pipeline readiness | Pass | `test:release-config` validates SemVer tag flow, Tauri updater metadata, signed artifact expectations, macOS signing/notarization wiring, Linux AppImage output, and GitHub Releases metadata upload. |
| Scope audit | Pass | The implemented app remains inside V1 boundaries and avoids unsupported product surfaces listed below. |

## Validation Run

- `npm run test:v1-acceptance`
- `npm run test:release-config`
- `npm run test:smoke`
- `npm run build`
- `npm run tauri -- build --debug`
- Computer Use packaged-app check on macOS: launched `Narview.app`, opened the command palette, dismissed it with `Esc`, and marked the active Review Thread reviewed with `R`.

## Platform Readiness

- macOS local package: `Narview.app` and `Narview_0.1.0_aarch64.dmg` build successfully in debug packaging.
- macOS public release: GitHub Actions has Apple Silicon and Intel runners, certificate import support, `APPLE_SIGNING_IDENTITY`, App Store Connect API key notarization support through `APPLE_API_KEY_PATH`, and Apple ID fallback environment variables.
- Linux public release: GitHub Actions builds on `ubuntu-22.04`, installs WebKitGTK 4.1 dependencies, and keeps AppImage enabled as the V1 Linux format.
- Auto-update release path: release CI generates a temporary Tauri release config with `bundle.createUpdaterArtifacts`, `NARVIEW_UPDATER_PUBLIC_KEY`, the GitHub Releases `latest.json` endpoint, and Tauri updater signing secrets.

## Scope Audit

- Mobile apps: Not present.
- Browser-hosted app: Not present.
- Windows support: Not present for V1 release workflow or product scope.
- GitHub Enterprise Server: Not present; V1 targets github.com.
- Multiple GitHub accounts: Not present.
- Local clone or local Git operations: Not present in product behavior.
- Merging Pull Requests: Not present.
- Full GitHub review submission: Not present; only existing Review Thread reply/resolve/unresolve actions are supported.
- Creating new Review Threads: Not present.
- LLM-generated summaries or analysis: Not present.
- Direct AI code changes: Not present.
- Offline GitHub writes: Not present.
- Rich binary, image, notebook, or non-text previews: Not present beyond safe fallback cards.
- Symbol navigation or definition lookup: Not present.
- Telemetry or analytics: Not present.
- Multi-window support: Not present.
- Team-synced Reviewed or Viewed state: Not present.

## Release Gate

Before publishing a public tag, a maintainer must configure `NARVIEW_UPDATER_PUBLIC_KEY` plus `TAURI_SIGNING_PRIVATE_KEY`. For public macOS distribution, configure the Apple certificate and notarization secrets documented in [auto-updates.md](./auto-updates.md). After secrets are present, publish a matching SemVer tag such as `v0.1.0` and confirm the GitHub Release contains installers, updater signatures, and `latest.json`.
