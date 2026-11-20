// Hidden links: manifest edges static analysis cannot see, and who reads the far side.
MATCH (a:FieldVersion)-[l:LINKED_TO]->(b:FieldVersion)
OPTIONAL MATCH (b)-[:READ_AT]->(u:Usage {inTest: false})
RETURN a.snapshot AS snapshot, a.key AS from, b.key AS to, l.via AS via, b.unit AS toUnit, collect(u.path) AS readBy
ORDER BY snapshot
