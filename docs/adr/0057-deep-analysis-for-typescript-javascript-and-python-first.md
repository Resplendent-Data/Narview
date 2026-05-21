# Deep analysis for TypeScript, JavaScript, and Python first

Narview's first **Attention Map** implementation should provide deep structural analysis for TypeScript, JavaScript, and Python, while using diff hunk fallback **Attention Nodes** for other languages. This keeps the graph model language-extensible without pretending every ecosystem has equal analysis depth at launch.

Deep analysis means Narview can identify changed symbols, map hunks to enclosing symbols, create symbol-level **Attention Nodes**, detect same-file calls, detect imports and exports between changed files, relate likely test files through deterministic naming and path conventions, attach **Review Threads** to nearby symbols, and explain each node and edge. It does not imply type inference, complete runtime call graphs, framework-specific route understanding, or cross-repository analysis.
