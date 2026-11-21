// Meaning changes between two snapshots, computed inside the graph (ADR 0003).
// Same Field, one FieldVersion per snapshot, compare every meaning tag dynamically.
MATCH (f:Field)<-[:VERSION_OF]-(b:FieldVersion {snapshot: $base})
MATCH (f)<-[:VERSION_OF]-(h:FieldVersion {snapshot: $head})
UNWIND ['unit', 'format', 'tz'] AS tag
WITH f, b, h, tag, b[tag] AS before, h[tag] AS after
WHERE before IS NOT NULL AND (after IS NULL OR before <> after)
RETURN f.key AS key, tag, before, coalesce(after, '<removed>') AS after, b.id AS baseId, h.id AS headId
ORDER BY key, tag
