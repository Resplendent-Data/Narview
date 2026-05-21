# Target reviewed state requires unchanged fingerprint

Narview should preserve **Reviewed** state for a **Review Target** across new pull request commits only when that target's **Target Fingerprint** is unchanged. If the same symbol or cluster changes content, the target should need re-review, while **Review Thread** Reviewed state can continue to follow GitHub thread identity.

Changed previously reviewed targets should be shown as **Needs Re-Review** rather than silently becoming indistinguishable from never-reviewed targets. They still count as remaining **Review Work**, but the label preserves useful review history.

The **Target Fingerprint** should cover the target's own reviewable content and structural identity, such as path, symbol kind, symbol name, range, normalized body, and relevant changed hunks. It should not include unrelated **Context Nodes**, because context changes should create or update their own targets rather than invalidating a different target's reviewed state.
