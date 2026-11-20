// Test files that read the changed field themselves (including through hidden links).
MATCH (:FieldVersion {id: $headId})-[:LINKED_TO*0..2]->(:FieldVersion)-[:READ_AT]->(u:Usage {inTest: true})-[:IN_FILE]->(t:File)
RETURN DISTINCT t.id AS fileId, t.path AS path, t.inDiff AS inDiff, 0 AS hops, [t.path] AS reaches
