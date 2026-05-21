# Context nodes for unchanged related code

The **Attention Map** may show unchanged related code as **Context Nodes** when that code helps explain the impact of an **Attention Node**. Context Nodes should be visually distinct from Attention Nodes and should not count as **Review Targets** by default, because they are supporting context rather than changed code the reviewer is being asked to clear.

Context Nodes should be capped or collapsed in the default map. Direct changed-to-changed relationships can remain prominent, but unchanged callers, references, or related symbols should summarize overflow with counts and provide full lists on demand so the map does not become a static-analysis dump.
