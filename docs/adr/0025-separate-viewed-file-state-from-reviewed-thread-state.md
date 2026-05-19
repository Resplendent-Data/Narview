# Separate Viewed file state from Reviewed thread state

Narview tracks **Viewed** state for **File Changes** separately from **Reviewed** state for **Review Threads**. This keeps file-level review progress distinct from thread-level attention, so inspecting a CodeRabbit thread does not imply that the entire changed file has been reviewed.
