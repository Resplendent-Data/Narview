# Auto-Update Release Pipeline

Narview follows the Resplendent Timer pattern for desktop update checks: the app registers Tauri's updater plugin, checks GitHub Releases for `latest.json`, downloads an available update, verifies its updater signature, installs it, and relaunches the app.

Updater signing is required for release builds. Tauri does not allow unsigned update installation, so CI must have the updater private key and password before a release is published. Apple app signing and notarization are still separate and can stay deferred while Narview ships ad-hoc signed macOS release candidates.

Runtime updater endpoint:

- `https://github.com/Resplendent-Data/Narview/releases/latest/download/latest.json`

Release checklist for now:

- Confirm `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` exist in GitHub repository secrets.
- Confirm all three project versions match the intended tag.
- Create and push a SemVer tag, for example `git tag v0.1.0 && git push origin v0.1.0`.
- Confirm the GitHub Release includes macOS and Linux installers, `.sig` files, and `latest.json`.
- Use the in-app Updates panel to manually check update status from the previous signed packaged desktop app.

GitHub's latest release endpoint ignores prereleases. Because Narview's updater endpoint uses `/releases/latest/download/latest.json`, release-candidate tags such as `v0.1.0-rc.7` must be published as latest-compatible GitHub releases instead of GitHub prereleases.

Existing `0.1.0-rc.4` and `0.1.0-rc.5` installs cannot auto-update into the new signed channel because those builds were shipped without trusted signed updater metadata. Install the next signed release manually once; automatic updates should work from that build onward as long as the updater key is preserved.

Only replace the runtime updater public key in `apps/desktop/src-tauri/tauri.conf.json` when intentionally rotating the matching private key. Losing either the private key or its password breaks automatic updates for already-installed builds.
