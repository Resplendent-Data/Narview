# Persist analysis index, not rendered map state

Narview should persist the **Analysis Index** across app restarts, including parsed symbols, structural relationships, **Target Fingerprints**, commit identity, analysis version, and useful thread-to-target attachment metadata. The rendered **Attention Map** layout and presentation should remain rebuildable from the index and current GitHub data so UI state does not become a fragile source of truth.
