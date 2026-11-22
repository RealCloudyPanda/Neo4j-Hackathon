# 0004. Usage evidence owns occurrence identity and flow uncertainty

Status: accepted (2026-11-21)

The Usage evidence module owns reference discovery, immutable alias traversal, final consumer coordinates, uncertainty notes, graph row construction and repair occurrence matching. Extraction, graph loading and repair comparison use that interface rather than independently constructing snapshot prefixes or decoding colon-delimited positions. Existing graph IDs and review output remain compatible.

The implementation keeps graph persistence separate: the loader still executes Cypher and the review still judges only explicit meaning tags. Usage evidence supplies data, not a guessed meaning or verdict. A transform or unresolved alias carries uncertainty to the graph so the review remains conservative. Two consumers on one line retain distinct columns; a source position that disappears is missing evidence, never an asserted repair.

Tests exercise discovery through the same interface as extraction and retain extraction-to-graph-to-repair regressions for qualified fields, aliases, partial repairs and moved source. There is no second test-only identity interface.
