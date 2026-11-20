// Tests that reach a flagged usage: test files importing (up to 3 hops) the file that holds the usage,
// or importing directly the file of the function the value flows into.
MATCH (d:Drift {id: $driftId})-[:FLAGS]->(u:Usage)
MATCH (u)-[:IN_FILE|PASSES_TO|PARAM_OF*1..3]->(target:File)
MATCH tp = (t:File {snapshot: $head, isTest: true})-[:IMPORTS*1..3]->(target)
WITH t, target, length(tp) AS hops, EXISTS { MATCH (u)-[:IN_FILE]->(target) } AS holdsUsage
WHERE holdsUsage OR hops = 1
WITH t, min(hops) AS hops, collect(DISTINCT target.path) AS reaches
RETURN t.id AS fileId, t.path AS path, t.inDiff AS inDiff, hops, reaches
ORDER BY inDiff, hops, path
