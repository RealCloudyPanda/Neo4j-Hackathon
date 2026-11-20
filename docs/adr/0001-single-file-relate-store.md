# 0001. Commit a single-file `.rl` Relate store, opened read-only by everything except the builder

Status: accepted (2026-11-20)

We commit `data/contract-drift.rl` instead of a directory store with the human-readable JSON codec, because the spike showed a copied `.rl` opens in a fresh process while a directory store fails to open unless its `.cypherlite.*` lock files are also committed, which a clone or a `.gitignore` habit easily breaks. The trade-off is that judges cannot read the graph as text on GitHub, so we provide `npm run cypher`, the viewer's Cypher console, and `queries/*.cypher`; and because Relate allows one writer per store and has no `close()`, only `build:graph` opens the file writable and every other entry point (CLI analyze, viewer, tests on the committed store) opens it read-only.
