# Auto-Update Release Pipeline

Narview follows the Resplendent Timer pattern for desktop update checks: the app registers Tauri's updater plugin, checks GitHub Releases for `latest.json`, downloads an available update, installs it, and relaunches the app.

Signing deferred: Apple app signing, notarization, and CI-enforced updater signing secrets are intentionally not required yet. Tauri still requires signed updater metadata before an installed app can accept an update, so real auto-installing releases will need updater signing enabled before public distribution.

Runtime updater endpoint:

- `https://github.com/Resplendent-Data/Narview/releases/latest/download/latest.json`

Release checklist for now:

- Confirm all three project versions match the intended tag.
- Create and push a SemVer tag, for example `git tag v0.1.0 && git push origin v0.1.0`.
- Confirm the GitHub Release includes macOS and Linux installers.
- Use the in-app Updates panel to manually check update status from the packaged desktop app.

When signing is ready:

- Replace the temporary runtime updater public key in `src-tauri/tauri.conf.json` with Narview's long-lived public key, then store the matching private key securely.
- Enable `bundle.createUpdaterArtifacts` for release builds.
- Provide `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH` plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when building.
- Re-enable `uploadUpdaterJson` in the release workflow so GitHub Releases receive `latest.json`.
- Add Apple certificate/notarization secrets only when public macOS distribution needs them.
