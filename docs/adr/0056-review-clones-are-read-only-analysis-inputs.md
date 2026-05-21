# Review clones are read-only analysis inputs

Narview uses **Review Clones** for **Read-Only Analysis** of repository structure, changed symbols, references, tests, and review context. It should not edit files, run builds, run tests, install dependencies, or execute project commands from the clone in this product phase, because command execution would add security, environment, and workflow complexity beyond the core review-attention problem.

Read-only analysis still allows Narview to write its own **Analysis Index** outside the clone, keyed by repository, commit, and analysis version. This keeps the repository working tree clean while allowing cached symbol graphs, **Attention Nodes**, **Attention Edges**, and related metadata to be reused.
