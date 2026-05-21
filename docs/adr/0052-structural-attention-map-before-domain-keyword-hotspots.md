# Structural attention map before domain keyword hotspots

Narview should rank **Hotspots** from a deterministic **Attention Map** built from structural review signals such as changed symbols, dependency relationships, control-flow shape, existing review threads, checks, tests, and change size. It should not rely on domain keyword categories like `auth`, `billing`, or `payment` as the default way to identify important review areas, because Narview is meant to work across repositories whose domain language cannot be known in advance.
