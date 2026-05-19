# Auto-Update Release Pipeline

Narview publishes desktop releases through GitHub Actions and GitHub Releases. A release starts from an existing SemVer tag such as `v0.1.0`; the tag version must match `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.

The release workflow builds macOS Apple Silicon, macOS Intel, and Linux x64 AppImage artifacts. During release, CI renders `src-tauri/tauri.release.conf.template.json` into a temporary config that enables `bundle.createUpdaterArtifacts`, injects the GitHub Releases updater endpoint, and signs updater artifacts with Tauri's updater signing key.

Required repository variable:

- `NARVIEW_UPDATER_PUBLIC_KEY`: public key from `npm run tauri -- signer generate`.

Required repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: private key content or private key path used by Tauri to sign updater artifacts.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional password for the private key. Leave unset only when the generated key has no password.

Optional macOS signing and notarization secrets:

- `APPLE_CERTIFICATE`: base64-encoded `.p12` Developer ID Application or Apple Distribution certificate.
- `APPLE_CERTIFICATE_PASSWORD`: password for the exported `.p12` certificate.
- `KEYCHAIN_PASSWORD`: temporary CI keychain password.
- `APPLE_API_ISSUER`: App Store Connect API issuer ID.
- `APPLE_API_KEY`: App Store Connect API key ID.
- `APPLE_API_KEY_BASE64`: base64-encoded `.p8` private key file. CI writes it to `APPLE_API_KEY_PATH`.
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`: Apple ID notarization fallback values if API key notarization is not used.

Release checklist:

- Generate a Tauri updater key pair and store only the public key in `NARVIEW_UPDATER_PUBLIC_KEY`.
- Store the private signing key in `TAURI_SIGNING_PRIVATE_KEY`.
- Confirm all three project versions match the intended tag.
- Create and push a SemVer tag, for example `git tag v0.1.0 && git push origin v0.1.0`.
- Confirm the GitHub Release includes installers, `.sig` files, and `latest.json`.
