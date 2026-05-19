# Cache clearing preserves local review state

Narview's normal cache-clearing action removes fetched GitHub metadata and diff content without deleting **Reviewed**, **Viewed**, or **Review Session** state. Forgetting local review history should be a separate explicit reset action because cache cleanup and review memory are different user intents.
