---
title: "Privacy Performance And No-LLM Hardening"
type: AFK
status: done
blocked_by: ["24-structural-hotspots-and-generated-clusters.md", "33-human-feedback-packets.md"]
depends_on_story_ids: [17, 21, 22, 64]
slice_order: 35
---

## What to build

Harden the Attention Map workflow for privacy, large Pull Requests, and the LLM-free product boundary. Synthetic large PRs should remain usable, Analysis Index and diagnostics should respect redaction rules, and ranking/packet construction should not call LLM services.

## Acceptance criteria

- [x] Large synthetic PR fixtures cover many nodes, generated clusters, context references, Review Threads, and fallback files.
- [x] Attention Map load and Review Path navigation meet responsive usability thresholds on large fixtures.
- [x] Context Nodes and generated clusters remain capped or collapsed under load.
- [x] Analysis Index storage, logs, and diagnostics avoid leaking OAuth tokens or sensitive review data beyond explicit user-controlled exports.
- [x] Attention Map generation, Hotspot ranking, Review Path ordering, and Human Feedback Packet construction perform no LLM calls.
- [x] Tests cover large fixture performance, cluster caps, index privacy, diagnostics redaction, and no-LLM enforcement.

## Blocked by

- `24-structural-hotspots-and-generated-clusters.md`
- `33-human-feedback-packets.md`
