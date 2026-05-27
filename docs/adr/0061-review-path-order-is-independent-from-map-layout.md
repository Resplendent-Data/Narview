# Review path order is independent from map layout

Narview should keep **Review Path** ordering independent from **Attention Map** layout. The map layout should optimize comprehension of clusters and relationships, while the Review Path should optimize the order in which a reviewer inspects **Review Targets**; selecting a path item can focus the map, but visual position should not itself define review priority.

Review Path ordering should be **priority-seeded and cluster-aware**. Narview should pick the next cluster from the highest-priority target in that cluster, then walk the connected Review Targets around that seed before moving to a separate unrelated cluster. This keeps hotspot urgency as the entry signal while preserving the relationship context a reviewer needs to clear one logic question at a time.
