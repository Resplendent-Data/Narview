# Auto-updates through GitHub Releases

Narview ships with auto-update support in v1 using Tauri's updater plugin, signed update artifacts, GitHub Actions release workflows, SemVer tags, and GitHub Releases as the artifact host. macOS builds must be signed and notarized for public distribution, and Linux should ship AppImage first with additional package formats added when needed.
