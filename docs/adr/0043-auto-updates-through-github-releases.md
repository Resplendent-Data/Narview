# Auto-updates through GitHub Releases

Narview ships with auto-update support in v1 using Tauri's updater plugin, GitHub Actions release workflows, SemVer tags, and GitHub Releases as the artifact host. CI-enforced updater signing is required because Tauri will not install unsigned updates. Apple app signing and notarization remain deferred for now. Linux should ship AppImage first with additional package formats added when needed.
