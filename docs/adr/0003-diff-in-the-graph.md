# 0003. Base and head snapshots live in one graph, and the diff is a Cypher query

Status: accepted (2026-11-20)

Both snapshots are loaded into the same store with a `snapshot` property on snapshot-scoped nodes, and drift detection is a Cypher match of base and head `FieldVersion` nodes, not a JS object diff. This makes the store larger and every query must filter by snapshot, but the persisted graph then holds the whole review (versions, drift, impact paths, verdicts), so anyone can re-ask the question in Cypher without our code, which is the point of using Relate.
