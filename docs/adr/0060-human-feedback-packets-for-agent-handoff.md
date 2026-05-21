# Human feedback packets for agent handoff

Narview should support **Human Feedback Packets** as a focused **Handoff Packet** mode for copying human-authored review feedback into an external coding agent. The packet should default to unresolved **Human Review Threads**, include thread identity, URLs, state, conversation text, and nearby context, and explicitly tell the receiving agent to verify the feedback before implementing changes.

The packet should preserve raw review conversation text rather than rewriting feedback into tasks. Narview may add a structured wrapper for pull request context, thread metadata, nearby code context, and an instruction to verify before implementing, but it should not reinterpret the human reviewer's intent.

Human Feedback Packets should be built from the user's current filtered Narview view, defaulting to unresolved human-authored threads. The packet should disclose GitHub data freshness, generation time, and source pull request revision so the user and receiving agent can tell whether the copied feedback may be stale.
