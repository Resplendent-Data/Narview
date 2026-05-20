# Auto-updates through GitHub Releases

Narview ships with auto-update support in v1 using Tauri's updater plugin, GitHub Actions release workflows, SemVer tags, and GitHub Releases as the artifact host. Apple app signing, notarization, and CI-enforced updater signing are deferred for now, but Tauri still requires signed update metadata before automatic installation can be used for public releases. Linux should ship AppImage first with additional package formats added when needed.
