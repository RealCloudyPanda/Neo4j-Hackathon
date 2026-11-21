// Every usage the changed field reaches: directly, or through up to two hidden links
// (LINKED_TO, declared in contract-drift.links.json), plus the tagged parameter it flows into.
MATCH (h:FieldVersion {id: $headId})
MATCH p = (h)-[:LINKED_TO*0..2]->(lv:FieldVersion)-[:READ_AT]->(u:Usage)
WHERE u.inTest = false
OPTIONAL MATCH (u)-[:PASSES_TO]->(pm:Param)-[:PARAM_OF]->(fn:Function)
RETURN u.id AS usageId, u.path AS path, u.line AS line, u.code AS code, u.flowNote AS flowNote,
       lv.key AS viaKey, lv[$tag] AS viaTag,
       pm.name AS param, pm[$tag] AS paramTag, pm.line AS paramLine,
       fn.name AS fn, fn.path AS fnPath,
       length(p) AS hops,
       [r IN relationships(p) | type(r)] AS rels,
       [r IN relationships(p) WHERE type(r) = 'LINKED_TO' | r.via] AS linkVia
ORDER BY path, line
