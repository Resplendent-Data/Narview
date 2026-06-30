---
name: release-new-version
description: Cut a new Narview desktop app version and trigger the GitHub Actions release by updating version files, validating, committing, pushing the branch, and pushing a SemVer tag. Use when the user asks to release, publish, cut a new version, or cut a release candidate; intentionally stop after the tag push and do not monitor CI or release assets.
---

# Release New Version

## Overview

Use this skill to cut a Narview desktop release and trigger the repository release workflow. The workflow ends after the release tag is pushed to GitHub; do not wait for GitHub Actions, release assets, updater JSON, or installer publication.

## Non-Monitoring Rule

After pushing the release tag, stop. Do not run `gh run watch`, do not repeatedly poll `gh run list`, do not wait for release completion, and do not inspect published release assets unless the user explicitly asks for a separate monitoring or verification task after the release has been triggered.

It is fine to say that pushing the tag triggered the GitHub Actions release workflow. Do not claim the GitHub release completed unless you actually performed a separate, user-requested verification later.

## Version Selection

If the user names an exact version, use that version. Strip a leading `v` for file contents and use `v<version>` for the git tag.

If the user asks for the next release and the current desktop version is a release candidate such as `0.1.0-rc.25`, increment the prerelease number to `0.1.0-rc.26`.

If the current version is stable, or the requested bump is ambiguous, ask for the intended SemVer version before editing files.

Keep Narview release candidates as normal GitHub releases, not GitHub prereleases. The updater reads GitHub's latest release endpoint, and GitHub excludes prereleases from that endpoint.

## Files To Update

Keep every desktop version source aligned:

- `apps/desktop/package.json`
- `package-lock.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`

Prefer `npm --workspace apps/desktop version <version> --no-git-tag-version` for the npm workspace version so the lockfile updates with `apps/desktop/package.json`.

After editing `apps/desktop/src-tauri/Cargo.toml`, refresh `apps/desktop/src-tauri/Cargo.lock` with a Cargo command such as:

```bash
cargo metadata --manifest-path apps/desktop/src-tauri/Cargo.toml --format-version 1
```

## Workflow

1. Inspect the release context with `git status --short --branch`, the current version files, and `.github/workflows/release.yml`.
2. Choose the target version using the version selection rules above.
3. Update only the intended release files and any already-requested code changes that should ship in this release.
4. Confirm all desktop version files contain the same target version.
5. Run release validation before committing:

```bash
npm run test:release-config
npm run test:smoke
npm run build
```

Run broader tests only when the release includes code changes whose risk warrants them.

6. Stage only the intended files.
7. Commit with a conventional release message, usually `chore: release v<version>` for a version-only release.
8. Create the local tag `v<version>`.
9. Push the current branch to GitHub.
10. Push the tag to GitHub. This triggers the release workflow.
11. Stop immediately after the tag push succeeds.

## Dirty Worktree Handling

Do not discard or revert user changes. If unrelated dirty files exist, leave them alone and stage only the release files and intended implementation files. If the release cannot be cut without including or resolving unrelated changes, ask before proceeding.

If the target tag already exists locally or remotely, stop and report the conflict instead of overwriting or force-pushing tags.

## Final Response

Report the version, tag, commit hash, branch pushed, and validations run. State plainly that the tag push triggered the GitHub Actions release workflow and that you did not monitor the build afterward, per this skill.

Do not include release asset URLs, installer status, or workflow success claims unless the user separately asked for post-trigger monitoring.
