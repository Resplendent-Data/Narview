# Remote-first pull request review

Status: Superseded by ADR-0055

Narview reviews pull requests from remote provider data rather than requiring a local clone. This keeps switching between many pull requests fast and avoids forcing users to maintain local checkouts, at the cost of giving up local test execution and full-repository analysis in the first version.
